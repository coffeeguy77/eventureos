/**
 * Event hire on the public website (coffee carts, the coffee van, equipment-only hire, catering) — pure rules, no database.
 * Settings live in organisations.settings.events. The prices come from the business's price list (services + packages);
 * customers never see them in the builder — the office checks the draft quote and sends it.
 */

import { priceJob, type PackageRules, type PricedService } from "../pricing/engine";

export type HireKind = "cart" | "van" | "diy";
export const HIRE_KINDS: HireKind[] = ["cart", "van", "diy"];

export interface DrinkItem { name: string; note: string | null; tag: string | null }
export interface DrinkGroup { title: string; intro: string | null; items: DrinkItem[] }

export interface EventsSettings {
  enabled: boolean;
  heading: string;                                // hero heading on the events page ("|" = line break)
  intro: string;
  city: string;                                   // "Canberra" — used in page titles like "Coffee Cart Hire Canberra"
  fleet: Record<HireKind, number>;                // how many of each the business has (availability)
  labels: Record<HireKind, string>;               // "Coffee cart", "Coffee van", "Equipment only"
  blurbs: Record<HireKind, string>;
  packages: Partial<Record<HireKind, string>>;    // price-list package ids (blank = matched by name)
  leadDays: number;                               // under this many days away = tentative (staff availability)
  stickerPrice: number | null;                    // branded cup stickers, each (printed + applied)
  stickerSize: string;                            // "50mm round"
  images: Partial<Record<HireKind | "hero" | "branding" | "catering" | "drinks", string>>;
  drinks: DrinkGroup[];                           // the drinks menu page
  areas: string[];                                // places served, for the hire pages
  catering: CateringSettings;
}

/** How the catering order page works (settings.events.catering). Prices on the page are shown + GST. */
export interface CateringSettings {
  minQty: number;                                 // minimum of each item
  deliveryFee: number | null;                     // ex GST; null = no delivery offered
  deliveryPer: "order" | "delivery";              // charge once per order, or for each delivery time
  pickup: boolean;                                // customers can collect for free
  layout: "list" | "tabs";                        // menu after menu, or one tab per menu
  display: "tiles" | "rows";                      // item tiles, or a compact list (name + description on two lines)
  slots: Record<Slot, string[]>;                  // which menus show first for each delivery, in order
}
export const DEFAULT_CATERING: CateringSettings = {
  minQty: 10, deliveryFee: 100, deliveryPer: "order", pickup: true, layout: "list", display: "tiles",
  slots: { morning: ["Breakfast", "Morning & afternoon tea", "Filtered coffee & tea"], lunch: ["Lunch", "Salads"], afternoon: ["Morning & afternoon tea", "Filtered coffee & tea"] },
};

export const DEFAULT_EVENTS: EventsSettings = {
  enabled: false, heading: "Barista coffee | for your next event.", intro: "Coffee carts, a coffee van, equipment hire and catering — build your event online and we'll email your quote.", city: "", fleet: { cart: 1, van: 0, diy: 0 },
  labels: { cart: "Coffee cart", van: "Coffee van", diy: "Equipment only" },
  blurbs: {
    cart: "A barista-run espresso cart for weddings, offices, markets and parties.",
    van: "A coffee van that brings the café to you — made for outdoor events and big crowds.",
    diy: "Professional espresso equipment delivered and set up, so your team can make the coffee.",
  },
  packages: {}, leadDays: 5, stickerPrice: null, stickerSize: "50mm round", images: {}, drinks: [], areas: [], catering: DEFAULT_CATERING,
};

