/**
 * Accounts (pure): chasing templates, how overdue things are, and which payments came after which chasing email
 * (so each email's success can be measured: opened, pay link clicked, money recovered).
 */
export interface Template { key: string; name: string; subject: string; message: string }

/** Words: {first_name} {invoice} {amount} {due_date} {days_overdue} {promise_date} {business} */
export const DEFAULT_TEMPLATES: Template[] = [
  { key: "friendly", name: "Friendly reminder", subject: "Invoice {invoice} — a quick reminder",
    message: "Hi {first_name},\n\nJust a friendly reminder that invoice {invoice} for {amount} was due on {due_date}. You can pay it online in a minute with the button below.\n\nIf it's already on its way, thank you — please ignore this.\n\nKind regards,\n{business}" },
  { key: "overdue", name: "Overdue", subject: "Invoice {invoice} is {days_overdue} days overdue",
    message: "Hi {first_name},\n\nInvoice {invoice} for {amount} is now {days_overdue} days overdue. Could you please arrange payment this week? The button below takes you straight to it.\n\nIf there's a problem with the invoice, just reply and let us know so we can sort it out.\n\nThanks,\n{business}" },
  { key: "final", name: "Final notice", subject: "Final notice: invoice {invoice} ({amount})",
    message: "Hi {first_name},\n\nWe haven't been able to reach you about invoice {invoice} for {amount}, which is {days_overdue} days overdue.\n\nPlease pay it within 7 days or contact us to arrange a payment plan. If we don't hear from you, we'll need to take further steps to recover the amount.\n\nRegards,\n{business}" },
  { key: "promise", name: "Payment due today (as agreed)", subject: "As agreed — invoice {invoice} is due today",
    message: "Hi {first_name},\n\nAs we discussed, here's invoice {invoice} for {amount}, which you said you'd pay today ({promise_date}). The button below lets you pay it by card in a minute.\n\nThanks very much,\n{business}" },
  { key: "plan", name: "Payment plan", subject: "Your payment plan for invoice {invoice}",
    message: "Hi {first_name},\n\nThanks for talking with us. As agreed, here's invoice {invoice} — the balance is {amount}. You can pay each instalment from the link below.\n\nKind regards,\n{business}" },
];

export function readTemplates(settings: unknown): Template[] {
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).collections : null) as { templates?: unknown } | null;
  const saved = Array.isArray(raw?.templates) ? raw!.templates : [];
  const out: Template[] = [];
  for (const t of saved as unknown[]) {
    const o = (t ?? {}) as Record<string, unknown>;
    const key = typeof o.key === "string" && /^[a-z0-9_-]{2,30}$/.test(o.key) ? o.key : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 200) : "";
    const message = typeof o.message === "string" ? o.message.replace(/\r\n/g, "\n").trim().slice(0, 4000) : "";
    if (key && name && subject && message && !out.some((x) => x.key === key)) out.push({ key, name, subject, message });
  }
  // built-in ones you haven't changed are always there
  for (const d of DEFAULT_TEMPLATES) if (!out.some((x) => x.key === d.key)) out.push(d);
  return out.slice(0, 20);
}

export function fill(t: string, words: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in words ? words[k] : m));
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Ageing bucket of an invoice's balance. */
export function bucket(due: string | null, today: string): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (!due || due >= today) return "current";
  const d = daysBetween(due, today);
  return d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";
}

export interface SentEmail { id: string; invoice_id: string | null; sent_at: string; template: string | null; opened_at: string | null; clicked_at: string | null }
export interface Payment { invoice_id: string; amount: number; paid_at: string }

/**
 * Each payment counts once, towards the latest chasing email for that invoice sent before it (within 30 days).
 * Returns money recovered per email.
 */
