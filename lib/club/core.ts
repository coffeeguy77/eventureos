/**
 * Cart Club — a booking page for a business's special clients (e.g. a hotel that hires a cart a few times a month,
 * another operator who books for their own clients, a venue with a standard order). Each client has its own address,
 * its own rates and its own billing. Pure — used by the club pages, the office pages, the server and tests.
 *
 * Delivery rule: a cart is delivered the day before (12–4pm) and picked up 9am the day after. One delivery fee covers a
 * run of days; days with no more than 2 clear days between them stay in the same run (the cart stays on site). A
 * booking that starts or ends within that distance of the client's other booked cart days pays no delivery.
 */
import { addDays, datesText } from "@/lib/events/days";

export const OFFERS = ["cart", "van", "baristas", "coffees"] as const;
export type Offer = (typeof OFFERS)[number];
export const OFFER_LABEL: Record<Offer, string> = { cart: "Coffee cart (with delivery)", van: "Coffee van", baristas: "Baristas", coffees: "Coffees" };

/** All amounts ex GST. */
export interface ClubRates {
  cart: number;        // per cart per day
  van: number;         // per van per day
  delivery: number;    // per delivery run (delivery, install and pickup)
  barista: number;     // per barista per hour
  coffee: number;      // per coffee
  minHours: number;    // minimum hours charged per barista per day
  setupHours: number;  // setup time charged per barista per day on top of service time
}
export const NO_RATES: ClubRates = { cart: 0, van: 0, delivery: 0, barista: 0, coffee: 0, minHours: 0, setupHours: 0 };

/** Accounting item codes for invoice lines (set once for the business). */
export interface ClubCodes { cart: string; van: string; delivery: string; barista: string; coffee: string }
export const NO_CODES: ClubCodes = { cart: "", van: "", delivery: "", barista: "", coffee: "" };

export interface ClubDay { date: string; start: string | null; finish: string | null }
export interface ClubOrder { days: ClubDay[]; carts: number; van: number; baristas: number; coffees: number }
export interface StandardOrder { name: string; carts: number; van: number; baristas: number; hours: number; coffees: number }
export type LineKey = "cart" | "van" | "delivery" | "barista" | "coffee";
export interface PricedLine { key: LineKey; label: string; qty: number; unit: number; amount: number; note: string }
export interface Priced { lines: PricedLine[]; subtotal: number; gst: number; total: number; deliveries: number; covered: { from: string; near: string }[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, d = 0, min = 0, max = 1e6) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const int = (v: unknown, min: number, max: number) => Math.round(num(v, 0, min, max));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export function readRates(raw: unknown): ClubRates {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    cart: r2(num(o.cart)), van: r2(num(o.van)), delivery: r2(num(o.delivery)), barista: r2(num(o.barista)), coffee: r2(num(o.coffee)),
    minHours: num(o.minHours, 0, 0, 12), setupHours: num(o.setupHours, 0, 0, 4),
  };
}

export function readCodes(raw: unknown): ClubCodes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { cart: str(o.cart, 30), van: str(o.van, 30), delivery: str(o.delivery, 30), barista: str(o.barista, 30), coffee: str(o.coffee, 30) };
}

export const cleanOffers = (raw: unknown): Offer[] => {
  const list = Array.isArray(raw) ? raw.filter((x): x is Offer => (OFFERS as readonly string[]).includes(x as string)) : [];
  return OFFERS.filter((o) => list.includes(o));
};

export function cleanStandardOrders(raw: unknown): StandardOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { name: str(o.name, 80) || "Standard order", carts: int(o.carts, 0, 20), van: int(o.van, 0, 5), baristas: int(o.baristas, 0, 20), hours: num(o.hours, 0, 0, 16), coffees: int(o.coffees, 0, 100000) };
  }).filter((o) => o.carts || o.van || o.baristas || o.coffees);
}

/** A club address: lower-case letters, numbers and dashes. */
export function cleanSlug(raw: unknown): string | null {
  const s = String(raw ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "").slice(0, 40);
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(s) ? s : null;
}

const time = (v: unknown) => (typeof v === "string" && TIME.test(v.slice(0, 5).padStart(5, "0")) ? v.slice(0, 5).padStart(5, "0") : null);

