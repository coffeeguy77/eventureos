import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/format";
import { fill, readTemplates, type Template } from "./core";

/** Accounts: what's owing (EventureOS and Xero invoices alike), chasing emails with tracking, and promise-day reminders. */

export const OWING = ["awaiting_payment", "part_paid", "overdue"];
export interface OwingInvoice {
  id: string; number: string; customer_id: string; issue_date: string | null; due_date: string | null; total: number; balance: number; status: string;
  origin: string | null; view_count: number | null; first_viewed_at: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
}

export async function loadOwing(db: SupabaseClient, orgId: string, customerId?: string): Promise<OwingInvoice[]> {
  const cols = "id, number, customer_id, issue_date, due_date, total, balance, status, origin, view_count, first_viewed_at, customer:customers(id, name, email, phone)";
  const run = (c: string) => {
    let q = db.from("invoices").select(c).eq("organisation_id", orgId).in("status", OWING).gt("balance", 0).order("due_date", { ascending: true, nullsFirst: false }).limit(3000);
    if (customerId) q = q.eq("customer_id", customerId);
    return q;
  };
  let { data, error } = await run(cols);
  if (error && /origin|view_count|first_viewed_at/.test(error.message)) ({ data, error } = await run("id, number, customer_id, issue_date, due_date, total, balance, status, customer:customers(id, name, email, phone)"));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OwingInvoice[]).map((i) => ({ ...i, total: Number(i.total), balance: Number(i.balance), origin: i.origin ?? "eventureos", view_count: i.view_count ?? 0, first_viewed_at: i.first_viewed_at ?? null }));
}

/** The chosen template, filled in for an invoice (so it can be checked and changed before it goes). */
export async function draftFor(db: SupabaseClient, orgId: string, invoiceId: string, templateKey: string, extra: { promise_date?: string | null } = {}) {
  const { loadInvoiceForSend, invoiceRecipients, invoiceWords } = await import("@/lib/invoices/deliver");
  const inv = await loadInvoiceForSend(db, invoiceId);
  if (!inv || inv.organisation_id !== orgId) throw new Error("Invoice not found.");
  const to = await invoiceRecipients(db, inv);
  const words: Record<string, string> = { ...(await invoiceWords(db, inv, to)), promise_date: extra.promise_date ? fmtDate(extra.promise_date, "long") : "today" };
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const templates = readTemplates(org?.settings);
  const t: Template = templates.find((x) => x.key === templateKey) ?? templates[0];
  return { to: to.map((r) => r.email), subject: fill(t.subject, words), message: fill(t.message, words), template: t.key, customerId: inv.customer_id, balance: Number(inv.balance) };
}

/** Send a chasing email for one invoice (with its pay link), recorded so opens, clicks and payments after it are counted. */
export async function sendChase(db: SupabaseClient, o: { orgId: string; invoiceId: string; template: string; subject: string; message: string; kind: "manual" | "promise" | "sequence"; sentBy: string | null }) {
  const { loadInvoiceForSend, deliverInvoice } = await import("@/lib/invoices/deliver");
  const inv = await loadInvoiceForSend(db, o.invoiceId);
  if (!inv || inv.organisation_id !== o.orgId) throw new Error("Invoice not found.");
  const { data: row, error } = await db.from("collection_emails").insert({
    organisation_id: o.orgId, customer_id: inv.customer_id, invoice_id: inv.id, kind: o.kind, template: o.template, subject: o.subject.slice(0, 200),
    balance_at_send: Number(inv.balance), sent_by: o.sentBy,
  }).select("id").single();
  if (error) throw new Error(/collection_emails/.test(error.message) ? "Accounts needs the 0072 database update first." : error.message);
  const r = await deliverInvoice(db, inv.id, { kind: `collect_${o.template}`, actor: o.kind === "promise" ? "Promise-day reminder" : "Accounts", subject: o.subject, message: o.message, track: row.id as string });
  if (!r.ok) { await db.from("collection_emails").delete().eq("id", row.id); throw new Error(r.error); }
  await db.from("collection_emails").update({ to_emails: r.to }).eq("id", row.id);
  return { id: row.id as string, to: r.to, via: r.via };
}

