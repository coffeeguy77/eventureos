/** Quote maths — mirrors the database exactly (quote_items.line_total and build_quote_snapshot). */

export function round2(n: number) {
  // Postgres numeric round(): half away from zero
  const r = Math.round(Math.abs(n) * 100 + 1e-9) / 100;
  return n < 0 ? -r : r;
}

export function lineTotal(i: { quantity: number; unit_price: number; discount_percent: number; discount_amount?: number }) {
  const gross = (Number(i.quantity) || 0) * (Number(i.unit_price) || 0);
  const afterPct = gross * (1 - (Number(i.discount_percent) || 0) / 100);
  // Same as the database: a dollar discount comes off positive lines and never takes them below zero
  return gross >= 0 ? Math.max(0, round2(afterPct - (Number(i.discount_amount) || 0))) : round2(afterPct);
}

export interface QuoteDiscount { type: "percent" | "amount" | null; value: number }

/** Dollars taken off by the whole-quote discount (mirrors build_quote_snapshot). */
export function quoteDiscountAmount(linesSubtotal: number, d: QuoteDiscount | null | undefined) {
  if (!d?.type || !(d.value > 0)) return 0;
  if (d.type === "percent") return Math.min(linesSubtotal, round2(linesSubtotal * Math.min(100, d.value) / 100));
  return Math.min(Math.max(linesSubtotal, 0), round2(d.value));
}

export interface Totals {
  /** Subtotal ex GST after every discount */
  subtotal: number; tax: number; total: number; optional: number; optionalCount: number;
  /** Line discounts (ex GST) */
  discount: number;
  /** Lines before the whole-quote discount */
  linesSubtotal: number;
  /** Whole-quote discount (ex GST) */
  quoteDiscount: number;
}

/** Optional items (or items in optional sections) are excluded from the totals and summed separately. */
export function quoteTotals(
  items: { section_id: string; quantity: number; unit_price: number; discount_percent: number; discount_amount?: number; tax_rate: number; is_optional: boolean }[],
  optionalSections: Set<string>,
  quoteDiscount?: QuoteDiscount | null
): Totals {
  let sub = 0, tax = 0, optional = 0, optionalCount = 0, discount = 0;
  for (const i of items) {
    const lt = lineTotal(i);
    if (i.is_optional || optionalSections.has(i.section_id)) {
      optional += lt * (1 + (Number(i.tax_rate) || 0) / 100);
      optionalCount++;
      continue;
    }
    sub += lt;
    tax += lt * (Number(i.tax_rate) || 0) / 100;
    discount += round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)) - lt;
  }
  const s = round2(sub), t = round2(tax);
  const qd = quoteDiscountAmount(s, quoteDiscount);
  const sub2 = round2(s - qd);
  const tax2 = s > 0 ? round2(t * sub2 / s) : t;
  return { subtotal: sub2, tax: tax2, total: round2(sub2 + tax2), optional: round2(optional), optionalCount, discount: round2(discount), linesSubtotal: s, quoteDiscount: qd };
}

/** Parse a user-typed number ("$1,250.50", "10%", ""). Returns null when not a number. */
export function parseNum(v: string): number | null {
  const s = v.replace(/[$,%\s]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Show a number without trailing zeros noise: 2 → "2", 1.5 → "1.5". */
export function numStr(n: number | null | undefined) {
  if (n == null) return "";
  return String(Number(n));
}

export function priceStr(n: number | null | undefined) {
  if (n == null) return "";
  return Number(n).toFixed(2);
}
