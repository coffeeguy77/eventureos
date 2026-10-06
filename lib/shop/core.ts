/**
 * Coffee shop — pure rules (no database): settings, prices, coupons, shipping, delivery dates, grind guide.
 * Everything a business sets lives in organisations.settings.shop; the defaults here are neutral starting points.
 */

export type Mode = "one_off" | "subscription" | "prepaid";
export type Delivery = "post" | "pickup" | "event";
export type IntervalUnit = "week" | "month";

export interface GrindStep { label: string; dial: string; use: string }
export interface Prepaid { months: 3 | 6 | 12; discount: number }

export interface ShopSettings {
  enabled: boolean;
  title: string;
  tagline: string;
  heroImage: string | null;
  subsImage: string | null;         // photo on the subscriptions page and the gift-subscription panel (e.g. the delivery box)
  subsHero: string | null;          // wide picture behind the subscriptions page heading (blank = the subscriptions photo)
  roastedIn: string;                // "Locally roasted in …" (blank = not shown)
  flatRate: number;
  freeOver: number | null;
  pickup: boolean;
  pickupNote: string | null;
  subDiscount: number;              // % off every subscription delivery
  prepaid: Prepaid[];               // prepaid packages; discount is % off on top of the subscription price
  frequencies: { unit: IntervalUnit; count: number }[];   // the quick picks (customers can still choose their own)
  roastNote: string;
  roastDays: number[];              // 1 = Monday … 7 = Sunday (shown to customers)
  dispatchDays: number[];           // 1 = Monday … 7 = Sunday
  carrier: string;                  // e.g. the postal service used
  leadDays: number;                 // earliest dispatch is this many days after ordering
  giftAmounts: number[];
  giftExpiryMonths: number;
  giftCardArt: string | null;       // artwork behind the gift card wording (blank artwork)
  giftTagline: string;              // script line on the gift card front
  grinder: string;                  // shown on the grind guide, e.g. the grinder model
  grindChart: GrindStep[];
  eventAddon: boolean;              // offer bags of coffee to event / equipment-hire customers
}

export const DEFAULT_GRINDS = ["Whole beans", "Espresso", "Stovetop", "Filter machine", "Plunger"];

/** Typical starting points from finest to coarsest. The business edits the dial numbers to match its own grinder. */
export const DEFAULT_GRIND_CHART: GrindStep[] = [
  { label: "Espresso", dial: "1–3", use: "Home and café espresso machines" },
  { label: "Stovetop", dial: "3–5", use: "Moka pot / stovetop" },
  { label: "AeroPress", dial: "5–7", use: "AeroPress and small drippers" },
  { label: "Pour over", dial: "7–9", use: "V60, Kalita, Chemex" },
  { label: "Filter machine", dial: "8–10", use: "Drip and batch-brew machines" },
  { label: "Plunger", dial: "10–13", use: "French press / plunger" },
  { label: "Cold brew", dial: "12–15", use: "Cold brew and long steeps" },
];

export const DEFAULT_SHOP: ShopSettings = {
  enabled: false,
  title: "Coffee shop",
  tagline: "Freshly roasted coffee, delivered.",
  heroImage: null,
  subsImage: null,
  subsHero: null,
  roastedIn: "",
  flatRate: 10,
  freeOver: null,
  pickup: false,
  pickupNote: null,
  subDiscount: 10,
  prepaid: [{ months: 3, discount: 0 }, { months: 6, discount: 0 }, { months: 12, discount: 0 }],
  frequencies: [{ unit: "week", count: 1 }, { unit: "week", count: 2 }, { unit: "week", count: 3 }, { unit: "week", count: 4 }, { unit: "week", count: 6 }, { unit: "month", count: 2 }],
  roastNote: "",
  roastDays: [],
  dispatchDays: [4, 5],
  carrier: "",
  leadDays: 1,
  giftAmounts: [25, 50, 75, 100, 150, 200],
  giftExpiryMonths: 36,
  giftCardArt: null,
  giftTagline: "Freshly roasted, just for you.",
  grinder: "",
  grindChart: DEFAULT_GRIND_CHART,
  eventAddon: true,
};

