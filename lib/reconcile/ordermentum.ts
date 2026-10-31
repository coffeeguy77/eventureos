/**
 * Reconcile (pure): Ordermentum payouts. Ordermentum pays a batch of your invoices as one deposit
 * ("DEPOSIT 2425117 Ordermentum OM26092414") and emails a remittance CSV listing them:
 *   "batch","paid_at","retailer_name","invoice_number","order_numbers","invoice_total"
 * The deposit's batch code finds its remittance; the invoices are found among your open invoices by number.
 */
import { parseCsv, type BankLine } from "./core";
import type { OpenInvoice } from "./match";

export interface RemitRow { batch: string; paidAt: string | null; retailer: string; invoice: string; amount: number }

export const isOrdermentum = (l: BankLine) => l.amount > 0 && /ORDERMENTUM/i.test(l.narrative);
export const batchOf = (narrative: string) => narrative.toUpperCase().match(/\bOM\d{6,}\b/)?.[0] ?? null;

export function parseRemittance(text: string): RemitRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const at = (n: string) => head.indexOf(n);
  const iB = at("batch"), iI = at("invoice_number"), iT = at("invoice_total"), iR = at("retailer_name"), iP = at("paid_at");
  if (iB < 0 || iI < 0 || iT < 0) throw new Error("This doesn't look like an Ordermentum remittance CSV (it needs batch, invoice_number and invoice_total).");
  return rows.slice(1).flatMap((r) => {
    const batch = (r[iB] ?? "").trim().toUpperCase(), invoice = (r[iI] ?? "").trim(), amount = Math.round(Number((r[iT] ?? "").replace(/[$,\s]/g, "")) * 100) / 100;
    return batch && invoice && Number.isFinite(amount) ? [{ batch, invoice, amount, retailer: (iR >= 0 ? r[iR] : "")?.trim() ?? "", paidAt: iP >= 0 ? (r[iP] ?? "").slice(0, 10) || null : null }] : [];
  });
}

export interface OmInvoice { invoice: string; retailer: string; amount: number; open: OpenInvoice | null; problem: string | null }
export interface OmMatch {
  key: string; line: BankLine; batch: string | null;
  rows: OmInvoice[];
  /** ready = every invoice is open in Xero for the amount listed, and they add up to the deposit */
  state: "ready" | "no-remittance" | "problem";
  problem: string | null;
  total: number;
}

const cents = (n: number) => Math.round(n * 100);

export function matchOrdermentum(lines: BankLine[], remits: RemitRow[], invoices: OpenInvoice[], opts: { from?: string | null } = {}): OmMatch[] {
  const byNumber = new Map(invoices.filter((i) => i.number).map((i) => [i.number!.trim().toUpperCase(), i]));
  const byBatch = new Map<string, RemitRow[]>();
  for (const r of remits) byBatch.set(r.batch, [...(byBatch.get(r.batch) ?? []).filter((x) => x.invoice !== r.invoice), r]);
  return lines.filter((l) => isOrdermentum(l) && (!opts.from || l.date >= opts.from)).map((l) => {
    const batch = batchOf(l.narrative);
    const list = batch ? byBatch.get(batch) ?? [] : [];
    const rows: OmInvoice[] = list.map((r) => {
      const open = byNumber.get(r.invoice.toUpperCase()) ?? null;
      const problem = !open ? "Not open in Xero (already paid, or not in Xero)" : cents(open.balance) < cents(r.amount) ? `Only $${open.balance.toFixed(2)} owing` : null;
      return { invoice: r.invoice, retailer: r.retailer, amount: r.amount, open, problem };
    });
    const total = Math.round(list.reduce((a, r) => a + r.amount, 0) * 100) / 100;
    let state: OmMatch["state"] = "ready", problem: string | null = null;
    if (!batch || !list.length) { state = "no-remittance"; problem = batch ? `No remittance for ${batch} yet — find it in Gmail or add the CSV.` : "No Ordermentum batch number in the bank description."; }
    else if (cents(total) !== cents(l.amount)) { state = "problem"; problem = `The remittance adds up to $${total.toFixed(2)}, the deposit is $${l.amount.toFixed(2)}.`; }
    else if (rows.some((r) => r.problem)) { state = "problem"; problem = `${rows.filter((r) => r.problem).length} invoice${rows.filter((r) => r.problem).length === 1 ? "" : "s"} can't take this payment — see below.`; }
    return { key: `om|${l.key}`, line: l, batch, rows, state, problem, total };
  });
}
