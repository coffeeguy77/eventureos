/** Quote maths — mirrors the database exactly (quote_items.line_total and build_quote_snapshot). */

export function round2(n: number) {
  // Postgres numeric round(): half away from zero
  const r = Math.round(Math.abs(n) * 100 + 1e-9) / 100;
  return n < 0 ? -r : r;
}

export function lineTotal(i: { quantity: number; unit_price: number; discount_percent: number }) {
  return round2((Number(i.quantity) || 0) * (Number(i.unit_price) || 0) * (1 - (Number(i.discount_percent) || 0) / 100));
}

export interface Totals { subtotal: number; tax: number; total: number; optional: number; optionalCount: number; discount: number }

/** Optional items (or items in optional sections) are excluded from the totals and summed separately. */
export function quoteTotals(
  items: { section_id: string; quantity: number; unit_price: number; discount_percent: number; tax_rate: number; is_optional: boolean }[],
  optionalSections: Set<string>
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
  return { subtotal: s, tax: t, total: round2(s + t), optional: round2(optional), optionalCount, discount: round2(discount) };
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