const num = (v: unknown, d: number, min = 0, max = 100000) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
const str = (v: unknown, d: string, max = 400) => (typeof v === "string" ? v.slice(0, max) : d);

export function readShop(orgSettings: unknown): ShopSettings {
  const raw = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).shop : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return DEFAULT_SHOP;
  const d = DEFAULT_SHOP;
  const arr = <T,>(v: unknown, f: (x: unknown) => T | null, def: T[]) => (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : def);
  return {
    enabled: raw.enabled === true,
    title: str(raw.title, d.title, 80) || d.title,
    tagline: str(raw.tagline, d.tagline, 200),
    heroImage: typeof raw.heroImage === "string" && /^https:\/\/|^\//.test(raw.heroImage) ? raw.heroImage : null,
    subsImage: typeof raw.subsImage === "string" && /^https:\/\/|^\//.test(raw.subsImage) ? raw.subsImage : null,
    roastedIn: str(raw.roastedIn, "", 40),
    subsHero: typeof raw.subsHero === "string" && /^https:\/\/|^\//.test(raw.subsHero) ? raw.subsHero : null,
    flatRate: num(raw.flatRate, d.flatRate, 0, 1000),
    freeOver: raw.freeOver === null || raw.freeOver === "" ? null : raw.freeOver === undefined ? d.freeOver : num(raw.freeOver, 0, 0, 100000) || null,
    pickup: raw.pickup === true,
    pickupNote: typeof raw.pickupNote === "string" && raw.pickupNote.trim() ? raw.pickupNote.slice(0, 300) : null,
    subDiscount: num(raw.subDiscount, d.subDiscount, 0, 90),
    prepaid: arr(raw.prepaid, (x) => {
      const o = x as Record<string, unknown>; const m = Number(o?.months);
      return m === 3 || m === 6 || m === 12 ? { months: m as 3 | 6 | 12, discount: num(o.discount, 0, 0, 90) } : null;
    }, d.prepaid),
    frequencies: arr(raw.frequencies, (x) => {
      const o = x as Record<string, unknown>; const c = Math.round(Number(o?.count));
      return (o?.unit === "week" || o?.unit === "month") && c >= 1 && c <= 26 ? { unit: o.unit as IntervalUnit, count: c } : null;
    }, d.frequencies),
    roastNote: str(raw.roastNote, d.roastNote, 400),
    roastDays: arr(raw.roastDays, (x) => { const n = Math.round(Number(x)); return n >= 1 && n <= 7 ? n : null; }, d.roastDays),
    dispatchDays: arr(raw.dispatchDays, (x) => { const n = Math.round(Number(x)); return n >= 1 && n <= 7 ? n : null; }, d.dispatchDays),
    carrier: str(raw.carrier, d.carrier, 40),
    leadDays: num(raw.leadDays, d.leadDays, 0, 14),
    giftAmounts: arr(raw.giftAmounts, (x) => { const n = Math.round(Number(x)); return n > 0 && n <= 5000 ? n : null; }, d.giftAmounts),
    giftExpiryMonths: num(raw.giftExpiryMonths, d.giftExpiryMonths, 1, 120),
    giftCardArt: typeof raw.giftCardArt === "string" && /^https:\/\/|^\//.test(raw.giftCardArt) ? raw.giftCardArt : null,
    giftTagline: str(raw.giftTagline, d.giftTagline, 80) || d.giftTagline,
    grinder: str(raw.grinder, d.grinder, 60),
    grindChart: arr(raw.grindChart, (x) => {
      const o = x as Record<string, unknown>;
      return typeof o?.label === "string" && o.label.trim() ? { label: o.label.slice(0, 40), dial: str(o.dial, "", 20), use: str(o.use, "", 120) } : null;
    }, d.grindChart),
    eventAddon: raw.eventAddon !== false,
  };
}

