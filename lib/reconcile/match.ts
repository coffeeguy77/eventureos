/**
 * Reconcile (pure): customer deposits → open invoices, and Stripe payouts → the bank lines they arrived as.
 */
import type { BankLine } from "./core";

const dayNo = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
const cents = (n: number) => Math.round(n * 100);

/** Money in that isn't a transfer between your accounts or a Stripe/Square/other card settlement. */
export const SETTLEMENT_RE = /\bSTRIPE\b|\bSQUARE\b|ORDERMENTUM|\bTYRO\b|\bPAYPAL\b|\bAFTERPAY\b|\bZIP ?PAY\b|\bUBER\b|\bMENULOG\b|\bDOORDASH\b/i;
export const isDeposit = (l: BankLine) => l.amount > 0 && !l.transfer && !SETTLEMENT_RE.test(l.narrative) && !/INTEREST|DISHONOU?R|REVERSAL|REFUND/i.test(l.narrative);

export interface OpenInvoice { id: string; xeroId: string; number: string | null; customer: string; company: string | null; balance: number; issueDate: string; dueDate: string | null; org: string }
export interface DepositMatch {
  key: string; line: BankLine;
  /** the invoice chosen (null = choose from options) */
  invoice: OpenInvoice | null;
  options: OpenInvoice[];
  /** the payer's name or the invoice number is in the bank description */
  named: boolean;
  unsure: boolean;
}

