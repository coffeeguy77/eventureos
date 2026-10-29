"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { DEFAULT_FEES, feeDue, feeRateFor, readFees, readTemplates, type FeeSettings, type Template } from "@/lib/accounts/core";
import { money, todayISO } from "@/lib/format";
import { actorName, logActivity } from "@/lib/activity";

/** Accounts: notes, calls, promises and next steps for customers who owe money; chasing emails; templates. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/customer_cards|charge_card/.test(m) && /does not exist|could not find/i.test(m)) return "This needs the 0079 database update first: run supabase/migrations/0079_saved_cards.sql in Supabase (SQL editor).";
  if (/account_issues|account_fees/.test(m) && /does not exist|could not find/i.test(m)) return "This needs the 0078 database update first: run supabase/migrations/0078_accounts_resolution.sql in Supabase (SQL editor).";
  return /collection_notes|collection_emails/.test(m) && /does not exist|could not find/i.test(m) ? "Accounts needs the 0072 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);

async function accounts() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Accounts.");
  return ctx;
}

export interface NoteInput {
  kind: "note" | "call" | "email" | "sms" | "promise" | "dispute" | "plan";
  body?: string | null; invoiceId?: string | null;
  promiseDate?: string | null; promiseAmount?: number | string | null; remind?: boolean;
  nextStep?: string | null; nextStepDue?: string | null;
  /** promise: charge the card on file that morning instead of emailing */
  chargeCard?: boolean;
}

export async function addCollectionNote(customerId: string, n: NoteInput): Promise<R> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const kind = ["note", "call", "email", "sms", "promise", "dispute", "plan"].includes(n.kind) ? n.kind : "note";
    const promiseDate = n.promiseDate && DATE.test(n.promiseDate) ? n.promiseDate : null;
    if (kind === "promise" && !promiseDate) throw new Error("Choose the day they said they'd pay.");
    const amount = n.promiseAmount === "" || n.promiseAmount == null ? null : Math.round(Number(n.promiseAmount) * 100) / 100;
    const row = {
      organisation_id: org.id, customer_id: customerId, invoice_id: n.invoiceId && UUID.test(n.invoiceId) ? n.invoiceId : null, kind, body: t(n.body, 4000),
      promise_date: promiseDate, promise_amount: amount != null && Number.isFinite(amount) && amount > 0 ? amount : null, remind: kind === "promise" && n.remind !== false,
      next_step: t(n.nextStep, 300), next_step_due: n.nextStepDue && DATE.test(n.nextStepDue) ? n.nextStepDue : null, created_by: user.id,
      ...(kind === "promise" && n.chargeCard ? { charge_card: true, remind: true } : {}),
    };
    if (!row.body && !row.next_step && kind !== "promise") throw new Error("Write what happened or the next step.");
    // a new next step replaces the open one
    if (row.next_step) await supabase.from("collection_notes").update({ done_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("customer_id", customerId).not("next_step", "is", null).is("done_at", null);
    const { error } = await supabase.from("collection_notes").insert(row);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function completeStep(noteId: string): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(noteId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("collection_notes").update({ done_at: new Date().toISOString() }).eq("id", noteId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function cancelPromiseReminder(noteId: string): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(noteId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("collection_notes").update({ remind: false }).eq("id", noteId).eq("organisation_id", org.id).is("reminded_at", null);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** The template filled in for an invoice, to check before sending. */
export async function draftChase(invoiceId: string, template: string): Promise<R<{ to: string[]; subject: string; message: string }>> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(invoiceId)) throw new Error("Choose an invoice.");
    const { draftFor } = await import("@/lib/accounts/server");
    const d = await draftFor(supabase, org.id, invoiceId, template);
    return { ok: true, data: { to: d.to, subject: d.subject, message: d.message } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function sendChaseEmail(invoiceId: string, template: string, subject: string, message: string): Promise<R<string>> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(invoiceId)) throw new Error("Choose an invoice.");
    const s = t(subject, 200), m = t(message, 6000);
    if (!s || !m) throw new Error("Add a subject and a message.");
    const { sendChase } = await import("@/lib/accounts/server");
    const r = await sendChase(supabase, { orgId: org.id, invoiceId, template: /^[a-z0-9_-]{2,30}$/.test(template) ? template : "custom", subject: s, message: m, kind: "manual", sentBy: user.id });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Sent to ${r.to.join(", ")}${r.via === "gmail" ? " from your Gmail" : ""}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveTemplates(list: Template[]): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    const clean = readTemplates({ collections: { templates: list } });
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const col = (settings.collections && typeof settings.collections === "object" ? settings.collections : {}) as Record<string, unknown>;
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, collections: { ...col, templates: clean } } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ settings helpers */

async function saveCollections(patch: (col: Record<string, unknown>) => Record<string, unknown>) {
  const { supabase, org } = await accounts();
  const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) throw new Error(e1.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const col = (settings.collections && typeof settings.collections === "object" ? settings.collections : {}) as Record<string, unknown>;
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, collections: patch(col) } }).eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts", "layout");
}

