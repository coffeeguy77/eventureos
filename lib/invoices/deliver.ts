import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceEmail } from "@/lib/email/invoice-email";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fmtDate, money } from "@/lib/format";

/**
 * Email an invoice without anyone at a screen: the automatic invoice when a quote is accepted, and payment reminders.
 * Goes from the business's Gmail when it's connected (as a reply in the job's email conversation when there is one),
 * otherwise through EventureOS's own email. To the job's main contact and the client's people on the job, else the
 * client's email. Records it on the invoice (emailed / reminders) and in the activity log.
 */
export interface DeliverInput {
  subject: string;
  message: string;
  /** Activity log wording, e.g. "Automation" / "Payment reminder" */
  actor: string;
  /** "invoice" (first email) or a reminder key, e.g. "pre_7", "overdue_1" */
  kind: string;
  /** Accounts: the collection email this is, so opens and pay-link clicks are counted */
  track?: string;
}
export type DeliverResult = { ok: true; to: string[]; via: "gmail" | "email" } | { ok: false; error: string };

type Inv = {
  id: string; number: string; organisation_id: string; customer_id: string; event_id: string | null; status: string; total: number; amount_paid: number; balance: number;
  due_date: string | null; pay_token: string; reminders?: unknown; email_count?: number;
  customer: { name: string; email: string | null; kind: string | null } | null;
  event: { id: string; name: string; event_date: string | null; primary_contact_id: string | null; enquiry_id: string | null; assigned_to: string | null } | null;
};

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;

export async function loadInvoiceForSend(db: SupabaseClient, invoiceId: string) {
  const cols = "id, number, organisation_id, customer_id, event_id, status, total, amount_paid, balance, due_date, pay_token, customer:customers(name, email, kind), event:events(id, name, event_date, primary_contact_id, enquiry_id, assigned_to)";
  let { data, error } = await db.from("invoices").select(`${cols}, reminders, email_count`).eq("id", invoiceId).maybeSingle();
  if (error && /reminders|email_count/.test(error.message)) ({ data, error } = await db.from("invoices").select(cols).eq("id", invoiceId).maybeSingle());
  if (error) throw new Error(error.message);
  return data as unknown as Inv | null;
}

