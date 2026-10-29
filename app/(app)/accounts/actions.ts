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

/* ------------------------------------------------------------------ account statements */

/** A link to the customer's statement (to text or paste into an email). */
export async function statementLink(customerId: string): Promise<R<string>> {
  try {
    const { org } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { statementUrl } = await import("@/lib/accounts/statement");
    return { ok: true, data: statementUrl(org.id, customerId) };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Email the customer their account statement — every invoice owing, pay all or some — tracked like a chasing email. */
export async function sendStatement(customerId: string, message: string): Promise<R<string>> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const [{ data: c }, { data: o }] = await Promise.all([
      db.from("customers").select("name, email").eq("id", customerId).eq("organisation_id", org.id).maybeSingle(),
      db.from("organisations").select("name, logo_url, brand_colour, contact_email").eq("id", org.id).single(),
    ]);
    if (!c) throw new Error("Customer not found.");
    const { data: people } = await db.from("contacts").select("email, is_primary").eq("organisation_id", org.id).eq("customer_id", customerId).not("email", "is", null).order("is_primary", { ascending: false }).limit(1);
    const to = (c.email as string | null) || ((people?.[0] as { email: string } | undefined)?.email ?? null);
    if (!to) throw new Error("There's no email address for this customer.");
    const { loadOwing } = await import("@/lib/accounts/server");
    const today = todayISO(org.timezone);
    const owing = await loadOwing(db, org.id, customerId);
    if (!owing.length) throw new Error("Nothing is owing — there's no statement to send.");
    const { data: row, error } = await db.from("collection_emails").insert({ organisation_id: org.id, customer_id: customerId, invoice_id: null, kind: "manual", template: "statement",
      subject: `Your account statement — ${o?.name ?? org.name}`, to_emails: [to], balance_at_send: owing.reduce((a, i) => a + i.balance, 0), sent_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    const { statementUrl } = await import("@/lib/accounts/statement");
    const url = statementUrl(org.id, customerId, row.id as string);
    const { statementEmail } = await import("@/lib/email/templates");
    const { daysBetween } = await import("@/lib/accounts/core");
    const first = String(c.name).split(/\s+/)[0];
    const msg = t(message, 4000) ?? `Hi ${first},\n\nHere's your account statement. You can open each invoice, and pay them all — or just some for now — with the button below.`;
    const m = statementEmail({ businessName: o?.name ?? org.name, customerName: c.name as string, message: msg, total: money(owing.reduce((a, i) => a + i.balance, 0), org.currency), url, brand: o?.brand_colour as string | null, logoUrl: o?.logo_url as string | null,
      lines: owing.map((i) => ({ number: i.number, amount: money(i.balance, org.currency), due: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue` : `due ${i.due_date}`) : "no due date" })) });
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    const html = m.html.replace(/<\/body>/i, `<img src="${appBaseUrl()}/api/t/o/${row.id}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" /></body>`);
    const { sendEmail } = await import("@/lib/email/send");
    try {
      await sendEmail({ to, subject: `Your account statement — ${o?.name ?? org.name}`, html, text: m.text, replyTo: (o?.contact_email as string | null) ?? null, fromName: o?.name as string, orgId: org.id });
    } catch (e) { await db.from("collection_emails").delete().eq("id", row.id); throw e; }
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "email", created_by: user.id, body: `Emailed the account statement (${owing.length} invoice${owing.length === 1 ? "" : "s"}) to ${to}.` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Statement sent to ${to}. You'll see here when they open it.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ payment plans */

/** Pay off the chosen invoices weekly or fortnightly from the card on file. */
export async function startPaymentPlan(customerId: string, invoiceIds: string[], frequency: "weekly" | "fortnightly", start: string, by: { count: number } | { amount: number }, emailIt: boolean): Promise<R<string>> {
  try {
    const { org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    if (frequency !== "weekly" && frequency !== "fortnightly") throw new Error("Choose weekly or fortnightly.");
    if (!DATE.test(start) || start < todayISO(org.timezone)) throw new Error("Choose a first payment date from today on.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const { cardOnFile } = await import("@/lib/payments/phone");
    const card = await cardOnFile(db, org.id, customerId);
    if (!card) throw new Error("A payment plan needs a card on file — take a payment over the phone with \"Keep the card on file\" ticked first.");
    const { data: inv, error: e1 } = await db.from("invoices").select("id, number, balance, customer_id, status").eq("organisation_id", org.id).in("id", invoiceIds.filter((x) => UUID.test(x)).slice(0, 30));
    if (e1) throw new Error(e1.message);
    const list = ((inv ?? []) as { id: string; number: string; balance: number; customer_id: string; status: string }[]).filter((i) => i.customer_id === customerId && Number(i.balance) > 0 && !["void", "draft", "paid"].includes(i.status));
    if (!list.length) throw new Error("Choose at least one unpaid invoice.");
    const total = Math.round(list.reduce((a, i) => a + Number(i.balance), 0) * 100) / 100;
    const { planSchedule } = await import("@/lib/accounts/plan");
    const schedule = planSchedule(total, frequency, start, by);
    if (!schedule.length) throw new Error("Choose how many payments, or how much each.");
    const { createPlan } = await import("@/lib/accounts/plans");
    await createPlan(db, { orgId: org.id, customerId, invoiceIds: list.map((i) => i.id), frequency, schedule, note: null, userId: user.id });
    const summary = `${schedule.length} ${frequency} payments of ${money(schedule[0].amount, org.currency)}${schedule.at(-1)!.amount !== schedule[0].amount ? ` (last ${money(schedule.at(-1)!.amount, org.currency)})` : ""} from ${start}, to the ${card.brand ?? "card"} ending ${card.last4 ?? ""}`;
    await db.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "plan", created_by: user.id, body: `Payment plan for ${list.map((i) => i.number).join(", ")} (${money(total, org.currency)}): ${summary}.` });
    let sent = "";
    if (emailIt) {
      const r = await sendStatement(customerId, `Hi,\n\nAs agreed, here's your payment plan: ${summary}. Each payment is charged automatically on its day — the full schedule is on your statement below.\n\nThanks for sorting this out with us.`);
      sent = r.ok ? " The schedule has been emailed to them." : ` (Couldn't email it: ${r.error})`;
    }
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Payment plan set up: ${summary}.${sent}` };
  } catch (e) { return { ok: false, error: /payment_plan/.test(String((e as Error)?.message)) && /does not exist|could not find/i.test(String((e as Error)?.message)) ? "Payment plans need the 0080 database update first: run supabase/migrations/0080_payment_plans.sql in Supabase (SQL editor)." : err(e) }; }
}

export async function cancelPaymentPlan(customerId: string): Promise<R> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("payment_plans").update({ status: "cancelled" }).eq("organisation_id", org.id).eq("customer_id", customerId).eq("status", "active");
    if (error) throw new Error(error.message);
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "note", created_by: user.id, body: "Payment plan cancelled — no more automatic payments." });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ phone numbers */

/** Take a number off a customer (e.g. the person has left): cleared from the client record / contact, hidden if it's Xero's. */
export async function removeNumber(customerId: string, number: string, source: "client" | "contact" | "xero"): Promise<R<string>> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { digits } = await import("@/lib/accounts/phones");
    const { cleanStored } = await import("@/lib/phone-format");
    const d = digits(number);
    if (d.length < 6) throw new Error("That isn't a phone number.");
    const same = (raw: string | null) => !!raw && cleanStored(raw).some((n) => digits(n) === d);
    const { data: c } = await supabase.from("customers").select("phone").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    if (same((c?.phone as string | null) ?? null)) await supabase.from("customers").update({ phone: null }).eq("id", customerId).eq("organisation_id", org.id);
    const { data: people } = await supabase.from("contacts").select("id, phone").eq("organisation_id", org.id).eq("customer_id", customerId).not("phone", "is", null);
    for (const p of (people ?? []) as { id: string; phone: string }[]) if (same(p.phone)) await supabase.from("contacts").update({ phone: null }).eq("id", p.id).eq("organisation_id", org.id);
    // hidden from now on, so Xero (which still has it) doesn't bring it back
    await saveCollections((col) => {
      const h = { ...((col.hidden_numbers && typeof col.hidden_numbers === "object" ? col.hidden_numbers : {}) as Record<string, string[]>) };
      h[customerId] = [...new Set([...(h[customerId] ?? []), d])].slice(0, 30);
      return { ...col, hidden_numbers: h };
    });
    await supabase.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "note", created_by: user.id, body: `Removed ${number} from their numbers.` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: source === "xero" ? `Removed ${number}. It's still in Xero — update their contact in Xero too.` : `Removed ${number}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/**
 * Tidy every client's and contact's phone number: numbers Xero's boxes joined together ("+0476 804 0476804565"),
 * "Phone: … Mobile: …" in one field, +61 duplicates. Owners and admins; numbers we can't read are left alone.
 */
export async function tidyAllPhones(): Promise<R<string>> {
  try {
    const { supabase, org, role } = await accounts();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can tidy every number.");
    const { cleanStored } = await import("@/lib/phone-format");
    const broken = (p: string) => p.replace(/\D/g, "").length > 10 || /[\r\n|]|(phone|mobile)\s*:/i.test(p);
    let n = 0;
    for (const table of ["customers", "contacts"] as const) {
      const { data, error } = await supabase.from(table).select("id, phone").eq("organisation_id", org.id).not("phone", "is", null).limit(10000);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { id: string; phone: string }[]) {
        if (!broken(r.phone)) continue;
        const list = cleanStored(r.phone).filter((x) => !x.startsWith("+"));
        // a contact keeps the mobile when there are two; the client record keeps the first
        const pick = table === "contacts" && list.length > 1 ? (list.find((x) => /^04/.test(x)) ?? list[0]) : list[0];
        if (!pick || pick === r.phone || pick.replace(/\D/g, "").length < 8) continue;
        const { error: e } = await supabase.from(table).update({ phone: pick }).eq("id", r.id).eq("organisation_id", org.id);
        if (!e) n++;
      }
    }
    revalidatePath("/accounts", "layout");
    revalidatePath("/clients");
    return { ok: true, data: n ? `Tidied ${n} phone number${n === 1 ? "" : "s"}.` : "All phone numbers already look right." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ text messages */

/** Text a customer (from the business's Twilio, as its approved sender), logged on the account. */
export async function sendSmsToCustomer(customerId: string, number: string, body: string, withStatement: boolean): Promise<R<string>> {
  try {
    const { org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const { smsNumber, loadTwilio, sendSms } = await import("@/lib/sms/twilio");
    const to = smsNumber(number);
    if (!to) throw new Error(`${number} can't get texts — choose a mobile number.`);
    const text = t(body, 1200);
    if (!text) throw new Error("Write the message.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const cfg = await loadTwilio(db, org.id);
    if (!cfg) throw new Error("Text messages aren't set up — connect Twilio in Settings → Integrations.");
    let msg = text;
    if (withStatement) { const { statementUrl } = await import("@/lib/accounts/statement"); msg = `${text}\n${statementUrl(org.id, customerId)}`; }
    await sendSms(cfg, to, msg);
    const { attemptText } = await import("@/lib/accounts/phones");
    await db.from("collection_notes").insert({ organisation_id: org.id, customer_id: customerId, kind: "sms", created_by: user.id, body: `${attemptText("SMS", number)}\n${text}${withStatement ? "\n(with their statement link)" : ""}` });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Text sent to ${number}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}