/* ------------------------------------------------------------------ resolution centre */

/** Flag an invoice for a decision: write it off, investigate, or keep chasing. */
export async function flagInvoice(customerId: string, invoiceId: string | null, reason: string): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const why = t(reason, 2000);
    if (!why) throw new Error("Say why it needs a decision (e.g. business closed, no response in 90 days, disputes the work).");
    let amount: number | null = null;
    if (invoiceId) {
      if (!UUID.test(invoiceId)) throw new Error("Choose an invoice.");
      const { data: inv } = await supabase.from("invoices").select("balance, customer_id").eq("id", invoiceId).eq("organisation_id", org.id).maybeSingle();
      if (!inv || inv.customer_id !== customerId) throw new Error("That invoice isn't this customer's.");
      amount = Number(inv.balance);
    }
    const { error } = await supabase.from("account_issues").insert({ organisation_id: org.id, customer_id: customerId, invoice_id: invoiceId || null, reason: why, amount });
    if (error) throw new Error(error.message);
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, invoice_id: invoiceId || null, kind: "note", body: `Flagged for a decision: ${why}` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

const DECISION: Record<string, string> = { investigating: "Investigating", write_off: "Write off", keep_chasing: "Keep chasing", resolved: "Resolved" };

/** Decide what happens to a flagged invoice. */
export async function decideIssue(issueId: string, status: string, note: string): Promise<R> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(issueId)) throw new Error("Refresh and try again.");
    if (!(status in DECISION)) throw new Error("Choose a decision.");
    const n = t(note, 2000);
    if (status === "write_off" && !n) throw new Error("Add a short note on why it's being written off — it's kept with the account.");
    const { data: row, error } = await supabase.from("account_issues").update({ status, decision_note: n, decided_by: user.id, decided_at: new Date().toISOString() })
      .eq("id", issueId).eq("organisation_id", org.id).select("customer_id, invoice_id").single();
    if (error) throw new Error(error.message);
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: row.customer_id, invoice_id: row.invoice_id, kind: "note", body: `Decision: ${DECISION[status]}${n ? ` — ${n}` : ""}` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ account-keeping fees and terms */