const str = (v: unknown, d: string, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : d);
const url = (v: unknown) => (typeof v === "string" && /^(https:\/\/|\/)/.test(v.trim()) ? v.trim().slice(0, 500) : undefined);
const int = (v: unknown, d: number, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function readEvents(orgSettings: unknown): EventsSettings {
  const raw = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).events : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return DEFAULT_EVENTS;
  const d = DEFAULT_EVENTS;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const fleet = obj(raw.fleet), labels = obj(raw.labels), blurbs = obj(raw.blurbs), pk = obj(raw.packages), im = obj(raw.images);
  const drinks = Array.isArray(raw.drinks) ? raw.drinks.slice(0, 12).map((g) => {
    const o = obj(g);
    return {
      title: str(o.title, "", 60), intro: str(o.intro, "", 300) || null,
      items: (Array.isArray(o.items) ? o.items : []).slice(0, 30).map((it) => { const x = obj(it); return { name: str(x.name, "", 80), note: str(x.note, "", 240) || null, tag: str(x.tag, "", 30) || null }; }).filter((x) => x.name),
    };
  }).filter((g) => g.title) : d.drinks;
  return {
    enabled: raw.enabled === true,
    heading: str(raw.heading, d.heading, 120) || d.heading,
    intro: str(raw.intro, d.intro, 400) || d.intro,
    city: str(raw.city, d.city, 40),
    fleet: { cart: int(fleet.cart, d.fleet.cart, 0, 50), van: int(fleet.van, d.fleet.van, 0, 20), diy: int(fleet.diy, d.fleet.diy, 0, 50) },
    labels: { cart: str(labels.cart, d.labels.cart, 40) || d.labels.cart, van: str(labels.van, d.labels.van, 40) || d.labels.van, diy: str(labels.diy, d.labels.diy, 40) || d.labels.diy },
    blurbs: { cart: str(blurbs.cart, d.blurbs.cart) || d.blurbs.cart, van: str(blurbs.van, d.blurbs.van) || d.blurbs.van, diy: str(blurbs.diy, d.blurbs.diy) || d.blurbs.diy },
    packages: Object.fromEntries(HIRE_KINDS.map((k) => [k, typeof pk[k] === "string" && /^[0-9a-f-]{36}$/i.test(pk[k] as string) ? (pk[k] as string) : undefined]).filter(([, v]) => v)),
    leadDays: int(raw.leadDays, d.leadDays, 0, 60),
    stickerPrice: raw.stickerPrice === null || raw.stickerPrice === undefined || raw.stickerPrice === "" ? null : Math.max(0, Math.round(Number(raw.stickerPrice) * 100) / 100) || null,
    stickerSize: str(raw.stickerSize, d.stickerSize, 40) || d.stickerSize,
    images: Object.fromEntries(["cart", "van", "diy", "hero", "branding", "catering", "drinks"].map((k) => [k, url(im[k])]).filter(([, v]) => v)),
    drinks,
    areas: Array.isArray(raw.areas) ? raw.areas.map((a) => str(a, "", 40)).filter(Boolean).slice(0, 12) : d.areas,
    catering: readCatering(raw.catering),
  };
}

function readCatering(v: unknown): CateringSettings {
  const d = DEFAULT_CATERING;
  if (!v || typeof v !== "object") return d;
  const o = v as Record<string, unknown>;
  const sl = (o.slots && typeof o.slots === "object" ? o.slots : {}) as Record<string, unknown>;
  const list = (x: unknown, def: string[]) => (Array.isArray(x) ? x.map((g) => str(g, "", 60)).filter(Boolean).slice(0, 20) : def);
  const fee = o.deliveryFee === null || o.deliveryFee === "" ? null : Number(o.deliveryFee);
  return {
    minQty: int(o.minQty, d.minQty, 1, 500),
    deliveryFee: o.deliveryFee === undefined ? d.deliveryFee : fee === null || !Number.isFinite(fee) || fee < 0 ? null : Math.round(fee * 100) / 100,
    deliveryPer: o.deliveryPer === "delivery" ? "delivery" : "order",
    pickup: o.pickup === undefined ? d.pickup : o.pickup === true,
    layout: o.layout === "tabs" ? "tabs" : "list",
    display: o.display === "rows" ? "rows" : "tiles",
    slots: { morning: list(sl.morning, d.slots.morning), lunch: list(sl.lunch, d.slots.lunch), afternoon: list(sl.afternoon, d.slots.afternoon) },
  };
}

/** Kinds the business actually offers (has at least one of). */
export const offered = (s: EventsSettings) => HIRE_KINDS.filter((k) => s.fleet[k] > 0);

/** "coffee-cart-hire-canberra" / "coffee-van-hire-canberra" */
export const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
export const hirePageSlug = (kind: "cart" | "van", s: EventsSettings) => `coffee-${kind}-hire${s.city ? `-${slugify(s.city)}` : ""}`;
export function hireKindFromSlug(slug: string): "cart" | "van" | null {
  const m = /^coffee-(cart|van)-hire(?:-[a-z0-9-]+)?$/.exec(slug);
  return m ? (m[1] as "cart" | "van") : null;
}