/** Who an automatic email goes to: the job's main contact and the client's people on the job, else the client's email. */
export async function invoiceRecipients(db: SupabaseClient, inv: Inv) {
  const out: { email: string; name: string | null }[] = [];
  const add = (email: string | null | undefined, name: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (EMAIL.test(e) && !out.some((x) => x.email === e)) out.push({ email: e, name });
  };
  if (inv.event) {
    const ids = new Set<string>();
    if (inv.event.primary_contact_id) ids.add(inv.event.primary_contact_id);
    const { data: links } = await db.from("event_contacts").select("contact_id").eq("event_id", inv.event.id);
    for (const l of (links ?? []) as { contact_id: string }[]) ids.add(l.contact_id);
    if (ids.size) {
      const { data: cs } = await db.from("contacts").select("id, first_name, last_name, email").in("id", [...ids]);
      const list = (cs ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[];
      list.sort((a, b) => (a.id === inv.event!.primary_contact_id ? -1 : b.id === inv.event!.primary_contact_id ? 1 : 0));
      for (const c of list) add(c.email, [c.first_name, c.last_name].filter(Boolean).join(" ") || null);
    }
  }
  if (!out.length) add(inv.customer?.email, inv.customer?.kind === "company" ? null : inv.customer?.name ?? null);
  return out.slice(0, 5);
}

/** Words available in the messages: {first_name} {event} {event_date} {invoice} {amount} {due_date} {business} {days} */
export function fillTemplate(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

export async function invoiceWords(db: SupabaseClient, inv: Inv, recipients: { name: string | null }[]) {
  const { data: org } = await db.from("organisations").select("name, currency, timezone").eq("id", inv.organisation_id).single();
  const cur = (org?.currency as string) || "AUD";
  const firstName = (recipients[0]?.name ?? (inv.customer?.kind === "company" ? null : inv.customer?.name) ?? "").split(" ")[0] || "there";
  const tz = (org?.timezone as string) || "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const days = inv.event?.event_date ? Math.round((Date.parse(`${inv.event.event_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  return {
    first_name: firstName, event: inv.event?.name ?? "your event", event_date: inv.event?.event_date ? fmtDate(inv.event.event_date, "long") : "the day",
    invoice: inv.number, amount: money(inv.balance, cur, { cents: true }), due_date: inv.due_date ? fmtDate(inv.due_date, "long") : "now",
    business: (org?.name as string) ?? "", days: days == null ? "" : String(days),
    days_overdue: inv.due_date && inv.due_date < today ? String(Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${inv.due_date}T00:00:00Z`)) / 86400000)) : "0",
  };
}

export async function deliverInvoice(db: SupabaseClient, invoiceId: string, input: DeliverInput): Promise<DeliverResult> {
  const inv = await loadInvoiceForSend(db, invoiceId);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "void") return { ok: false, error: `${inv.number} is void.` };
  if (Number(inv.balance) <= 0) return { ok: false, error: `Nothing is owing on ${inv.number}.` };
  const to = await invoiceRecipients(db, inv);
  if (!to.length) return { ok: false, error: "The client has no email address." };

  const [{ data: org }, { data: stripe }] = await Promise.all([
    db.from("organisations").select("name, currency, brand_colour, logo_url, contact_email").eq("id", inv.organisation_id).single(),
    db.from("integrations").select("status").eq("organisation_id", inv.organisation_id).eq("provider", "stripe").maybeSingle(),
  ]);
  const o = org as { name: string; currency: string | null; brand_colour: string | null; logo_url: string | null; contact_email: string | null };
  const cur = o.currency || "AUD";
  // The job lead's signature (else none)
  let sig: { html: string; text: string } | null = null;
  if (inv.event?.assigned_to) {
    try { const { signatureForSend } = await import("@/lib/signatures/server"); const s = await signatureForSend(db, inv.organisation_id, inv.event.assigned_to, null); if (s) sig = { html: s.html, text: s.text }; } catch { /* none */ }
  }
  const m = invoiceEmail({
    businessName: o.name, logoUrl: o.logo_url, brand: o.brand_colour, invoiceNumber: inv.number,
    eventLine: inv.event ? [inv.event.name, inv.event.event_date ? fmtDate(inv.event.event_date, "long") : null].filter(Boolean).join(" · ") : null,
    total: money(inv.total, cur, { cents: true }), amountDue: money(inv.balance, cur, { cents: true }),
    paidNote: Number(inv.amount_paid) > 0 ? `${money(inv.amount_paid, cur, { cents: true })} of ${money(inv.total, cur, { cents: true })} already paid` : null,
    dueDate: inv.due_date ? fmtDate(inv.due_date, "long") : null, message: input.message, url: `${appBaseUrl()}/pay/${inv.pay_token}${input.track ? `?ce=${input.track}` : ""}`,
    cardPayments: (stripe as { status?: string } | null)?.status === "connected", signatureHtml: sig?.html ?? null, signatureText: sig?.text ?? null,
  });

  // a tiny image that tells us the email was opened (most email apps load it; some block images, so opens are a lower bound)
  if (input.track && /^[0-9a-f-]{36}$/i.test(input.track)) m.html = m.html.replace(/<\/body>/i, `<img src="${appBaseUrl()}/api/t/o/${input.track}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" /></body>`);
  let via: "gmail" | "email" | null = null;
  // Gmail first (it's from the business's own address, and lands in the job's conversation)
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(db, "service", inv.organisation_id, "gmail", null);
    const { buildRawMessage, sendGmail } = await import("@/lib/integrations/gmail-send");
    const { ownAddresses } = await import("@/lib/integrations/gmail-sync");
    const { replyTarget } = await import("@/lib/email/thread-reply");
    const own = ownAddresses(ctx);
    const from = (ctx.integration.account_label ?? ctx.integration.external_account_id ?? own[0] ?? "").toLowerCase();
    if (!from.includes("@")) throw new Error("no gmail address");
    let target: Awaited<ReturnType<typeof replyTarget>> = null;
    if (inv.event) {
      const filter = [`event_id.eq.${inv.event.id}`, inv.event.enquiry_id ? `enquiry_id.eq.${inv.event.enquiry_id}` : null].filter(Boolean).join(",");
      const { data: th } = await db.from("email_threads").select("id").eq("organisation_id", inv.organisation_id).or(filter).neq("classification", "spam").order("last_message_at", { ascending: false }).limit(1);
      if (th?.[0]) target = await replyTarget(db, inv.organisation_id, th[0].id as string, own).catch(() => null);
    }
    const raw = buildRawMessage({ from, fromName: o.name, to: to.map((r) => r.email), subject: target ? target.subject : input.subject, text: m.text, html: m.html,
      ...(target ? { inReplyTo: target.inReplyTo, references: target.references } : {}) });
    let res: Awaited<ReturnType<typeof sendGmail>>;
    try { res = await sendGmail(ctx, raw, target?.thread.gmail_thread_id ?? null); }
    catch { res = await sendGmail(ctx, buildRawMessage({ from, fromName: o.name, to: to.map((r) => r.email), subject: input.subject, text: m.text, html: m.html }), null); target = null; }
    if (target) {
      const now = new Date().toISOString();
      await db.from("email_messages").insert({
        organisation_id: inv.organisation_id, thread_id: target.thread.id, gmail_message_id: res.id, rfc_message_id: res.messageId ?? null, direction: "outbound",
        from_email: from, from_name: o.name, to_emails: to.map((r) => r.email), subject: target.subject, snippet: input.message.replace(/\s+/g, " ").slice(0, 280),
        body_text: m.text, body_html: m.html, sent_at: now, is_read: true,
      });
      await db.from("email_threads").update({ gmail_thread_id: res.threadId, state: "awaiting_customer", last_message_at: now, message_count: target.thread.message_count + 1 }).eq("id", target.thread.id);
    }
    via = "gmail";
  } catch {
    if (!emailConfigured()) return { ok: false, error: "Gmail isn't connected and EventureOS email isn't set up." };
    try {
      for (const r of to) await sendEmail({ to: r.email, subject: input.subject, html: m.html, text: m.text, replyTo: o.contact_email, fromName: o.name, orgId: inv.organisation_id });
      via = "email";
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  // Record it: emailed (first invoice email) or which reminder went out
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { email_count: Number(inv.email_count ?? 0) + 1 };
  if (input.kind === "invoice") patch.emailed_at = now;
  else patch.reminders = [...(Array.isArray(inv.reminders) ? inv.reminders : []), { key: input.kind, kind: input.kind.startsWith("pre") ? "pre_event" : "overdue", at: now, to: to.map((r) => r.email) }];
  if (inv.status === "draft") patch.status = "awaiting_payment";
  const { error: uErr } = await db.from("invoices").update(patch).eq("id", inv.id);
  if (uErr && /emailed_at|email_count|reminders/.test(uErr.message)) await db.from("invoices").update(inv.status === "draft" ? { status: "awaiting_payment" } : {}).eq("id", inv.id);
  await db.from("activity_logs").insert({
    organisation_id: inv.organisation_id, actor_type: "system", actor_label: input.actor, action: input.kind === "invoice" ? "invoice.emailed" : "invoice.reminder_sent",
    entity_type: "invoice", entity_id: inv.id, customer_id: inv.customer_id, event_id: inv.event_id,
    summary: `${input.actor}: ${input.kind === "invoice" ? `emailed ${inv.number}` : `payment reminder for ${inv.number}`} (${money(inv.balance, cur)} due) to ${to.map((r) => r.email).join(", ")}${via === "gmail" ? " from Gmail" : ""}`,
  });
  return { ok: true, to: to.map((r) => r.email), via };
}