export function attribute(emails: SentEmail[], payments: Payment[], windowDays = 30): Map<string, number> {
  const out = new Map<string, number>();
  const byInv = new Map<string, SentEmail[]>();
  for (const e of emails) if (e.invoice_id) byInv.set(e.invoice_id, [...(byInv.get(e.invoice_id) ?? []), e]);
  for (const list of byInv.values()) list.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  for (const p of payments) {
    const list = byInv.get(p.invoice_id);
    if (!list) continue;
    let pick: SentEmail | null = null;
    for (const e of list) if (e.sent_at <= p.paid_at && Date.parse(p.paid_at) - Date.parse(e.sent_at) <= windowDays * 86_400_000) pick = e;
    if (pick) out.set(pick.id, Math.round(((out.get(pick.id) ?? 0) + p.amount) * 100) / 100);
  }
  return out;
}

/* ------------------------------------------------------------------ account-keeping fees */

/**
 * Account-keeping fee on overdue invoices: a percentage of what's still owing, for every full month an invoice is
 * overdue after a grace period. Saved in settings.collections.fees; a customer can have their own rate (or 0).
 */
export interface FeeSettings {
  enabled: boolean;
  /** % of the overdue balance, per month */
  percent: number;
  /** days after the due date before the first month counts */
  grace_days: number;
  /** charge GST on the fee (check with your accountant) */
  gst: boolean;
  /** Xero account code for the fee line (blank = the default sales account) */
  account_code: string | null;
  /** customer id → their own monthly % (0 = never charge them) */
  overrides: Record<string, number>;
}
export const DEFAULT_FEES: FeeSettings = { enabled: false, percent: 2, grace_days: 30, gst: false, account_code: null, overrides: {} };

const pct = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 20 ? Math.round(n * 1000) / 1000 : d; };
export function readFees(settings: unknown): FeeSettings {
  const c = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).collections : null) as Record<string, unknown> | null;
  const f = (c?.fees && typeof c.fees === "object" ? c.fees : {}) as Record<string, unknown>;
  const grace = Number(f.grace_days);
  const overrides: Record<string, number> = {};
  if (f.overrides && typeof f.overrides === "object") for (const [k, v] of Object.entries(f.overrides as Record<string, unknown>).slice(0, 2000)) {
    if (/^[0-9a-f-]{36}$/i.test(k) && v !== null && v !== "" && Number.isFinite(Number(v))) overrides[k] = pct(v, 0);
  }
  return {
    enabled: f.enabled === true,
    percent: pct(f.percent, DEFAULT_FEES.percent),
    grace_days: Number.isInteger(grace) && grace >= 0 && grace <= 365 ? grace : DEFAULT_FEES.grace_days,
    gst: f.gst === true,
    account_code: typeof f.account_code === "string" && /^[A-Za-z0-9._-]{1,20}$/.test(f.account_code.trim()) ? f.account_code.trim() : null,
    overrides,
  };
}
export const feeRateFor = (f: FeeSettings, customerId: string) => (customerId in f.overrides ? f.overrides[customerId] : f.percent);

/**
 * The fee owing now on one overdue invoice: full months overdue after the grace period, less months already charged,
 * at the customer's rate on what's still owing.
 */
export function feeDue(inv: { balance: number; due_date: string | null }, today: string, rate: number, graceDays: number, chargedMonths: number) {
  if (!inv.due_date || inv.balance <= 0 || rate <= 0) return { months: 0, amount: 0, monthsOverdue: 0 };
  const late = daysBetween(inv.due_date, today) - graceDays;
  const monthsOverdue = late > 0 ? Math.floor(late / 30) + 1 : 0;   // the first month counts from the day after the grace period
  const months = Math.max(0, monthsOverdue - chargedMonths);
  return { months, amount: Math.round(inv.balance * (rate / 100) * months * 100) / 100, monthsOverdue };
}

/* ------------------------------------------------------------------ terms and conditions */

