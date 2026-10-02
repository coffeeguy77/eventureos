/**
 * Revenue by stream — from the Xero invoices EventureOS keeps a copy of.
 * A stream is a Xero revenue account. Each line counts towards the account its item is set to in
 * "Recode by item" (so figures are right even before Xero has been recoded), otherwise the account
 * it is actually on — but only accounts chosen there are shown.
 * Amounts are ex GST: each invoice's lines are scaled to its subtotal (handles GST-inclusive invoices
 * and whole-invoice discounts). Drafts and voided invoices aren't revenue and are left out.
 * Pure — used by the dashboard and tested with `npx tsx`.
 */
import { intendedAccount, type RecodeRule } from "@/lib/integrations/xero-recode-plan";

export interface StreamLine { item_code?: string | null; account_code?: string | null; quantity?: number | null; line_amount?: number | null; description?: string | null }
export interface StreamInvoice { id: string; number?: string | null; status: string; issue_date: string | null; subtotal: number | null; line_items: StreamLine[] | null }
export interface StreamRow { account: string; amount: number; units: number; invoices: number }
export interface StreamPeriod { key: string; label: string; from: string | null; to: string | null }

const NOT_REVENUE = new Set(["draft", "void"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Which stream (account) a line belongs to, or null if it isn't one of the streams. */
export function streamFor(line: StreamLine, map: Record<string, string>, streams: Set<string>, rules: RecodeRule[] = [], invoice: string | null = null): string | null {
  const to = intendedAccount({ ItemCode: line.item_code, Description: line.description }, map, { rules, invoice });
  if (to) return to;
  return line.account_code && streams.has(line.account_code) ? line.account_code : null;
}

export function revenueByStream(invoices: StreamInvoice[], map: Record<string, string>, period: { from: string | null; to: string | null }, rules: RecodeRule[] = []): StreamRow[] {
  const streams = new Set([...Object.values(map), ...rules.map((r) => r.account)]);
  const rows = new Map<string, StreamRow & { ids: Set<string> }>();
  for (const inv of invoices) {
    if (NOT_REVENUE.has(inv.status)) continue;
    const d = inv.issue_date ?? "";
    if (period.from && d < period.from) continue;
    if (period.to && d > period.to) continue;
    const lines = inv.line_items ?? [];
    const sum = lines.reduce((a, l) => a + Number(l.line_amount ?? 0), 0);
    const scale = inv.subtotal != null && sum !== 0 ? Number(inv.subtotal) / sum : 1;
    for (const l of lines) {
      const acct = streamFor(l, map, streams, rules, inv.number ?? null);
      if (!acct) continue;
      const row = rows.get(acct) ?? { account: acct, amount: 0, units: 0, invoices: 0, ids: new Set<string>() };
      row.amount += Number(l.line_amount ?? 0) * scale;
      row.units += Number(l.quantity ?? 0);
      row.ids.add(inv.id);
      rows.set(acct, row);
    }
  }
  return [...rows.values()].map(({ ids, ...r }) => ({ ...r, amount: r2(r.amount), units: Math.round(r.units * 100) / 100, invoices: ids.size }))
    .sort((a, b) => b.amount - a.amount);
}

/** All time, this financial year, last financial year, last 12 months. `fyStartMonth` 1–12 (July = 7). */
export function streamPeriods(today: string, fyStartMonth = 7): StreamPeriod[] {
  const [y, m] = today.split("-").map(Number);
  const fyStartYear = m >= fyStartMonth ? y : y - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const fyStart = (yr: number) => `${yr}-${pad(fyStartMonth)}-01`;
  const dayBefore = (iso: string) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
  const yearAgo = (() => { const t = new Date(`${today}T12:00:00Z`); t.setUTCFullYear(t.getUTCFullYear() - 1); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); })();
  const fyLabel = (start: number) => (fyStartMonth === 1 ? String(start) : `FY${String(start + 1).slice(2)}`);
  return [
    { key: "all", label: "All time", from: null, to: null },
    { key: "fy", label: `This year (${fyLabel(fyStartYear)})`, from: fyStart(fyStartYear), to: today },
    { key: "lastfy", label: `Last year (${fyLabel(fyStartYear - 1)})`, from: fyStart(fyStartYear - 1), to: dayBefore(fyStart(fyStartYear)) },
    { key: "12m", label: "Last 12 months", from: yearAgo, to: today },
  ];
}