/* ------------------------------------------------------------------ dates & availability */

export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400e3);

/** Under the lead time the booking is tentative (we confirm once staff are sorted). */
export function isTentative(today: string, firstDate: string, leadDays: number) {
  return daysBetween(today, firstDate) < leadDays;
}

export type DayStatus = { date: string; free: number; total: number; ok: boolean; message: string };

/** What's left on a date for the units wanted. `booked` = units already out that day. */
export function dayStatus(kind: HireKind, date: string, wanted: number, booked: number, s: EventsSettings): DayStatus {
  const total = s.fleet[kind];
  const free = Math.max(0, total - booked);
  const label = s.labels[kind].toLowerCase();
  const ok = free >= wanted && wanted > 0;
  let message: string;
  if (free === 0) message = total === 1 ? `Our ${label} is already booked that day` : `All ${total} are booked that day`;
  else if (!ok) message = `Only ${free} of ${total} free that day`;
  else if (total === 1) message = `Our only ${label} is free — lock it in before someone else does`;
  else if (free <= Math.max(1, Math.floor(total / 4))) message = `Only ${free} of ${total} left that day`;
  else message = `Available`;
  return { date, free, total, ok, message };
}

/* ------------------------------------------------------------------ the builder's request */

export interface HireDay { date: string; start: string; end: string; staff: number; serves: number }
export interface HireRequest {
  kind: HireKind; units: number; days: HireDay[];
  eventType: string; guests: number | null;
  venue: string; address: string; delivery: boolean;
  stickers: number; wrap: boolean; catering: boolean; notes: string;
  contact: { name: string; email: string; phone: string; company: string };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Why the request can't go in yet (first problem), or null. */
export function requestProblem(r: HireRequest, s: EventsSettings, today: string): string | null {
  if (!offered(s).includes(r.kind)) return "Choose what you'd like to hire.";
  if (r.units < 1 || r.units > s.fleet[r.kind]) return `Choose between 1 and ${s.fleet[r.kind]}.`;
  if (!r.days.length) return "Add your event date.";
  if (r.days.length > 14) return "Up to 14 days at a time — contact us for longer.";
  const seen = new Set<string>();
  for (const [i, d] of r.days.entries()) {
    const n = r.days.length > 1 ? ` (day ${i + 1})` : "";
    if (!DATE.test(d.date)) return `Choose a date${n}.`;
    if (d.date < today) return `That date has passed${n}.`;
    if (seen.has(d.date)) return `The same date is in twice${n}.`;
    seen.add(d.date);
    if (r.kind !== "diy") {
      if (!TIME.test(d.start) || !TIME.test(d.end)) return `Add a start and finish time${n}.`;
      if (d.staff < 1 || d.staff > r.units * 3) return `Choose how many baristas${n}.`;
      if (toMinutes(d.end) <= toMinutes(d.start)) return `The finish time is before the start${n}.`;
      if (d.serves < 0 || d.serves > 5000) return `Check the number of coffees${n}.`;
    }
  }
  if (!r.contact.name.trim() || r.contact.name.trim().length < 2) return "Add your name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.contact.email.trim())) return "Add a valid email — your quote goes there.";
  if (r.stickers < 0 || r.stickers > 20000) return "Check the number of cup stickers.";
  return null;
}

/** Quote section title: "Day 1 · Sat 14 Nov · 2 coffee carts" */
export function dayTitle(i: number, total: number, date: string, kind: HireKind, units: number, s: EventsSettings) {
  const when = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  const what = units > 1 ? `${units} × ${s.labels[kind]}` : s.labels[kind];
  return `${total > 1 ? `Day ${i + 1} · ` : ""}${when} · ${what}`;
}

/* ------------------------------------------------------------------ catering */

export type Slot = "morning" | "lunch" | "afternoon";
export const SLOTS: { id: Slot; label: string; time: string }[] = [
  { id: "morning", label: "Morning delivery", time: "09:30" },
  { id: "lunch", label: "Lunch delivery", time: "12:00" },
  { id: "afternoon", label: "Afternoon delivery", time: "14:30" },
];
export interface CateringLine { serviceId: string; qty: number }
export interface CateringSlot { slot: Slot; time: string; items: CateringLine[] }

/** "Catering · Morning & afternoon tea" → "Morning & afternoon tea" */
export const cateringGroup = (category: string | null) => (category ?? "").replace(/^catering\s*[·:\-–]\s*/i, "").trim() || "Catering";
export const isCatering = (category: string | null) => /^catering\b/i.test(category ?? "");

/* ------------------------------------------------------------------ pricing the request (server only shows totals to the office) */


export interface QuoteItem { name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number; service_id: string | null; is_optional: boolean }
export interface QuoteSection { title: string; items: QuoteItem[] }

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

/**
 * The draft quote for a hire request, priced from the business's own package rules.
 * Carts & van: one section per day (hire × units, baristas, coffees). Delivery once per unit for the booking.
 * Equipment only: one section, daily hire × days × kits.
 */
export function hireSections(r: HireRequest, rules: PackageRules, services: PricedService[], s: EventsSettings): { sections: QuoteSection[]; notes: string[] } {
  const toItem = (l: { name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number; service_id: string; optional?: boolean }, mult = 1): QuoteItem =>
    ({ name: l.name, description: l.description, quantity: r2(l.quantity * mult), unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate, service_id: l.service_id, is_optional: !!l.optional });
  const sections: QuoteSection[] = [];
  const notes: string[] = [];
  const days = [...r.days].sort((a, b) => a.date.localeCompare(b.date));
  if (r.kind === "diy") {
    const res = priceJob(rules, services, { start_minutes: 0, end_minutes: 60, serves: 0, staff_count: 0, days: days.length, include_delivery: r.delivery, offer_delivery: !r.delivery });
    const items = res.lines.map((l) => toItem(l, l.kind === "hire" || (l.kind === "delivery" && l.unit_price > 0) ? r.units : 1));
    const when = days.length > 1 ? `${fmtDate(days[0].date)} – ${fmtDate(days[days.length - 1].date)} (${days.length} days)` : fmtDate(days[0].date);
    sections.push({ title: `${r.units > 1 ? `${r.units} × ` : ""}${s.labels.diy} · ${when}`, items });
  } else {
    days.forEach((d, i) => {
      const res = priceJob(rules, services, { start_minutes: toMinutes(d.start), end_minutes: toMinutes(d.end), serves: d.serves, staff_count: d.staff, include_delivery: i === 0 && r.delivery, days: 1 });
      const items = res.lines.filter((l) => !(i > 0 && l.kind === "delivery")).map((l) => toItem(l, l.kind === "hire" || l.kind === "delivery" ? r.units : 1));
      sections.push({ title: `${dayTitle(i, days.length, d.date, r.kind, r.units, s)} · ${d.start}–${d.end}`, items });
      for (const n of res.notes) notes.push(`${days.length > 1 ? `Day ${i + 1}: ` : ""}${n}`);
    });
  }
  const extras: QuoteItem[] = [];
  // Branding lines use the price-list item when there is one (so they carry its Xero account), else the website settings
  const sticker = services.find((x) => /sticker/i.test(x.name));
  const wrap = services.find((x) => /\bwrap\b|signage/i.test(x.name) && !/sticker/i.test(x.name));
  const stickerPrice = sticker ? sticker.unit_price : s.stickerPrice;
  if (r.stickers > 0 && stickerPrice) extras.push({ name: sticker?.name ?? `Branded cup stickers (${s.stickerSize}, printed + applied)`, description: sticker?.description ?? "Your logo on every cup", quantity: r.stickers, unit: sticker?.unit ?? "each", unit_price: stickerPrice, tax_rate: sticker?.tax_rate ?? 10, service_id: sticker?.id ?? null, is_optional: false });
  if (r.wrap) extras.push({ name: `${s.labels[r.kind]} wrap / signage`, description: "Your branding on the " + s.labels[r.kind].toLowerCase() + " — priced once we see your artwork", quantity: 1, unit: wrap?.unit ?? null, unit_price: 0, tax_rate: wrap?.tax_rate ?? 10, service_id: wrap?.id ?? null, is_optional: true });
  if (extras.length) sections.push({ title: "Branding", items: extras });
  return { sections, notes };
}

export function sectionsTotal(sections: QuoteSection[]) {
  const sub = sections.flatMap((x) => x.items).filter((i) => !i.is_optional).reduce((a, i) => a + r2(i.quantity * i.unit_price), 0);
  const tax = sections.flatMap((x) => x.items).filter((i) => !i.is_optional).reduce((a, i) => a + r2(i.quantity * i.unit_price) * (i.tax_rate / 100), 0);
  return { subtotal: r2(sub), tax: r2(tax), total: r2(sub + tax) };
}

/* ------------------------------------------------------------------ catering order */

export interface CateringItem { id: string; name: string; description: string | null; group: string; unit: string | null; unit_price: number; tax_rate: number }
export interface CateringOrder { date: string; venue: string; address: string; guests: number | null; notes: string; slots: CateringSlot[]; contact: HireRequest["contact"]; pickup: boolean }

export function cateringProblem(o: CateringOrder, menu: CateringItem[], today: string, cs: CateringSettings = DEFAULT_CATERING): string | null {
  if (!DATE.test(o.date)) return "Choose your date.";
  if (o.date < today) return "That date has passed.";
  const byId = new Map(menu.map((m) => [m.id, m]));
  const lines = o.slots.flatMap((s) => s.items).filter((l) => l.qty > 0);
  if (!lines.length) return "Add something from the menu.";
  if (lines.some((l) => !byId.has(l.serviceId) || l.qty > 2000 || !Number.isInteger(l.qty))) return "Check the quantities.";
  const small = lines.find((l) => l.qty < cs.minQty);
  if (small) return `${byId.get(small.serviceId)!.name}: the minimum is ${cs.minQty}.`;
  if (o.slots.some((s) => s.items.some((l) => l.qty > 0) && !TIME.test(s.time))) return "Choose a time.";
  if (o.pickup && !cs.pickup) return "Choose delivery.";
  if (!o.pickup && cs.deliveryFee === null) return "Choose pickup.";
  if (!o.pickup && !o.address.trim()) return "Add the delivery address.";
  if (!o.contact.name.trim() || o.contact.name.trim().length < 2) return "Add your name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.contact.email.trim())) return "Add a valid email.";
  return null;
}

/** How many deliveries an order needs (one per delivery time with something on it). */
export const deliveryCount = (o: Pick<CateringOrder, "slots">) => o.slots.filter((s) => s.items.some((l) => l.qty > 0)).length;
export function deliveryCharge(o: Pick<CateringOrder, "slots" | "pickup">, cs: CateringSettings) {
  if (o.pickup || cs.deliveryFee === null) return { qty: 0, each: 0 };
  const n = deliveryCount(o);
  return { qty: n ? (cs.deliveryPer === "delivery" ? n : 1) : 0, each: cs.deliveryFee };
}

export function cateringSections(o: CateringOrder, menu: CateringItem[], cs: CateringSettings = DEFAULT_CATERING): QuoteSection[] {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const out: QuoteSection[] = [];
  for (const sl of SLOTS) {
    const slot = o.slots.find((x) => x.slot === sl.id);
    const items = (slot?.items ?? []).filter((l) => l.qty > 0 && byId.has(l.serviceId)).map((l) => {
      const m = byId.get(l.serviceId)!;
      return { name: m.name, description: m.description, quantity: l.qty, unit: m.unit, unit_price: m.unit_price, tax_rate: m.tax_rate, service_id: m.id, is_optional: false };
    });
    if (items.length) out.push({ title: `${o.pickup ? sl.label.replace("delivery", "pickup") : sl.label} · ${fmtDate(o.date)} · ${slot!.time}`, items });
  }
  const d = deliveryCharge(o, cs);
  if (out.length) out.push({ title: o.pickup ? "Pickup" : "Delivery", items: [o.pickup
    ? { name: "Pickup — free", description: "You collect the order", quantity: 1, unit: null, unit_price: 0, tax_rate: 10, service_id: null, is_optional: false }
    : { name: "Catering delivery", description: o.address.trim() || null, quantity: d.qty, unit: d.qty > 1 ? "delivery" : null, unit_price: d.each, tax_rate: 10, service_id: null, is_optional: false }] });
  return out;
}

/** Menus in the order the business wants for a delivery time; the rest come after. */
export function menuOrder(groups: string[], slot: Slot, cs: CateringSettings) {
  const pref = cs.slots[slot].map((g) => g.toLowerCase());
  const first = pref.map((p) => groups.find((g) => g.toLowerCase() === p)).filter((g): g is string => !!g);
  return { first, rest: groups.filter((g) => !first.includes(g)) };
}