/** Words: {business} {payment_terms} {fee_percent} {grace_days} {email} {phone} */
export const DEFAULT_TERMS = `# Terms and conditions of trade

These terms apply to every quote, booking, order and invoice from {business}. By accepting a quote, making a booking or paying a deposit you agree to them.

## 1. Quotes and bookings
1.1 Quotes are valid for 30 days from the date issued unless the quote says otherwise.
1.2 A booking is confirmed once the quote is accepted and any deposit asked for is paid.
1.3 Prices include GST unless they are marked otherwise.

## 2. Payment
2.1 Invoices are due within {payment_terms} days of the invoice date unless the invoice shows a different due date.
2.2 You can pay by card through the pay link on your invoice, or by bank transfer using the invoice number as the reference.
2.3 If you can't pay an invoice by its due date, please contact us before it falls due so we can agree on a payment plan.

## 3. Overdue accounts and account-keeping fees
3.1 An invoice that isn't paid by its due date is overdue.
3.2 If an invoice is still unpaid {grace_days} days after its due date, an account-keeping fee of {fee_percent}% of the amount still owing is charged for each month (or part month) the invoice remains unpaid. The fee covers the extra administration of managing the overdue account — reminders, phone calls, reconciliations and payment arrangements.
3.3 Account-keeping fees are charged on a separate invoice and are payable on the same terms as any other invoice.
3.4 We may stop work, suspend services (including website hosting and maintenance) or decline new bookings while an account is overdue.
3.5 If an account remains overdue and no payment arrangement is made, we may refer it to a debt-collection agency or take legal action. You agree to pay the reasonable costs of recovering the debt, including collection agency and legal fees.

## 4. Payment arrangements
4.1 Any payment plan or promise to pay must be agreed with us and is recorded on your account.
4.2 If an agreed payment is missed, the full amount owing becomes due straight away and account-keeping fees apply as set out in clause 3.

## 5. Disputes
5.1 If you dispute any part of an invoice, tell us in writing within 7 days of receiving it, explaining what is disputed. Please pay the part that isn't disputed by the due date.
5.2 We'll work with you to resolve a dispute promptly. Account-keeping fees are not charged on an amount while it is genuinely in dispute.

## 6. Cancellations and changes
6.1 Cancellation and change terms for a booking are set out on your quote or booking confirmation.
6.2 Deposits are non-refundable unless your quote or booking confirmation says otherwise.

## 7. Your rights under Australian Consumer Law
Nothing in these terms excludes, restricts or changes any right or remedy you have under the Australian Consumer Law or any other law that can't be excluded.

## 8. Contact
Questions about these terms or your account: {email}{phone_line}.

These terms may be updated from time to time. The version on our website when you accept a quote or make a booking applies to it.`;

export function readTerms(settings: unknown): string {
  const c = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).collections : null) as Record<string, unknown> | null;
  return typeof c?.terms === "string" && c.terms.trim() ? c.terms.slice(0, 30000) : "";
}

/** The terms with the business's details and fee settings filled in. */
export function fillTerms(text: string, w: { business: string; payment_terms: number; fees: FeeSettings; email: string | null; phone: string | null }) {
  return fill(text, {
    business: w.business, payment_terms: String(w.payment_terms), fee_percent: String(w.fees.percent), grace_days: String(w.fees.grace_days),
    email: w.email ?? "", phone: w.phone ?? "", phone_line: w.phone ? ` or ${w.phone}` : "",
  });
}

/* ------------------------------------------------------------------ who to call next */

export interface ChaseRow {
  id: string; overdue: number; owing: number; oldestDays: number;
  /** last call, note, text or email, ISO */
  lastTouch: string | null;
  /** the latest promise date that has passed with no payment since */
  brokenPromise: string | null;
  stepDue: boolean;
  flagged: boolean;
}

/**
 * Who's next on the list: people already contacted today drop off; then broken promises, next steps due, people never
 * contacted, and the longest silence — biggest and oldest debts first within each.
 */
export function callNext<T extends ChaseRow>(rows: T[], today: string): T[] {
  const touchedToday = (r: ChaseRow) => !!r.lastTouch && r.lastTouch.slice(0, 10) >= today;
  const rank = (r: ChaseRow) => (r.brokenPromise ? 0 : r.stepDue ? 1 : !r.lastTouch ? 2 : 3);
  const quiet = (r: ChaseRow) => (r.lastTouch ? daysBetween(r.lastTouch.slice(0, 10), today) : 9999);
  return rows.filter((r) => r.overdue > 0 && !touchedToday(r) && !r.flagged)
    .sort((a, b) => rank(a) - rank(b) || quiet(b) - quiet(a) || b.oldestDays - a.oldestDays || b.overdue - a.overdue);
}
