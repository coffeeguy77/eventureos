/**
 * Square API (read only) for Business Sales.
 * Locations: GET /v2/locations · Orders: POST /v2/orders/search · Catalog: GET /v2/catalog/list · Merchant: GET /v2/merchants/me
 * https://developer.squareup.com/reference/square
 */
export const SQUARE_API = "https://connect.squareup.com/v2";
export const SQUARE_VERSION = "2024-01-17";
export const squareHeaders = { "square-version": SQUARE_VERSION, "content-type": "application/json" };

export interface SquareLocation { id: string; name: string; timezone: string; status: string }

/** Who connected (straight after the OAuth code exchange). */
export async function squareMerchant(accessToken: string): Promise<{ id: string; name: string }> {
  const r = await fetch(`${SQUARE_API}/merchants/me`, { headers: { ...squareHeaders, authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Square didn't return the business details (${r.status}).`);
  const d = (await r.json()) as { merchant?: { id: string; business_name?: string } };
  if (!d.merchant?.id) throw new Error("Square didn't return the business details.");
  return { id: d.merchant.id, name: d.merchant.business_name || "Square business" };
}

/** The local calendar day of a UTC timestamp in a location's time zone (early trade otherwise lands on the day before). */
export function localDay(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

const money = (m?: { amount?: number | null } | null) => (Number(m?.amount ?? 0) || 0) / 100;

export interface SquareLineItem {
  name?: string; quantity?: string; catalog_object_id?: string; variation_name?: string;
  total_money?: { amount?: number }; total_tax_money?: { amount?: number };
}
export interface SquareOrder {
  id: string; location_id: string; created_at: string; state?: string;
  total_money?: { amount?: number }; total_tax_money?: { amount?: number }; total_tip_money?: { amount?: number };
  net_amounts?: { total_money?: { amount?: number }; tax_money?: { amount?: number }; tip_money?: { amount?: number } };
  line_items?: SquareLineItem[];
  /** payments on the order; an OPEN order that's paid (e.g. an app/online order never marked done) still counts */
  tenders?: { id?: string }[];
  net_amount_due_money?: { amount?: number };
}

export interface DayRow { day: string; category: string; sales: number; gst: number; orders: number; items: number }
export interface ItemRow { month: string; item: string; category: string; qty: number; sales: number }

/**
 * Totals for one location's orders: per day (category '' = whole orders, ex GST, no tips, after refunds),
 * per day per category (line items ex GST) and per month per item.
 */
/** Fully paid: has a payment and nothing left owing. */
export function isPaid(o: SquareOrder): boolean {
  return (o.tenders?.length ?? 0) > 0 && (o.net_amount_due_money?.amount ?? 0) <= 0;
}

export function aggregateOrders(orders: SquareOrder[], tz: string, categoryOf: (catalogId: string | undefined) => string): { days: DayRow[]; items: ItemRow[] } {
  const days = new Map<string, DayRow>(), items = new Map<string, ItemRow>();
  const day = (d: string, c: string) => {
    const k = `${d}|${c}`;
    let r = days.get(k);
    if (!r) { r = { day: d, category: c, sales: 0, gst: 0, orders: 0, items: 0 }; days.set(k, r); }
    return r;
  };
  for (const o of orders) {
    if (o.state && o.state !== "COMPLETED" && !(o.state === "OPEN" && isPaid(o))) continue;
    const d = localDay(o.created_at, tz);
    const net = o.net_amounts ?? {};
    const total = net.total_money ? money(net.total_money) : money(o.total_money);
    const tax = net.tax_money ? money(net.tax_money) : money(o.total_tax_money);
    const tip = net.tip_money ? money(net.tip_money) : money(o.total_tip_money);
    const whole = day(d, "");
    whole.sales += total - tax - tip; whole.gst += tax; whole.orders += 1;
    const seen = new Set<string>();
    for (const li of o.line_items ?? []) {
      const lineSales = money(li.total_money) - money(li.total_tax_money);
      const qty = Number(li.quantity ?? 1) || 0;
      const cat = categoryOf(li.catalog_object_id);
      const r = day(d, cat);
      r.sales += lineSales; r.gst += money(li.total_tax_money); r.items += qty;
      if (!seen.has(cat)) { r.orders += 1; seen.add(cat); }
      whole.items += qty;
      const name = (li.name || "Custom amount").trim().slice(0, 200) + (li.variation_name && li.variation_name !== "Regular" ? ` (${li.variation_name})` : "");
      const m = `${d.slice(0, 7)}-01`, ik = `${m}|${name}`;
      let it = items.get(ik);
      if (!it) { it = { month: m, item: name.slice(0, 250), category: cat, qty: 0, sales: 0 }; items.set(ik, it); }
      it.qty += qty; it.sales += lineSales;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    days: [...days.values()].map((r) => ({ ...r, sales: r2(r.sales), gst: r2(r.gst), items: r2(r.items) })),
    items: [...items.values()].map((r) => ({ ...r, qty: r2(r.qty), sales: r2(r.sales) })),
  };
}