/**
 * Promise-day reminders: on the day someone said they'd pay, email them the invoice with its pay link
 * (between 8am and 5pm the business's time; each promise once).
 */
export async function runPromiseReminders(db: SupabaseClient) {
  const cols = "id, organisation_id, customer_id, invoice_id, promise_date, org:organisations(timezone, status, currency)";
  const pick = (c: string) => db.from("collection_notes").select(c).eq("remind", true).is("reminded_at", null).not("promise_date", "is", null).limit(200);
  let { data: due, error } = await pick(`${cols}, charge_card`);
  if (error && /charge_card/.test(error.message)) ({ data: due, error } = await pick(cols));
  if (error) return { skipped: error.message };
  let sent = 0, failed = 0;
  for (const n of (due ?? []) as unknown as { id: string; organisation_id: string; customer_id: string; invoice_id: string | null; promise_date: string; charge_card?: boolean; org: { timezone: string | null; status: string; currency: string | null } | null }[]) {
    if (n.org?.status !== "active") continue;
    const tz = n.org?.timezone || "Australia/Sydney";
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
    if (n.promise_date > today || hour < 8 || hour >= 17) continue;
    // a promise more than 3 days old that was never sent is stale — mark it, don't email out of the blue
    if (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${n.promise_date}T00:00:00Z`) > 3 * 86_400_000) { await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id); continue; }
    try {
      let invoiceId = n.invoice_id;
      if (!invoiceId) invoiceId = (await loadOwing(db, n.organisation_id, n.customer_id))[0]?.id ?? null;
      if (!invoiceId) { await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id); continue; }
      const { data: inv } = await db.from("invoices").select("balance, status").eq("id", invoiceId).maybeSingle();
      if (!inv || Number(inv.balance) <= 0 || !OWING.includes(inv.status as string)) { await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id); continue; }
      // They agreed to have their card on file charged on the day
      if (n.charge_card) {
        try {
          const { loadStripe } = await import("@/lib/payments/service");
          const { chargeCardOnFile } = await import("@/lib/payments/phone");
          const cfg = await loadStripe(db, n.organisation_id);
          if (!cfg) throw new Error("Stripe isn't connected");
          const r = await chargeCardOnFile(db, n.organisation_id, cfg, { customerId: n.customer_id, invoiceIds: [invoiceId], currency: n.org?.currency || "AUD", reason: "Promised payment day", email: null });
          await db.from("collection_notes").insert({ organisation_id: n.organisation_id, customer_id: n.customer_id, invoice_id: invoiceId, kind: "note", created_by: null,
            body: `Promise day: charged ${r.total.toFixed(2)} to the card on file (${r.card.brand ?? "card"} ending ${r.card.last4 ?? "????"}) for ${r.invoices.join(", ")}.` });
          await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id);
          sent++;
          continue;
        } catch (e) {
          // Couldn't charge: email the invoice with its pay link instead, and say why on the account
          await db.from("collection_notes").insert({ organisation_id: n.organisation_id, customer_id: n.customer_id, invoice_id: invoiceId, kind: "note", created_by: null,
            body: `Promise day: couldn't charge the card on file (${e instanceof Error ? e.message : String(e)}) — emailed the invoice with a pay link instead.` }).then(() => undefined, () => undefined);
        }
      }
      const d = await draftFor(db, n.organisation_id, invoiceId, "promise", { promise_date: n.promise_date });
      await sendChase(db, { orgId: n.organisation_id, invoiceId, template: "promise", subject: d.subject, message: d.message, kind: "promise", sentBy: null });
      await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id);
      sent++;
    } catch (e) {
      failed++;
      await db.from("collection_notes").insert({ organisation_id: n.organisation_id, customer_id: n.customer_id, invoice_id: n.invoice_id, kind: "note", created_by: null,
        body: `Promise-day reminder couldn't be sent: ${e instanceof Error ? e.message : String(e)}` }).then(() => undefined, () => undefined);
      await db.from("collection_notes").update({ reminded_at: now.toISOString() }).eq("id", n.id);
    }
  }
  return { sent, failed };
}