/* ------------------------------------------------------------------ catalogue types */

export interface Variant { id: string; product_id: string; label: string; grams: number | null; price: number; active: boolean; position: number }
export interface Product {
  id: string; slug: string; name: string; kind: "coffee" | "gift_card" | "other"; category: string | null; short: string | null; description: string | null;
  tasting_notes: string | null; origin: string | null; roast: string | null; best_for: string | null; image_url: string | null; images: string[];
  grinds: string[]; subscribable: boolean; featured: boolean; status: string; position: number; variants: Variant[];
}

/* ------------------------------------------------------------------ money */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Subscription price for one bag (subscriber discount, then any prepaid extra). */
export function unitPrice(base: number, mode: Mode, s: Pick<ShopSettings, "subDiscount">, prepaidExtra = 0) {
  if (mode === "one_off") return round2(base);
  const afterSub = base * (1 - s.subDiscount / 100);
  return round2(mode === "prepaid" ? afterSub * (1 - prepaidExtra / 100) : afterSub);
}

/* ------------------------------------------------------------------ grind */

export const ADJUST_LABELS: Record<number, string> = { [-2]: "much finer", [-1]: "a little finer", 0: "", 1: "a little coarser", 2: "much coarser" };
export const clampAdjust = (n: unknown) => Math.max(-2, Math.min(2, Math.round(Number(n) || 0)));
export function grindLabel(grind: string | null | undefined, adjust = 0) {
  if (!grind) return null;
  const a = ADJUST_LABELS[clampAdjust(adjust)];
  return a && !/whole/i.test(grind) ? `${grind} (${a})` : grind;
}

/* ------------------------------------------------------------------ coupons */

export interface Coupon {
  id: string; code: string; description: string | null; kind: "percent" | "fixed" | "free_shipping"; value: number; applies_to: "all" | "one_off" | "subscription";
  product_ids: string[]; min_spend: number | null; first_order_only: boolean; subscription_cycles: number | null; max_uses: number | null; per_customer: number | null;
  uses: number; starts_on: string | null; ends_on: string | null; active: boolean;
}

/** Why a coupon can't be used, or null when it can. History counts come from the server. */
export function couponProblem(c: Coupon | null, o: { today: string; mode: Mode; subtotal: number; customerUses?: number; customerOrders?: number }): string | null {
  if (!c || !c.active) return "That code isn't valid.";
  if (c.starts_on && o.today < c.starts_on) return "That code isn't active yet.";
  if (c.ends_on && o.today > c.ends_on) return "That code has expired.";
  if (c.max_uses && c.uses >= c.max_uses) return "That code has been fully used.";
  if (c.applies_to === "one_off" && o.mode !== "one_off") return "That code is for one-off orders.";
  if (c.applies_to === "subscription" && o.mode === "one_off") return "That code is for subscriptions.";
  if (c.min_spend && o.subtotal < c.min_spend) return `Spend at least $${c.min_spend.toFixed(2).replace(/\.00$/, "")} to use that code.`;
  if (c.per_customer && (o.customerUses ?? 0) >= c.per_customer) return "You've already used that code.";
  if (c.first_order_only && (o.customerOrders ?? 0) > 0) return "That code is for your first order.";
  return null;
}

/* ------------------------------------------------------------------ pricing a cart */

export interface CartLine { variantId: string; grind: string | null; adjust: number; qty: number }
export interface PricedLine { variantId: string; productId: string; name: string; variant: string; grind: string | null; adjust: number; qty: number; base: number; unit: number; total: number; kind: Product["kind"] }
export interface Priced {
  lines: PricedLine[]; subtotal: number; listSubtotal: number; saved: number; discount: number; shipping: number; total: number;
  freeShippingGap: number | null;   // how much more for free shipping (null = not applicable / already free)
  deliveries: number;               // 1 for one-off & subscription (per delivery), N for prepaid
  perDelivery: number;              // what one delivery costs (subscription) — total for one-off
  problems: string[];
}