const STOP = new Set(["PTY", "LTD", "THE", "AND", "CAFE", "CO", "GROUP", "SERVICES", "AUSTRALIA", "CANBERRA", "PAYMENT", "DEPOSIT", "ONLINE", "OSKO", "INVOICE"]);
export function nameTokens(...names: (string | null | undefined)[]) {
  return [...new Set(names.flatMap((n) => (n ?? "").toUpperCase().split(/[^A-Z0-9]+/)).filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t)))];
}
function named(line: BankLine, inv: OpenInvoice) {
  const n = ` ${line.narrative.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
  if (inv.number) {
    const num = inv.number.toUpperCase().replace(/[^A-Z0-9]+/g, "");
    const digits = num.replace(/\D/g, "");
    if (num.length >= 3 && n.replace(/ /g, "").includes(num)) return true;
    if (digits.length >= 4 && new RegExp(`\\b0*${digits}\\b`).test(n)) return true;
  }
  return nameTokens(inv.customer, inv.company).some((t) => n.includes(` ${t} `) || (t.length >= 6 && n.includes(t.slice(0, 6))));
}

/**
 * Each deposit against open invoices of exactly that amount, issued before it (up to 3 days after is allowed) and no
 * more than 180 days earlier. The one whose customer name or number is in the description is picked (and trusted);
 * a single amount-only candidate is suggested for you to confirm; several → you choose. Each invoice is used once
 * (named matches first, then oldest invoice first).
 */
export function matchDeposits(lines: BankLine[], invoices: OpenInvoice[], opts: { from?: string | null } = {}): DepositMatch[] {
  const deps = lines.filter((l) => isDeposit(l) && (!opts.from || l.date >= opts.from)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byAmount = new Map<number, OpenInvoice[]>();
  for (const i of invoices) if (i.balance > 0) byAmount.set(cents(i.balance), [...(byAmount.get(cents(i.balance)) ?? []), i]);
  const used = new Set<string>();
  const cands = deps.map((l) => {
    const list = (byAmount.get(cents(l.amount)) ?? []).filter((i) => { const g = dayNo(l.date) - dayNo(i.issueDate); return g >= -3 && g <= 180; })
      .sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1));
    return { l, list, namedList: list.filter((i) => named(l, i)) };
  });
  const out: DepositMatch[] = [];
  // named first so a clearly-labelled deposit gets its invoice before an anonymous one takes it
  const order = [...cands].sort((a, b) => Number(b.namedList.length === 1) - Number(a.namedList.length === 1));
  const result = new Map<string, DepositMatch>();
  for (const c of order) {
    const free = c.list.filter((i) => !used.has(i.id));
    if (!free.length) continue;
    const freeNamed = c.namedList.filter((i) => !used.has(i.id));
    let pick: OpenInvoice | null = null, unsure = false;
    if (freeNamed.length === 1) pick = freeNamed[0];
    else if (free.length === 1 && !(c.namedList.length && !freeNamed.length)) pick = free[0];
    else unsure = true;
    if (pick) used.add(pick.id);
    // only a deposit that names the customer (or the invoice number) is trusted on its own — a matching amount alone
    // could be another customer who owes the same (e.g. monthly hosting)
    const isNamed = !!pick && named(c.l, pick);
    result.set(c.l.key, { key: `dep|${c.l.key}`, line: c.l, invoice: pick, options: freeNamed.length > 1 ? freeNamed : free, named: isNamed, unsure: unsure || !isNamed });
  }
  for (const c of cands) { const m = result.get(c.l.key); if (m) out.push(m); }
  return out;
}

/** What a payment in a payout was for (from the details EventureOS puts on every Stripe payment). */
export type PayKind = "shop" | "bookings" | "other";
export interface PayItem { name: string; amount: number; kind: PayKind; recorded: boolean; what: string | null }
export interface Payout {
  id: string; amount: number; arrival: string;
  /** sales by kind, less refunds of those sales (not counting payments already in Xero) */
  groups: Record<PayKind, number>;
  gross: number; fees: number; refunds: number; other: number;
  /** payments for EventureOS invoices (they go to the Stripe clearing account, where EventureOS records them against the invoice) */
  recorded: number; recordedRefs: string[]; count: number;
  items: PayItem[];
}
export interface PayoutMatch { key: string; payout: Payout; line: BankLine | null }

/** Stripe payouts → the "STRIPE" bank line of the same amount within 3 days of arrival (closest first). */
export function matchPayouts(lines: BankLine[], payouts: Payout[]): PayoutMatch[] {
  const pool = lines.filter((l) => l.amount > 0 && /\bSTRIPE\b/i.test(l.narrative));
  const used = new Set<string>();
  return [...payouts].sort((a, b) => (a.arrival < b.arrival ? -1 : 1)).map((p) => {
    let best: BankLine | null = null, gap = 99;
    for (const l of pool) {
      if (used.has(l.key) || cents(l.amount) !== cents(p.amount)) continue;
      const g = Math.abs(dayNo(l.date) - dayNo(p.arrival));
      if (g <= 3 && g < gap) { best = l; gap = g; }
    }
    if (best) used.add(best.key);
    return { key: `po|${p.id}`, payout: p, line: best };
  });
}

const KIND_LABEL: Record<PayKind, string> = { shop: "Shop orders", bookings: "Classes & bookings", other: "Other Stripe payments" };
const r2 = (n: number) => Math.round(n * 100) / 100;
const who = (items: PayItem[]) => {
  const list = items.map((i) => `${i.name || "Customer"} $${i.amount.toFixed(2)}${i.what ? ` (${i.what})` : ""}`);
  const text = list.join("; ");
  return text.length > 900 ? `${text.slice(0, 880)}… (${items.length} payments)` : text;
};

/**
 * The lines of the Xero deposit for one payout (they add up to the payout): payments EventureOS already sent to Xero
 * go to the Stripe clearing account; the rest by kind (shop orders, classes & bookings, everything else) to the
 * accounts you chose, each line naming who paid; Stripe's fees as a negative line to your fees account.
 * A kind without its own account uses "everything else".
 */
export function payoutLines(p: Payout, c: { clearing: string | null; shop: { account: string | null; tax: string | null }; bookings: { account: string | null; tax: string | null }; other: { account: string | null; tax: string | null }; fees: { account: string | null; tax: string | null } }) {
  const lines: { description: string; account: string; amount: number; tax: string | null }[] = [];
  const recorded = c.clearing ? p.recorded : 0;
  if (recorded) lines.push({ description: `EventureOS invoice payments (recorded against the invoices): ${who(p.items.filter((i) => i.recorded))}`, account: c.clearing!, amount: r2(recorded), tax: "NONE" });
  const groups = { ...p.groups };
  if (!c.clearing && p.recorded) groups.other = r2(groups.other + p.recorded);
  for (const k of ["shop", "bookings", "other"] as PayKind[]) {
    const amt = r2(groups[k]);
    if (!amt) continue;
    const cfg = c[k].account ? c[k] : c.other;
    const items = p.items.filter((i) => i.kind === k && !(c.clearing && i.recorded));
    lines.push({ description: `${KIND_LABEL[k]}: ${who(items)}`.slice(0, 1000), account: cfg.account ?? "", amount: amt, tax: cfg.tax });
  }
  if (p.fees) lines.push({ description: "Stripe fees", account: c.fees.account ?? "", amount: r2(-p.fees), tax: c.fees.tax });
  const total = r2(lines.reduce((a, l) => a + l.amount, 0));
  return { lines, total, balanced: Math.abs(total - p.amount) < 0.005, coded: lines.every((l) => !!l.account) };
}
