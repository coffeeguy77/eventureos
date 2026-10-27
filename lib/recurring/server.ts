import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { xeroDate, xeroGet } from "@/lib/integrations/xero";
import { todayISO } from "@/lib/format";
import { advance, categoryFor, dueDate, linesFromXero, linesTotal, scheduleFromXero, sendModeFromXero, type DueType, type Line, type Unit, type XeroRepeating } from "./core";

/**
 * Recurring invoices (server side): import Xero's repeating invoices, and raise each invoice on its date.
 * Imported ones start paused — Xero is still raising them until you remove them there.
 */

export async function importRepeatingFromXero(ctx: SyncContext) {
  const db = ctx.db, orgId = ctx.org.id;
  let r: { RepeatingInvoices?: XeroRepeating[] };
  try { r = await xeroGet<{ RepeatingInvoices?: XeroRepeating[] }>(ctx, "/RepeatingInvoices"); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(/401|403|scope|unauthori[sz]ed/i.test(m) ? `Xero didn't allow reading repeating invoices (${m}). Reconnect Xero in Settings → Integrations and try again.` : m);
  }
  const list = (r.RepeatingInvoices ?? []).filter((x) => (x.Type ?? "ACCREC") === "ACCREC" && x.Status !== "DELETED" && x.Contact?.ContactID);
  const contactIds = [...new Set(list.map((x) => x.Contact!.ContactID))];
  const cust = new Map<string, string>();
  for (let k = 0; k < contactIds.length; k += 100) {
    const { data } = await db.from("customers").select("id, xero_contact_id").eq("organisation_id", orgId).in("xero_contact_id", contactIds.slice(k, k + 100));
    for (const c of data ?? []) cust.set(c.xero_contact_id as string, c.id as string);
  }
  const { data: have } = await db.from("recurring_invoices").select("xero_repeating_id").eq("organisation_id", orgId).not("xero_repeating_id", "is", null);
  const already = new Set((have ?? []).map((h) => h.xero_repeating_id as string));
  const { data: integ } = await db.from("integrations").select("settings").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
  const accountNames = ((integ?.settings as { account_names?: Record<string, string> } | null)?.account_names) ?? {};
  const { data: hosts } = await db.from("hosting_accounts").select("id, billing_reference").eq("organisation_id", orgId).not("billing_reference", "is", null).then((x) => x, () => ({ data: [] as { id: string; billing_reference: string }[] }));
  const hostByRef = new Map(((hosts ?? []) as { id: string; billing_reference: string }[]).map((h) => [h.billing_reference.trim(), h.id]));
  const rows = [];
  const unmatched: string[] = [];
  for (const x of list) {
    if (already.has(x.RepeatingInvoiceID)) continue;
    const customerId = cust.get(x.Contact!.ContactID);
    if (!customerId) { unmatched.push(x.Contact?.Name ?? x.Contact!.ContactID); continue; }
    const lines = linesFromXero(x);
    const sch = scheduleFromXero(x, xeroDate);
    if (!sch.next_date || !lines.length) { unmatched.push(`${x.Contact?.Name ?? "?"} (no date or lines)`); continue; }
    const category = categoryFor(lines, accountNames);
    const ref = x.Reference?.trim().slice(0, 255) || null;
    rows.push({
      organisation_id: orgId, customer_id: customerId, name: (lines[0]?.description.split("\n")[0] || x.Contact?.Name || "Repeating invoice").slice(0, 120),
      category, status: "paused", source: "xero", xero_repeating_id: x.RepeatingInvoiceID, xero_status: x.Status ?? null,
      every: sch.every, unit: sch.unit, anchor_day: sch.anchor_day, next_date: sch.next_date, end_date: sch.end_date, due_type: sch.due_type, due_days: sch.due_days,
      send_mode: sendModeFromXero(x), reference: ref, line_items: lines, total: linesTotal(lines), hosting_account_id: ref ? hostByRef.get(ref) ?? null : null, created_by: null,
    });
  }
  for (let k = 0; k < rows.length; k += 100) { const { error } = await db.from("recurring_invoices").insert(rows.slice(k, k + 100)); if (error) throw new Error(error.message); }
  return { found: list.length, imported: rows.length, skipped: list.length - rows.length - unmatched.length, unmatched };
}