export async function saveFeeSettings(input: Omit<FeeSettings, "overrides">): Promise<R> {
  try {
    await saveCollections((col) => {
      const prev = readFees({ collections: col });
      const clean = readFees({ collections: { fees: { ...input, overrides: prev.overrides } } });
      return { ...col, fees: clean };
    });
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** A customer's own monthly rate (null = the standard rate, 0 = never charge them). */
export async function setCustomerFeeRate(customerId: string, rate: number | null): Promise<R> {
  try {
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 20)) throw new Error("Enter a rate from 0 to 20%.");
    await saveCollections((col) => {
      const f = readFees({ collections: col });
      const overrides = { ...f.overrides };
      if (rate == null) delete overrides[customerId]; else overrides[customerId] = Math.round(rate * 1000) / 1000;
      return { ...col, fees: { ...f, overrides } };
    });
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveTerms(text: string): Promise<R> {
  try {
    const clean = typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, 30000) : "";
    await saveCollections((col) => ({ ...col, terms: clean }));
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/**
 * Raise the account-keeping fees owing on a customer's overdue invoices as one draft invoice (checked and sent by you),
 * and record which months were charged so they're never charged twice.
 */
export async function raiseFeeInvoice(customerId: string): Promise<R<{ id: string; number: string; total: number }>> {
  try {
    const { supabase, org, user, profile } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { data: o, error: e1 } = await supabase.from("organisations").select("settings, default_payment_terms_days").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const fees = readFees(o?.settings ?? { collections: { fees: DEFAULT_FEES } });
    if (!fees.enabled) throw new Error("Account-keeping fees are switched off — turn them on in Accounts → Fees & terms.");
    const rate = feeRateFor(fees, customerId);
    if (rate <= 0) throw new Error("This customer is set to no account-keeping fee.");
    const today = todayISO(org.timezone);
    const { loadOwing } = await import("@/lib/accounts/server");
    const owing = (await loadOwing(supabase, org.id, customerId)).filter((i) => i.due_date && i.due_date < today);
    const { data: charged, error: e2 } = await supabase.from("account_fees").select("invoice_id, months").eq("organisation_id", org.id).eq("customer_id", customerId);
    if (e2) throw new Error(e2.message);
    const done = new Map<string, number>();
    for (const c of (charged ?? []) as { invoice_id: string; months: number }[]) done.set(c.invoice_id, (done.get(c.invoice_id) ?? 0) + c.months);
    const due = owing.map((i) => ({ i, f: feeDue(i, today, rate, fees.grace_days, done.get(i.id) ?? 0) })).filter((x) => x.f.amount > 0);
    if (!due.length) throw new Error("No account-keeping fees are owing right now.");
    const lines = due.map(({ i, f }) => ({
      description: `Account-keeping fee — invoice ${i.number} overdue (${money(i.balance, org.currency)} owing): ${rate}% × ${f.months} month${f.months === 1 ? "" : "s"}`,
      quantity: 1, unit_amount: f.amount, tax_rate: fees.gst ? 10 : 0, inc: true as const, ...(fees.account_code ? { account_code: fees.account_code } : {}),
    }));
    const total = Math.round(lines.reduce((a, l) => a + l.unit_amount, 0) * 100) / 100;
    const subtotal = fees.gst ? Math.round((total / 1.1) * 100) / 100 : total;
    const terms = Number(o?.default_payment_terms_days ?? 14) || 14;
    const dueDate = new Date(`${today}T00:00:00Z`); dueDate.setUTCDate(dueDate.getUTCDate() + terms);
    const { data: inv, error } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: customerId, kind: "other", issue_date: today, due_date: dueDate.toISOString().slice(0, 10),
      subtotal, tax_total: Math.round((total - subtotal) * 100) / 100, total, status: "draft", currency: org.currency, created_by: user.id, line_items: lines,
    }).select("id, number").single();
    if (error) throw new Error(`Couldn't create the fee invoice: ${error.message}`);
    const { error: e3 } = await supabase.from("account_fees").insert(due.map(({ i, f }) => ({
      organisation_id: org.id, customer_id: customerId, invoice_id: i.id, fee_invoice_id: inv.id, months: f.months, percent: rate, balance: i.balance, amount: f.amount,
    })));
    if (e3) { await supabase.from("invoices").delete().eq("id", inv.id).eq("organisation_id", org.id); throw new Error(e3.message); }
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "note", body: `Account-keeping fee of ${money(total, org.currency)} raised on ${inv.number} (draft).` });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id, customerId,
      summary: `${actorName(profile)} raised account-keeping fees of ${money(total, org.currency)} on ${inv.number} (draft)`, metadata: { kind: "account_fee", total } });
    revalidatePath("/accounts", "layout");
    revalidatePath("/invoices");
    return { ok: true, data: { id: inv.id as string, number: inv.number as string, total } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ card payments over the phone */

async function stripeFor(orgId: string) {
  const { createServiceClient } = await import("@/lib/integrations/runtime");
  const { loadStripe } = await import("@/lib/payments/service");
  const db = createServiceClient();
  const cfg = await loadStripe(db, orgId);
  if (!cfg) throw new Error("Stripe isn't connected — connect it in Settings → Integrations to take card payments.");
  return { db, cfg };
}

/** Stripe's secure card page for the chosen invoices, to fill in while the customer reads out their card. */
export async function takePhonePayment(customerId: string, invoiceIds: string[], saveCard: boolean): Promise<R<{ url: string; total: number; invoices: string[] }>> {
  try {
    const { org, user, profile } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { db, cfg } = await stripeFor(org.id);
    if (saveCard) {
      const { error } = await db.from("customer_cards").select("id").limit(1);
      if (error) throw new Error("Saving cards needs the 0079 database update first: run supabase/migrations/0079_saved_cards.sql in Supabase (SQL editor). You can still take the payment without saving the card.");
    }
    const { data: c } = await db.from("customers").select("email").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    const { startPhoneCheckout } = await import("@/lib/payments/phone");
    const r = await startPhoneCheckout(db, org.id, cfg, { customerId, invoiceIds, saveCard, staffId: user.id, staffName: profile?.full_name ?? user.email ?? "the team", currency: org.currency, email: (c?.email as string | null) ?? null });
    await db.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "call", created_by: user.id,
      body: `Opened the card payment page over the phone for ${r.invoices.join(", ")}${saveCard ? " (customer agreed to keep the card on file)" : ""}.` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: r };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function chargeSavedCardNow(customerId: string, invoiceIds: string[]): Promise<R<string>> {
  try {
    const { org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { db, cfg } = await stripeFor(org.id);
    const { data: c } = await db.from("customers").select("email").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    const { chargeCardOnFile } = await import("@/lib/payments/phone");
    const r = await chargeCardOnFile(db, org.id, cfg, { customerId, invoiceIds, currency: org.currency, reason: "Charged from Accounts", email: (c?.email as string | null) ?? null });
    await db.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "note", created_by: user.id,
      body: `Charged ${money(r.total, org.currency)} to the card on file (${r.card.brand ?? "card"} ending ${r.card.last4 ?? "????"}) for ${r.invoices.join(", ")}.` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Paid — ${money(r.total, org.currency)} charged to the ${r.card.brand ?? "card"} ending ${r.card.last4 ?? ""} for ${r.invoices.join(", ")}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function removeSavedCard(customerId: string): Promise<R> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("customer_cards").update({ active: false }).eq("organisation_id", org.id).eq("customer_id", customerId).eq("active", true);
    if (error) throw new Error(error.message);
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "note", created_by: user.id, body: "Removed the card on file." });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
