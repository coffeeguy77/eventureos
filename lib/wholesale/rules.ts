/**
 * Wholesale rules: delivery dates, prices and order totals. Pure — used by the screens, the ordering link, the importers
 * and tests. Prices are ex GST; each product is GST (10) or GST-free (0).
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * Which delivery run an order placed on `orderDate` goes on. No cut-off: anything placed before the delivery day goes
 * on that week's run; an order placed on the delivery day (or after) goes on the next one.
 */
export function deliveryDateFor(orderDate: string, deliveryWeekday: number): string {
  const diff = (deliveryWeekday - weekday(orderDate) + 7) % 7;
  return addDays(orderDate, diff === 0 ? 7 : diff);
}

/** The run to show by default: today if today is a delivery day, else the next one. */
export function currentRun(today: string, deliveryWeekday: number): string {
  const diff = (deliveryWeekday - weekday(today) + 7) % 7;
  return addDays(today, diff);
}

export const shiftRun = (run: string, weeks: number) => addDays(run, weeks * 7);

/** The weight in a product's name, e.g. "Parliament Blend 1 kg" → 1, "Decaf 250g" → 0.25. */
export function weightFromName(name: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram)s?\b/i.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return /^k/i.test(m[2]) ? n : n / 1000;
}

/** For matching names across Ordermentum, the email and our product list: lower case, no spaces or punctuation. */
export const nameKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export interface PriceProduct { id: string; unit_price: number; tax_rate: number }
export interface GroupPrice { product_id: string; price_group: string; unit_price: number }

/** The customer's price for a product: their price group's price, else the product's price. */
export function priceFor(p: PriceProduct, group: string | null | undefined, groupPrices: GroupPrice[]): number {
  const g = group ? groupPrices.find((x) => x.product_id === p.id && x.price_group === group) : null;
  return Number(g?.unit_price ?? p.unit_price);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TotalsLine { quantity: number; unit_price: number; tax_rate: number }
export function orderTotals(lines: TotalsLine[], freight = 0, freightTaxRate = 10) {
  const subtotal = r2(lines.reduce((t, l) => t + l.quantity * l.unit_price, 0));
  const gst = r2(lines.reduce((t, l) => t + (l.quantity * l.unit_price * l.tax_rate) / 100, 0) + (freight * freightTaxRate) / 100);
  return { subtotal, freight: r2(freight), gst, total: r2(subtotal + freight + gst) };
}

/** Coffee by its name (for order lines that don't match a product): blends, espresso, single origin, decaf, beans. */
export const looksLikeCoffee = (name: string) => /\b(blend|espresso|coffee|single origin|decaf|beans?|roast)\b/i.test(name) && !/\b(clean|cup|lid|filter|syrup|chai|choc)/i.test(name);

/** What to roast / pack for a run: each product's quantity, and kilos for lines that have a coffee weight. */
export function runTotals(lines: { name: string; quantity: number; weight_kg: number | null }[]) {
  const m = new Map<string, { name: string; quantity: number; kg: number | null }>();
  for (const l of lines) {
    const k = nameKey(l.name);
    const cur = m.get(k) ?? { name: l.name, quantity: 0, kg: null };
    cur.quantity += Number(l.quantity);
    const w = l.weight_kg;
    if (w != null) cur.kg = (cur.kg ?? 0) + w * Number(l.quantity);
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => (b.kg ?? -1) - (a.kg ?? -1) || a.name.localeCompare(b.name));
}

export interface BoxLine { name: string; quantity: number; weight_kg: number | null }
export interface Box { kind: "coffee" | "other"; kg: number; items: { name: string; quantity: number }[] }

/**
 * How an order packs into boxes for labels: coffee (lines with a weight) fills boxes of `boxKg` kilos, biggest bags
 * first; a bag bigger than a box gets a box of its own. Everything else (no weight — cleaner, cups, hire) goes in one
 * extra box. Returns at least one box when the order has anything on it.
 */
export function packBoxes(lines: BoxLine[], boxKg = 10): Box[] {
  const cap = boxKg > 0 ? boxKg : 10;
  const units: { name: string; kg: number }[] = [];
  const other: Box = { kind: "other", kg: 0, items: [] };
  for (const l of lines) {
    const q = Math.round(Number(l.quantity));
    if (!(q > 0)) continue;
    const w = l.weight_kg == null ? null : Number(l.weight_kg);
    if (w && w > 0) for (let i = 0; i < Math.min(q, 2000); i++) units.push({ name: l.name, kg: w });
    else other.items.push({ name: l.name, quantity: q });
  }
  units.sort((a, b) => b.kg - a.kg);
  const boxes: Box[] = [];
  for (const u of units) {
    const fit = boxes.find((b) => b.kg + u.kg <= cap + 1e-9);
    const box = fit ?? (boxes[boxes.push({ kind: "coffee", kg: 0, items: [] }) - 1]);
    box.kg = Math.round((box.kg + u.kg) * 1000) / 1000;
    const it = box.items.find((x) => x.name === u.name);
    if (it) it.quantity += 1; else box.items.push({ name: u.name, quantity: 1 });
  }
  if (other.items.length) boxes.push(other);
  return boxes;
}
