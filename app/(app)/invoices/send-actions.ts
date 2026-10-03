"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { defaultInvoiceMessage, defaultInvoiceSubject, invoiceEmail } from "@/lib/email/invoice-email";
import { appBaseUrl } from "@/lib/integrations/registry";
import { signatureForSend } from "@/lib/signatures/server";
import { fmtDate, money } from "@/lib/format";
import { buildContext } from "@/lib/integrations/sync-runner";
import { buildRawMessage, sendGmail } from "@/lib/integrations/gmail-send";
import { ownAddresses } from "@/lib/integrations/gmail-sync";
import { replyTarget } from "@/lib/email/thread-reply";
import { ApiError, errMessage } from "@/lib/integrations/runtime";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const MAX_RECIPIENTS = 10;

export interface InvoiceRecipient { email: string; name: string | null; label: string }
export interface InvoiceSendSetup {
  suggestions: InvoiceRecipient[];
  defaultTo: InvoiceRecipient[];
  subject: string;
  message: string;
  senderEmail: string;
  businessName: string;
  brand: string | null;
  logoUrl: string | null;
  signature: { html: string; text: string } | null;
  number: string;
  eventLine: string | null;
  total: string;
  amountDue: string;
  paidNote: string | null;
  dueDate: string | null;
  payUrl: string;
  cardPayments: boolean;
  /** A draft gets marked as sent (awaiting payment) when it's emailed */
  isDraft: boolean;
  xeroManaged: boolean;
  emailReady: boolean;
  gmail: string | null;
  resendReady: boolean;
  /** The job's email conversations it can go into as a reply */
  threads: { id: string; subject: string; to: string; lastAt: string | null }[];
}

type Inv = {
  id: string; number: string; status: string; total: number; amount_paid: number; balance: number; due_date: string | null; pay_token: string;
  customer_id: string; event_id: string | null; xero_invoice_id: string | null;
  customer: { name: string; email: string | null; kind: string | null } | null;
  event: { id: string; name: string; event_date: string | null; primary_contact_id: string | null; enquiry_id: string | null } | null;
};

async function load(invoiceId: string) {
  if (!UUID.test(invoiceId)) throw new Error("That invoice link isn't valid.");
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can email invoices.");
  const { data, error } = await ctx.supabase.from("invoices")
    .select("id, number, status, total, amount_paid, balance, due_date, pay_token, customer_id, event_id, xero_invoice_id, customer:customers(name, email, kind), event:events(id, name, event_date, primary_contact_id, enquiry_id)")
    .eq("organisation_id", ctx.org.id).eq("id", invoiceId).maybeSingle();
  if (error) throw new Error(`Couldn't load the invoice: ${error.message}`);
  if (!data) throw new Error("That invoice no longer exists.");
  const inv = data as unknown as Inv;
  if (inv.status === "void") throw new Error(`${inv.number} is void.`);
  return { ...ctx, inv };
}

async function gmailSender(supabase: SupabaseClient, orgId: string, userId: string) {
  try {
    const ctx = await buildContext(supabase, "user", orgId, "gmail", userId);
    const address = (ctx.integration.account_label ?? ctx.integration.external_account_id ?? "").toLowerCase();
    return address && EMAIL.test(address) ? { ctx, address } : null;
  } catch { return null; }
}

/** The job's (and its enquiry's) conversations, newest first */
async function jobThreads(supabase: SupabaseClient, orgId: string, inv: Inv) {
  if (!inv.event) return [] as { id: string; last_message_at: string | null }[];
  const filter = [`event_id.eq.${inv.event.id}`, inv.event.enquiry_id ? `enquiry_id.eq.${inv.event.enquiry_id}` : null].filter(Boolean).join(",");
  const { data } = await supabase.from("email_threads").select("id, last_message_at").eq("organisation_id", orgId).or(filter)
    .neq("classification", "spam").order("last_message_at", { ascending: false }).limit(5);
  return (data ?? []) as { id: string; last_message_at: string | null }[];
}