export function priceCart(input: {
  lines: CartLine[]; products: Product[]; mode: Mode; settings: ShopSettings; delivery: Delivery; parcels?: number;
  coupon?: Coupon | null; couponOk?: boolean; prepaidMonths?: 3 | 6 | 12 | null; interval?: { unit: IntervalUnit; count: number };
}): Priced {
  const { settings: s, mode } = input;
  const byVariant = new Map<string, { p: Product; v: Variant }>();
  for (const p of input.products) for (const v of p.variants) byVariant.set(v.id, { p, v });
  const prepaidExtra = mode === "prepaid" ? s.prepaid.find((x) => x.months === input.prepaidMonths)?.discount ?? 0 : 0;
  const problems: string[] = [];
  const lines: PricedLine[] = [];
  for (const l of input.lines) {
    const hit = byVariant.get(l.variantId);
    if (!hit || !hit.v.active || hit.p.status !== "active") { problems.push("Something in your cart is no longer available."); continue; }
    const qty = Math.max(1, Math.min(50, Math.round(l.qty) || 1));
    const grind = hit.p.grinds.length ? (hit.p.grinds.includes(l.grind ?? "") ? l.grind : hit.p.grinds[0]) : null;
    const lineMode: Mode = hit.p.kind === "coffee" && hit.p.subscribable ? mode : "one_off";
    if (mode !== "one_off" && !(hit.p.kind === "coffee" && hit.p.subscribable)) problems.push(`${hit.p.name} can't be part of a subscription.`);
    const unit = unitPrice(hit.v.price, lineMode, s, prepaidExtra);
    lines.push({ variantId: hit.v.id, productId: hit.p.id, name: hit.p.name, variant: hit.v.label, grind, adjust: grind ? clampAdjust(l.adjust) : 0, qty, base: hit.v.price, unit, total: round2(unit * qty), kind: hit.p.kind });
  }
  const listSubtotal = round2(lines.reduce((a, l) => a + l.base * l.qty, 0));
  const subtotal = round2(lines.reduce((a, l) => a + l.total, 0));
  const parcels = Math.max(1, input.parcels ?? 1);
  const physical = lines.some((l) => l.kind !== "gift_card");
  // Shipping per parcel; free when the parcel reaches the free-shipping amount (judged on the whole order for one parcel)
  const perParcel = parcels > 1 ? subtotal / parcels : subtotal;
  const freeByAmount = s.freeOver !== null && perParcel >= s.freeOver;
  let shipping = !physical || input.delivery !== "post" || freeByAmount ? 0 : round2(s.flatRate * parcels);
  // Coupon
  let discount = 0;
  const c = input.couponOk ? input.coupon ?? null : null;
  if (c) {
    const eligible = round2(lines.filter((l) => !c.product_ids.length || c.product_ids.includes(l.productId)).reduce((a, l) => a + l.total, 0));
    if (c.kind === "percent") discount = round2(eligible * Math.min(100, c.value) / 100);
    else if (c.kind === "fixed") discount = round2(Math.min(c.value, eligible));
    else shipping = 0;
  }
  const perDelivery = round2(Math.max(0, subtotal - discount) + shipping);
  const deliveries = mode === "prepaid" && input.prepaidMonths ? prepaidDeliveries(input.prepaidMonths, input.interval ?? { unit: "week", count: 2 }) : 1;
  const total = round2(perDelivery * deliveries);
  const freeShippingGap = physical && input.delivery === "post" && s.freeOver !== null && !freeByAmount && parcels === 1 ? round2(s.freeOver - subtotal) : null;
  return { lines, subtotal, listSubtotal, saved: round2(listSubtotal - subtotal), discount, shipping, total, freeShippingGap, deliveries, perDelivery, problems: [...new Set(problems)] };
}

