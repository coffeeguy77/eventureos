import type { BaseUnit } from "./units";

/**
 * Price history per product (same supplier + same product code/name), compared on the
 * normalised price ($/kg, $/L or $ each, ex GST) so a pack-size change doesn't look like a price change.
 */
export interface PriceRow {
  supplier_id: string; match_key: string; description: string; invoice_date: string | null;
  qty: number | null; unit: string | null; pack_size: string | null; unit_price: number; line_total: number | null;
  base_unit: BaseUnit; base_qty: number; price_per_base: number; delivery_id: string;
}

export interface ProductPrices {
  key: string;                 // supplier_id|match_key
  supplierId: string;
  matchKey: string;
  description: string;
  baseUnit: BaseUnit;
  history: { date: string; price: number; unitPrice: number; qty: number | null; deliveryId: string }[];
  latest: { date: string; price: number; unitPrice: number; qty: number | null };
  previous: { date: string; price: number } | null;   // the last order at a DIFFERENT price
  changedOn: string | null;    // first order at the current price (when the latest change happened)
  change: number | null;       // $ per base, current − previous price
  changePct: number | null;
  lastOrderImpact: number | null; // extra (or saved) $ on the latest order vs the previous price
  firstInWindow: { date: string; price: number } | null;
  windowPct: number | null;    // change across the chosen window (e.g. 90 days)
  low: number; high: number;
  orders: number;
  // money-saving view (last 12 months)
  best12: { date: string; price: number } | null;   // lowest price paid in the last 12 months
  spend12: number;             // ex GST spent on this product in the last 12 months
  volume12: number;            // kg / L / each bought in the last 12 months
  annualVolume: number;        // volume12 scaled to a full year if history is shorter
  overBestPct: number | null;  // how far today's price is above that best price
  potentialSaving: number;     // $/year if you paid the best price again
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const dayMs = 86400000;

export function analysePrices(rows: PriceRow[], opts: { windowStart: string; today?: string }): ProductPrices[] {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * dayMs).toISOString().slice(0, 10);
  const groups = new Map<string, PriceRow[]>();
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const k = `${r.supplier_id}|${r.match_key}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out: ProductPrices[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.invoice_date! < b.invoice_date! ? -1 : a.invoice_date! > b.invoice_date! ? 1 : 0));
    const latestRow = list[list.length - 1];
    // only compare like with like: same base unit as the latest line
    const same = list.filter((r) => r.base_unit === latestRow.base_unit);
    // one point per delivery (a product can appear twice on one invoice)
    const byDelivery = new Map<string, PriceRow>();
    for (const r of same) byDelivery.set(r.delivery_id, r);
    const history = [...byDelivery.values()].map((r) => ({
      date: r.invoice_date!, price: Number(r.price_per_base), unitPrice: Number(r.unit_price), qty: r.qty === null ? null : Number(r.qty), deliveryId: r.delivery_id,
    }));
    const latest = history[history.length - 1];
    // walk back over orders at the current price to find when it last changed
    let i = history.length - 1;
    while (i > 0 && Math.abs(history[i - 1].price - latest.price) < 0.005) i--;
    const prevPoint = i > 0 ? history[i - 1] : null;
    const changedOn = prevPoint ? history[i].date : null;
    const change = prevPoint ? r2(latest.price - prevPoint.price) : null;
    const changePct = prevPoint && prevPoint.price > 0 ? Math.round(((latest.price - prevPoint.price) / prevPoint.price) * 1000) / 10 : null;
    const baseQtyOnOrder = latestRow.qty !== null ? Number(latestRow.qty) * Number(latestRow.base_qty) : null;
    const lastOrderImpact = change !== null && baseQtyOnOrder !== null ? r2(change * baseQtyOnOrder) : null;
    const inWindow = history.filter((h) => h.date >= opts.windowStart);
    const first = inWindow.length > 1 ? inWindow[0] : null;
    const prices = history.map((h) => h.price);
    // last 12 months: spend, volume and best price
    const year = same.filter((r) => r.invoice_date! >= yearAgo);
    const spend12 = r2(year.reduce((a, r) => a + (r.line_total ?? (r.qty ?? 0) * r.unit_price), 0));
    const volume12 = year.reduce((a, r) => a + (r.qty ?? 0) * r.base_qty, 0);
    const firstYear = year[0]?.invoice_date ?? today;
    const coveredDays = Math.max(28, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstYear}T00:00:00Z`)) / dayMs);
    const annualVolume = volume12 * Math.min(365 / coveredDays, 13);
    const yearHistory = history.filter((h) => h.date >= yearAgo);
    const bestPoint = yearHistory.length > 1 ? yearHistory.reduce((b, h) => (h.price < b.price ? h : b)) : null;
    const overBest = bestPoint ? latest.price - bestPoint.price : 0;
    out.push({
      key, supplierId: latestRow.supplier_id, matchKey: latestRow.match_key, description: latestRow.description, baseUnit: latestRow.base_unit,
      history, latest, previous: prevPoint ? { date: prevPoint.date, price: prevPoint.price } : null, changedOn,
      change, changePct, lastOrderImpact,
      firstInWindow: first ? { date: first.date, price: first.price } : null,
      windowPct: first && first.price > 0 ? Math.round(((latest.price - first.price) / first.price) * 1000) / 10 : null,
      low: Math.min(...prices), high: Math.max(...prices), orders: history.length,
      best12: bestPoint ? { date: bestPoint.date, price: bestPoint.price } : null,
      spend12, volume12: Math.round(volume12 * 100) / 100, annualVolume: Math.round(annualVolume * 100) / 100,
      overBestPct: bestPoint && bestPoint.price > 0 ? Math.round((overBest / bestPoint.price) * 1000) / 10 : null,
      potentialSaving: overBest >= 0.005 ? r2(overBest * annualVolume) : 0,
    });
  }
  return out;
}

/** Changes smaller than half a cent per kg/L/each are rounding, not a price change. */
export const isRise = (p: ProductPrices) => (p.change ?? 0) >= 0.005;
export const isDrop = (p: ProductPrices) => (p.change ?? 0) <= -0.005;

export function money(n: number | null | undefined, dp = 2) {
  if (n === null || n === undefined) return "—";
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(dp)}`;
}