const stripeOn = async (supabase: SupabaseClient, orgId: string) =>
  (await supabase.from("integrations").select("status").eq("organisation_id", orgId).eq("provider", "stripe").maybeSingle()).data?.status === "connected";

/** Everything the "Email invoice" dialog needs: who to send to (with everyone on the job and in its emails), wording, totals. */
export async function invoiceSendSetup(invoiceId: string): Promise<Result<InvoiceSendSetup>> {
  try {
    const { supabase, org, user, profile, inv } = await load(invoiceId);
    const [{ data: contacts }, { data: jobPeople }, { data: o }, card] = await Promise.all([
      supabase.from("contacts").select("id, first_name, last_name, email, is_primary").eq("organisation_id", org.id).eq("customer_id", inv.customer_id).not("email", "is", null),
      inv.event ? supabase.from("event_contacts").select("contact_id").eq("organisation_id", org.id).eq("event_id", inv.event.id) : Promise.resolve({ data: [] }),
      supabase.from("organisations").select("brand_colour, logo_url").eq("id", org.id).single(),
      stripeOn(supabase, org.id),
    ]);
    const gm = await gmailSender(supabase, org.id, user.id);
    const own = new Set([...(gm ? ownAddresses(gm.ctx) : []), profile.email].map((x) => x.toLowerCase()));

    // People on the job first (ticked), then everyone else at the client and anyone in the job's emails (unticked)
    const seen = new Set<string>();
    const suggestions: InvoiceRecipient[] = [];
    const push = (email: string | null | undefined, name: string | null, label: string) => {
      const e = (email ?? "").trim().toLowerCase();
      if (!EMAIL.test(e) || seen.has(e) || own.has(e)) return;
      seen.add(e); suggestions.push({ email: e, name, label });
    };
    const cs = (contacts ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; is_primary: boolean }[];
    const full = (c: { first_name: string | null; last_name: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
    const onJob = new Set(((jobPeople ?? []) as { contact_id: string }[]).map((r) => r.contact_id));
    if (inv.event?.primary_contact_id) onJob.add(inv.event.primary_contact_id);
    const main = cs.find((c) => c.id === inv.event?.primary_contact_id);
    if (main) push(main.email, full(main), "Main contact for this job");
    for (const c of cs.filter((c) => onJob.has(c.id))) push(c.email, full(c), "On this job");
    const jobEmails = [...suggestions];
    push(inv.customer?.email, inv.customer?.kind === "company" ? null : inv.customer?.name ?? null, "Client's general email");
    for (const c of cs.filter((c) => !onJob.has(c.id)).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) push(c.email, full(c), "Not on this job");

    // Anyone else who's been in the job's email conversations (e.g. someone cc'd who isn't saved as a contact yet)
    const threadRows = await jobThreads(supabase, org.id, inv);
    if (threadRows.length) {
      const { data: msgs } = await supabase.from("email_messages").select("from_email, from_name, to_emails, cc_emails").in("thread_id", threadRows.map((t) => t.id)).limit(200);
      for (const m of (msgs ?? []) as { from_email: string | null; from_name: string | null; to_emails: string[] | null; cc_emails: string[] | null }[]) {
        push(m.from_email, m.from_name, "In the email conversation");
        for (const e of [...(m.to_emails ?? []), ...(m.cc_emails ?? [])]) push(e, null, "In the email conversation");
      }
    }
    const threads: InvoiceSendSetup["threads"] = [];
    if (gm) {
      for (const t of threadRows) {
        const r = await replyTarget(supabase, org.id, t.id, ownAddresses(gm.ctx));
        if (r?.to) threads.push({ id: t.id, subject: r.subject, to: r.to, lastAt: t.last_message_at });
      }
    }

    let signature: InvoiceSendSetup["signature"] = null;
    try { const s = await signatureForSend(supabase, org.id, user.id, null); if (s) signature = { html: s.html, text: s.text }; } catch { /* none */ }
    const first = jobEmails[0] ?? suggestions[0];
    const firstName = (first?.name ?? (inv.customer?.kind === "company" ? null : inv.customer?.name) ?? "").split(" ")[0] || null;
    const eventDate = inv.event?.event_date ? fmtDate(inv.event.event_date, "long") : null;
    const dueDate = inv.due_date ? fmtDate(inv.due_date, "long") : null;
    const amountDue = money(inv.balance, org.currency, { cents: true });
    const orgRow = o as { brand_colour: string | null; logo_url: string | null } | null;
    return {
      ok: true,
      data: {
        suggestions,
        defaultTo: jobEmails.length ? jobEmails : first ? [first] : [],
        subject: defaultInvoiceSubject({ businessName: org.name, invoiceNumber: inv.number, eventName: inv.event?.name }),
        message: defaultInvoiceMessage({ firstName, eventName: inv.event?.name ?? null, eventDate, dueDate, amountDue, cardPayments: card, senderFirstName: profile.full_name?.split(" ")[0] ?? null }),
        senderEmail: profile.email,
        businessName: org.name,
        brand: orgRow?.brand_colour ?? null,
        logoUrl: orgRow?.logo_url ?? null,
        signature,
        number: inv.number,
        eventLine: inv.event ? [inv.event.name, eventDate].filter(Boolean).join(" · ") : null,
        total: money(inv.total, org.currency, { cents: true }),
        amountDue,
        paidNote: Number(inv.amount_paid) > 0 ? `${money(inv.amount_paid, org.currency, { cents: true })} of ${money(inv.total, org.currency, { cents: true })} already paid` : null,
        dueDate,
        payUrl: `${appBaseUrl()}/pay/${inv.pay_token}`,
        cardPayments: card,
        isDraft: inv.status === "draft",
        xeroManaged: !!inv.xero_invoice_id,
        emailReady: Boolean(gm) || emailConfigured(),
        gmail: gm?.address ?? null,
        resendReady: emailConfigured(),
        threads,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't prepare the email." };
  }
}

export interface SendInvoiceInput {
  recipients: { email: string; name?: string | null }[];
  subject: string;
  message: string;
  includeSignature: boolean;
  copyMe: boolean;
  saveContacts: boolean;
  via: "gmail" | "resend";
  replyThreadId?: string | null;
}
export interface SendInvoiceResult { sent: string[]; failed: { email: string; error: string }[]; markedSent: boolean }

/** Email the invoice with a cover message. Everyone chosen gets it (one email from Gmail, so they can see each other). */
export async function sendInvoiceEmail(invoiceId: string, input: SendInvoiceInput): Promise<Result<SendInvoiceResult>> {
  try {
    const via = input.via === "gmail" ? "gmail" : "resend";
    if (via === "resend" && !emailConfigured()) throw new Error("Email sending isn't set up (RESEND_API_KEY is missing in Vercel).");
    const seen = new Set<string>();
    const recipients: { email: string; name: string | null }[] = [];
    for (const r of input.recipients ?? []) {
      const email = String(r.email ?? "").trim().toLowerCase();
      if (!email) continue;
      if (!EMAIL.test(email) || email.length > 254) throw new Error(`“${email}” isn't a valid email address.`);
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email, name: String(r.name ?? "").replace(/[\r\n<>"]+/g, " ").trim().slice(0, 120) || null });
    }
    if (!recipients.length) throw new Error("Add at least one email address to send to.");
    if (recipients.length > MAX_RECIPIENTS) throw new Error(`You can send to up to ${MAX_RECIPIENTS} people at once.`);
    const subject = String(input.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const message = String(input.message ?? "").replace(/\r\n/g, "\n").trim();
    if (!message) throw new Error("Add a message.");
    if (message.length > 5000) throw new Error("Please keep the message under 5,000 characters.");

    const { supabase, org, user, profile, inv } = await load(invoiceId);
    if (Number(inv.balance) <= 0) throw new Error(`Nothing is owing on ${inv.number}.`);
    const gm = via === "gmail" ? await gmailSender(supabase, org.id, user.id) : null;
    if (via === "gmail" && !gm) throw new Error("Gmail isn't connected (or needs reconnecting in Settings → Integrations). Choose “EventureOS” to send without it.");
    let target: Awaited<ReturnType<typeof replyTarget>> = null;
    if (input.replyThreadId) {
      if (!gm) throw new Error("Replying in an email conversation needs Gmail connected.");
      if (!UUID.test(input.replyThreadId)) throw new Error("That email conversation isn't valid.");
      const allowed = await jobThreads(supabase, org.id, inv);
      if (!allowed.some((t) => t.id === input.replyThreadId)) throw new Error("That email conversation isn't linked to this invoice's job.");
      target = await replyTarget(supabase, org.id, input.replyThreadId, ownAddresses(gm.ctx));
      if (!target) throw new Error("That email conversation couldn't be found.");
    }
    const sendSubject = target ? target.subject : subject;
    if (!sendSubject) throw new Error("Add a subject.");

    // A draft can't be paid online — emailing it makes it "awaiting payment" (Xero invoices: approve in Xero)
    let markedSent = false;
    if (inv.status === "draft" && !inv.xero_invoice_id) {
      const { error } = await supabase.from("invoices").update({ status: "awaiting_payment" }).eq("id", inv.id).eq("organisation_id", org.id).eq("status", "draft");
      if (error) throw new Error(`Couldn't mark the invoice as sent: ${error.message}`);
      markedSent = true;
    }

    let sig: { html: string; text: string; version: number } | null = null;
    if (input.includeSignature) {
      const s = await signatureForSend(supabase, org.id, user.id, null).catch(() => null);
      if (s) sig = { html: s.html, text: s.text, version: s.version };
    }
    const { data: o } = await supabase.from("organisations").select("brand_colour, logo_url, contact_email").eq("id", org.id).single();
    const orgRow = o as { brand_colour: string | null; logo_url: string | null; contact_email: string | null } | null;
    const card = await stripeOn(supabase, org.id);
    const m = invoiceEmail({
      businessName: org.name, logoUrl: orgRow?.logo_url, brand: orgRow?.brand_colour, invoiceNumber: inv.number,
      eventLine: inv.event ? [inv.event.name, inv.event.event_date ? fmtDate(inv.event.event_date, "long") : null].filter(Boolean).join(" · ") : null,
      total: money(inv.total, org.currency, { cents: true }), amountDue: money(inv.balance, org.currency, { cents: true }),
      paidNote: Number(inv.amount_paid) > 0 ? `${money(inv.amount_paid, org.currency, { cents: true })} of ${money(inv.total, org.currency, { cents: true })} already paid` : null,
      dueDate: inv.due_date ? fmtDate(inv.due_date, "long") : null, message, url: `${appBaseUrl()}/pay/${inv.pay_token}`, cardPayments: card,
      signatureHtml: sig?.html ?? null, signatureText: sig?.text ?? null,
    });
    const fromName = profile.full_name ? `${profile.full_name} · ${org.name}` : org.name;
    const replyTo = gm ? null : profile.email || orgRow?.contact_email || null;
    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    if (gm) {
      // One email to everyone chosen (an invoice has no personal links)
      const raw = buildRawMessage({ from: gm.address, fromName, to: recipients.map((r) => r.email), subject: sendSubject, text: m.text, html: m.html,
        ...(target ? { inReplyTo: target.inReplyTo, references: target.references } : {}) });
      try {
        let res: Awaited<ReturnType<typeof sendGmail>>;
        try { res = await sendGmail(gm.ctx, raw, target?.thread.gmail_thread_id ?? null); }
        catch (e) {
          if (target?.thread.gmail_thread_id && e instanceof ApiError && (e.status === 404 || e.status === 400)) res = await sendGmail(gm.ctx, raw, null);
          else throw e;
        }
        sent.push(...recipients.map((r) => r.email));
        if (target) {
          const now = new Date().toISOString();
          await supabase.from("email_messages").insert({
            organisation_id: org.id, thread_id: target.thread.id, gmail_message_id: res.id, rfc_message_id: res.messageId ?? null,
            direction: "outbound", from_email: gm.address, from_name: fromName, to_emails: recipients.map((r) => r.email), subject: sendSubject,
            snippet: message.replace(/\s+/g, " ").slice(0, 280), body_text: m.text, body_html: m.html, signature_version: sig?.version ?? null,
            sent_at: now, is_read: true, sent_by: user.id,
          });
          await supabase.from("email_threads").update({ gmail_thread_id: res.threadId, state: "awaiting_customer", last_message_at: now, message_count: target.thread.message_count + 1 }).eq("id", target.thread.id);
        }
      } catch (e) {
        for (const r of recipients) failed.push({ email: r.email, error: `Gmail: ${errMessage(e)}`.slice(0, 500) });
      }
    } else {
      const list = [...recipients, ...(input.copyMe && !seen.has(profile.email.toLowerCase()) ? [{ email: profile.email.toLowerCase(), name: profile.full_name, copy: true }] : [])];
      for (const r of list) {
        try {
          await sendEmail({ to: r.email, subject: "copy" in r ? `[Copy] ${sendSubject}` : sendSubject, html: m.html, text: m.text, replyTo, fromName: org.name });
          if (!("copy" in r)) sent.push(r.email);
        } catch (e) { failed.push({ email: r.email, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }); }
      }
    }

    // Remember new addresses on the client, and put everyone it went to on the job
    if (sent.length) {
      if (input.saveContacts) {
        const { data: existing } = await supabase.from("contacts").select("email").eq("organisation_id", org.id).eq("customer_id", inv.customer_id);
        const known = new Set([...(existing ?? []).map((c: { email: string | null }) => (c.email ?? "").toLowerCase()), (inv.customer?.email ?? "").toLowerCase()]);
        const add = recipients.filter((r) => sent.includes(r.email) && !known.has(r.email)).map((r) => {
          const [firstN, ...rest] = (r.name ?? r.email.split("@")[0]).split(" ");
          return { organisation_id: org.id, customer_id: inv.customer_id, first_name: firstN.slice(0, 80), last_name: rest.join(" ").slice(0, 80) || null, email: r.email, is_primary: false, created_by: user.id };
        });
        if (add.length) await supabase.from("contacts").insert(add);
      }
      if (inv.event) {
        const { data: people } = await supabase.from("contacts").select("id, email").eq("organisation_id", org.id).eq("customer_id", inv.customer_id).not("email", "is", null);
        const links = ((people ?? []) as { id: string; email: string }[]).filter((c) => sent.includes(c.email.toLowerCase())).map((c) => ({ organisation_id: org.id, event_id: inv.event!.id, contact_id: c.id }));
        if (links.length) await supabase.from("event_contacts").upsert(links, { onConflict: "event_id,contact_id", ignoreDuplicates: true });
      }
    }

    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "invoice.emailed", entityType: "invoice", entityId: inv.id, customerId: inv.customer_id, eventId: inv.event_id,
      summary: sent.length
        ? `${actorName(profile)} emailed ${inv.number} (${money(inv.balance, org.currency)} due) to ${sent.join(", ")}${gm ? ` from ${gm.address}` : ""}${target ? ` as a reply to “${(target.thread.subject ?? "").slice(0, 60)}”` : ""}${markedSent ? " — marked as awaiting payment" : ""}`
        : `${actorName(profile)} tried to email ${inv.number} — it failed`,
    });
    revalidatePath(`/invoices/${inv.id}`);
    revalidatePath("/invoices");
    if (inv.event_id) revalidatePath(`/events/${inv.event_id}`);
    if (!sent.length && failed.length) {
      if (markedSent) await supabase.from("invoices").update({ status: "draft" }).eq("id", inv.id).eq("organisation_id", org.id);
      return { ok: false, error: `The email didn't send: ${failed[0].error}` };
    }
    return { ok: true, data: { sent, failed, markedSent } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't send the invoice." };
  }
}