/** How many deliveries a prepaid package covers at a frequency. */
export function prepaidDeliveries(months: 3 | 6 | 12, iv: { unit: IntervalUnit; count: number }) {
  if (iv.unit === "month") return Math.max(1, Math.floor(months / iv.count));
  const weeks = Math.round((months * 52) / 12);
  return Math.max(1, Math.floor(weeks / iv.count));
}

/* ------------------------------------------------------------------ dates */

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const isoWeekday = (iso: string) => { const w = toDate(iso).getUTCDay(); return w === 0 ? 7 : w; };
export const addDays = (iso: string, n: number) => toISO(new Date(toDate(iso).getTime() + n * DAY));

export function addInterval(iso: string, unit: IntervalUnit, count: number) {
  if (unit === "week") return addDays(iso, 7 * count);
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toISO(d);
}

/** First dispatch day on or after `from` (+ lead days when counting from today). */
export function nextDispatch(from: string, s: Pick<ShopSettings, "dispatchDays">, lead = 0) {
  const days = s.dispatchDays.length ? s.dispatchDays : [1, 2, 3, 4, 5];
  let d = addDays(from, lead);
  for (let i = 0; i < 14; i++) { if (days.includes(isoWeekday(d))) return d; d = addDays(d, 1); }
  return d;
}

export function frequencyLabel(unit: IntervalUnit, count: number) {
  if (unit === "week") return count === 1 ? "Every week" : count === 2 ? "Every fortnight" : `Every ${count} weeks`;
  return count === 1 ? "Every month" : `Every ${count} months`;
}

export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** [3, 4] → "Wednesday & Thursday" */
export const dayList = (days: number[], short = false) => {
  const n = [...new Set(days)].sort().map((d) => (short ? WEEKDAYS[d].slice(0, 3) : WEEKDAYS[d]));
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
};

/* ------------------------------------------------------------------ misc */

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

/** "1kg" → 1000, "500g" → 500, otherwise null */
export function gramsOf(label: string) {
  const m = label.toLowerCase().replace(/\s/g, "").match(/^(\d+(?:\.\d+)?)(kg|g)$/);
  return m ? Math.round(Number(m[1]) * (m[2] === "kg" ? 1000 : 1)) : null;
}

export interface Address { name?: string | null; company?: string | null; line1: string; line2?: string | null; suburb: string; state: string; postcode: string; country?: string; phone?: string | null; instructions?: string | null }

export function cleanAddress(a: unknown): Address | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const line1 = t(o.line1, 200), suburb = t(o.suburb, 80), state = t(o.state, 20).toUpperCase(), postcode = t(o.postcode, 10);
  if (!line1 || !suburb || !state || !/^\d{4}$/.test(postcode)) return null;
  return { name: t(o.name, 120) || null, company: t(o.company, 120) || null, line1, line2: t(o.line2, 200) || null, suburb, state, postcode, country: "AU", phone: t(o.phone, 40) || null, instructions: t(o.instructions, 300) || null };
}

export const addressLine = (a: Partial<Address> | null | undefined) =>
  a && a.line1 ? [a.company, [a.line1, a.line2].filter(Boolean).join(", "), `${a.suburb ?? ""} ${a.state ?? ""} ${a.postcode ?? ""}`.trim()].filter(Boolean).join(", ") : "";

export const ORDER_STATUS: Record<string, string> = {
  pending: "Awaiting payment", paid: "Paid — to roast", roasting: "Roasting", packed: "Packed", shipped: "Shipped", completed: "Completed",
  cancelled: "Cancelled", refunded: "Refunded", failed: "Payment failed", on_hold: "On hold",
};
export const SUB_STATUS: Record<string, string> = { pending: "Awaiting payment", active: "Active", paused: "Paused", payment_failed: "Payment failed", cancelled: "Cancelled" };