type Rec = { id: string; organisation_id: string; customer_id: string; name: string; status: string; every: number; unit: Unit; anchor_day: number | null; next_date: string; end_date: string | null; due_type: DueType; due_days: number; send_mode: "draft" | "authorise" | "email"; reference: string | null; line_items: Line[]; total: number };

/** Raise one invoice for a recurring invoice on its date, then move it to the next date. */
export async function raiseOne(db: SupabaseClient, rec: Rec, org: { id: string; currency: string; timezone: string }, actorId: string | null = null) {
  const lines = Array.isArray(rec.line_items) ? rec.line_items : [];
  const total = linesTotal(lines);
  if (!(total > 0)) throw new Error("No amount to invoice.");
  let subtotal = 0;
  for (const l of lines) { const g = Math.round(Number(l.quantity) * Number(l.unit_amount) * 100) / 100; subtotal += l.tax_rate ? Math.round((g / 1.1) * 100) / 100 : g; }
  subtotal = Math.round(subtotal * 100) / 100;
  const issue = rec.next_date;
  const { data: inv, error } = await db.from("invoices").insert({
    organisation_id: rec.organisation_id, customer_id: rec.customer_id, kind: "full", status: rec.send_mode === "draft" ? "draft" : "awaiting_payment",
    issue_date: issue, due_date: dueDate(issue, rec.due_type, rec.due_days), subtotal, tax_total: Math.round((total - subtotal) * 100) / 100, total, currency: org.currency,
    reference: rec.reference, line_items: lines.map((l) => ({ ...l, line_amount: Math.round(Number(l.quantity) * Number(l.unit_amount) * 100) / 100, inc: true })), recurring_id: rec.id, created_by: actorId,
  }).select("id, number").single();
  // already raised for this date (a second run) — just move on
  if (error && !/invoices_recurring_once|duplicate key/.test(error.message)) throw new Error(error.message);
  const next = advance(issue, rec.every, rec.unit, rec.anchor_day);
  const ended = !!rec.end_date && next > rec.end_date;
  await db.from("recurring_invoices").update({ next_date: next, status: ended ? "ended" : rec.status, last_invoice_id: inv?.id ?? null, last_raised_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", rec.id);
  if (inv && rec.send_mode === "email") {
    try {
      const { deliverInvoice, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("@/lib/invoices/deliver");
      const { defaultInvoiceMessage, defaultInvoiceSubject } = await import("@/lib/email/invoice-email");
      const full = await loadInvoiceForSend(db, inv.id as string);
      if (full) {
        const w = await invoiceWords(db, full, await invoiceRecipients(db, full));
        const { data: stripe } = await db.from("integrations").select("status").eq("organisation_id", rec.organisation_id).eq("provider", "stripe").maybeSingle();
        await deliverInvoice(db, inv.id as string, {
          kind: "invoice", actor: "Recurring invoice",
          subject: defaultInvoiceSubject({ businessName: w.business, invoiceNumber: full.number, eventName: null }),
          message: defaultInvoiceMessage({ firstName: w.first_name === "there" ? null : w.first_name, eventName: null, eventDate: null, dueDate: full.due_date ? w.due_date : null, amountDue: w.amount, cardPayments: stripe?.status === "connected", senderFirstName: w.business }),
        });
      }
    } catch (e) { await db.from("recurring_invoices").update({ last_error: `Raised, but the email failed: ${e instanceof Error ? e.message : e}`.slice(0, 500) }).eq("id", rec.id); }
  }
  return { invoice: inv as { id: string; number: string } | null, next, ended };
}

/** The daily run: every active recurring invoice whose date has come (one invoice each per run). */
export async function raiseDue(db: SupabaseClient) {
  const { data, error } = await db.from("recurring_invoices").select("*, organisations!inner(id, currency, timezone, status)").eq("status", "active").lte("next_date", new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)).limit(500);
  if (error) return { error: error.message };
  let raised = 0;
  const problems: string[] = [];
  for (const row of (data ?? []) as (Rec & { organisations: { id: string; currency: string; timezone: string; status: string } })[]) {
    const org = row.organisations;
    if (org.status !== "active") continue;
    if (row.next_date > todayISO(org.timezone)) continue;
    try { const r = await raiseOne(db, row, org); if (r.invoice) raised++; }
    catch (e) { const m = e instanceof Error ? e.message : String(e); problems.push(`${row.name}: ${m}`); await db.from("recurring_invoices").update({ last_error: m.slice(0, 500) }).eq("id", row.id); }
  }
  return { raised, problems };
}