export function cleanDays(raw: unknown): ClubDay[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ClubDay[] = [];
  for (const x of raw.slice(0, 60)) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (!isDate(o.date) || seen.has(o.date)) continue;
    seen.add(o.date);
    out.push({ date: o.date, start: time(o.start), finish: time(o.finish) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 31);
}

export function cleanOrder(raw: unknown, offers: readonly Offer[]): ClubOrder {
  const o = (raw ?? {}) as Record<string, unknown>;
  const has = (k: Offer) => offers.includes(k);
  return {
    days: cleanDays(o.days),
    carts: has("cart") ? int(o.carts, 0, 20) : 0,
    van: has("van") ? int(o.van, 0, 5) : 0,
    baristas: has("baristas") ? int(o.baristas, 0, 20) : 0,
    coffees: has("coffees") ? int(o.coffees, 0, 100000) : 0,
  };
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Service hours for a day (finish − start), 0 when the times aren't set. */
export function serviceHours(d: ClubDay): number {
  if (!d.start || !d.finish) return 0;
  const m = minutes(d.finish) - minutes(d.start);
  return m > 0 ? m / 60 : 0;
}
/** Hours charged per barista for a day: service + setup, at least the minimum. */
export const baristaHours = (d: ClubDay, r: ClubRates) => Math.max(r.minHours, serviceHours(d) + r.setupHours);

/** What's missing before an order can be saved (plain English), or null. */
export function orderProblem(o: ClubOrder, today: string): string | null {
  if (!o.days.length) return "Add the date (or dates) you need.";
  if (o.days[0].date < today) return "That date has passed — choose a date from today on.";
  if (!o.carts && !o.van && !o.baristas && !o.coffees) return "Choose what you need.";
  if (o.baristas) {
    const bad = o.days.find((d) => !serviceHours(d));
    if (bad) return `Add the service start and finish times for ${datesText([bad.date])} so we can work out barista hours.`;
  }
  return null;
}

/** Runs of dates: a new run starts when there are more than 2 clear days since the last date. */
export function segments(dates: string[]): string[][] {
  const ds = [...new Set(dates.filter(isDate))].sort();
  const out: string[][] = [];
  for (const d of ds) {
    const cur = out[out.length - 1];
    if (cur && dayDiff(cur[cur.length - 1], d) <= 3) cur.push(d); else out.push([d]);
  }
  return out;
}

/** How far (in days) a run is from a date: 0 inside it. */
const distance = (seg: string[], d: string) => (d < seg[0] ? dayDiff(d, seg[0]) : d > seg[seg.length - 1] ? dayDiff(seg[seg.length - 1], d) : 0);

/**
 * Price an order at the client's rates. `otherCartDays` = the client's other booked days with a cart on site
 * (a run within 3 days of one of those needs no delivery of its own).
 */
export function priceOrder(o: ClubOrder, r: ClubRates, otherCartDays: string[] = []): Priced {
  const dates = o.days.map((d) => d.date);
  const when = datesText(dates);
  const lines: PricedLine[] = [];
  const add = (key: LineKey, label: string, qty: number, unit: number, note: string) => { if (qty > 0) lines.push({ key, label, qty: r2(qty), unit, amount: r2(qty * unit), note }); };
  let deliveries = 0;
  const covered: { from: string; near: string }[] = [];
  if (o.carts > 0 && dates.length) {
    add("cart", "Coffee cart hire", o.carts * dates.length, r.cart, `${o.carts > 1 ? `${o.carts} carts · ` : ""}${when}`);
    for (const seg of segments(dates)) {
      const near = otherCartDays.filter(isDate).find((d) => distance(seg, d) <= 3);
      if (near) covered.push({ from: seg[0], near }); else deliveries++;
    }
    add("delivery", "Delivery, install & pickup", deliveries, r.delivery, "Delivered the day before (12–4pm), picked up 9am the day after");
  }
  if (o.van > 0 && dates.length) add("van", "Coffee van hire", o.van * dates.length, r.van, `${o.van > 1 ? `${o.van} vans · ` : ""}${when}`);
  if (o.baristas > 0 && dates.length) {
    const hours = o.days.reduce((a, d) => a + baristaHours(d, r), 0);
    const each = o.days.map((d) => `${datesText([d.date])} ${d.start}–${d.finish}`).join("; ");
    add("barista", "Barista hire", o.baristas * hours, r.barista, `${o.baristas} barista${o.baristas > 1 ? "s" : ""} · ${each}${r.setupHours ? ` (+${r.setupHours * 60} min setup each)` : ""}`);
  }
  if (o.coffees > 0) add("coffee", "Coffees", o.coffees, r.coffee, `${o.coffees} hot drinks`);
  const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0));
  const gst = r2(subtotal * 0.1);
  return { lines, subtotal, gst, total: r2(subtotal + gst), deliveries, covered };
}

/** A standard order as an order for one date. */
export function fromStandard(s: StandardOrder, date: string, start: string | null): ClubOrder {
  let finish: string | null = null;
  if (start && s.hours > 0) {
    const m = minutes(start) + Math.round(s.hours * 60);
    finish = m < 24 * 60 ? `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : "23:59";
  }
  return { days: [{ date, start, finish }], carts: s.carts, van: s.van, baristas: s.baristas, coffees: s.coffees };
}

export interface Run { starts: string; ends: string; carts: number }

/** Delivery runs for a client: every booked cart day merged (carts on the busiest day), split where the cart would come back. */
export function runsFor(bookings: { days: string[]; carts: number }[]): Run[] {
  const per = new Map<string, number>();
  for (const b of bookings) if (b.carts > 0) for (const d of b.days) if (isDate(d)) per.set(d, (per.get(d) ?? 0) + b.carts);
  return segments([...per.keys()]).map((seg) => ({ starts: seg[0], ends: seg[seg.length - 1], carts: Math.max(...seg.map((d) => per.get(d) ?? 0)) }));
}
export const deliveryDay = (run: Pick<Run, "starts">) => addDays(run.starts, -1);
export const pickupDay = (run: Pick<Run, "ends">) => addDays(run.ends, 1);

/** A quote not yet booked, under a week away, not chased yet. */
export const followUpDue = (b: { status: string; first_day: string | null; follow_up_at: string | null }, today: string) =>
  b.status === "quote" && !b.follow_up_at && !!b.first_day && b.first_day >= today && dayDiff(today, b.first_day) <= 7;

/** When an invoice is due: days after it's raised, or days before the event (never before today). */
export function dueDate(rule: "after_invoice" | "before_event", days: number, today: string, firstDay: string | null): string {
  if (rule === "before_event" && firstDay) { const d = addDays(firstDay, -days); return d < today ? today : d; }
  return addDays(today, days);
}

/** The month before `today` (for month-end invoices): [first, last]. */
export function lastMonth(today: string): [string, string] {
  const first = `${today.slice(0, 7)}-01`;
  const end = addDays(first, -1);
  return [`${end.slice(0, 7)}-01`, end];
}

/** "Fri 7 Nov 2026" style text for a list of club days. */
export const daysText = (days: Pick<ClubDay, "date">[]) => datesText(days.map((d) => d.date));
