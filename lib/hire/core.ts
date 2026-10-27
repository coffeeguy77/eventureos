/**
 * Hire: the rules, kept pure so they can be tested — statuses, settings, the cheapest price for a hire period,
 * stock availability (peak use over a window, turnaround buffers, packages), clash checks with "free from" times and
 * alternatives, bonds and totals.
 */

export const STATUSES = ["quote", "reservation", "booked", "out", "returned", "cancelled"] as const;
export type HireStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<HireStatus, string> = {
  quote: "Quote", reservation: "Reservation", booked: "Booked", out: "On hire", returned: "Returned", cancelled: "Cancelled",
};
export const STATUS_TONE: Record<HireStatus, "slate" | "blue" | "brand" | "amber" | "green" | "red"> = {
  quote: "slate", reservation: "blue", booked: "brand", out: "amber", returned: "green", cancelled: "red",
};
/** Statuses that hold stock. Quotes only pencil it in (shown, but don't block). */
export const HOLDS_STOCK: readonly HireStatus[] = ["reservation", "booked", "out"];
export const isStatus = (s: unknown): s is HireStatus => typeof s === "string" && (STATUSES as readonly string[]).includes(s);

export interface RateUnit { key: string; label: string; hours: number } // hours 0 = a flat price per hire (or each, for sales)
export interface HireSettings {
  enabled: boolean;
  units: RateUnit[];
  bufferHours: number;      // default turnaround between hires
  graceHours: number;       // free late return before another unit is charged
  excludeWeekends: boolean; // don't charge Saturdays and Sundays inside a hire
  bondMode: "sum" | "max";  // bond on a booking: every item's bond added up, or the largest one
  depositPct: number;       // deposit asked for when booking (0 = none)
  defaultStart: string;     // "09:00"
  defaultEnd: string;       // "17:00"
  quoteDays: number;        // quotes expire after
  deliveryFee: number;      // default delivery charge (inc GST)
  /** delivery charged automatically online when the address is in one of these states (otherwise quoted) */
  deliveryZone: { label: string; fee: number; states: string[] } | null;
  /** trading names run from the one account (the first is the business itself) */
  brands: Brand[];
  /** item id → brand key (items not listed belong to the first brand) */
  itemBrands: Record<string, string>;
  /** the public hire shop (/hire/<business>/shop) */
  shop: ShopLook;
}
/** The hire shop's switches and look: an optional photo behind the date picker, a scrolling banner above it, logo size. */
export interface ShopLook {
  enabled: boolean; instantBook: boolean; intro: string | null;
  heading: string | null;
  heroImage: string | null;
  slides: { image: string; heading: string | null; text: string | null; link: string | null }[];
  logoSize: "md" | "lg" | "xl";
  /** second colour for buttons that should stand out (e.g. "Request a quote"); none = the brand colour */
  accent: string | null;
}
export const DEFAULT_SHOP: ShopLook = { enabled: false, instantBook: false, intro: null, heading: null, heroImage: null, slides: [], logoSize: "lg", accent: null };
const webImage = (v: unknown) => (typeof v === "string" && /^https:\/\/\S+$/i.test(v.trim()) && v.length <= 1000 ? v.trim() : null);
const line = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
export function cleanShop(raw: unknown): ShopLook {
  const o = (raw ?? {}) as Record<string, unknown>;
  const slides = Array.isArray(o.slides) ? (o.slides as unknown[]).slice(0, 8).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const image = webImage(r.image);
    const link = typeof r.link === "string" && (/^https:\/\/\S+$/i.test(r.link.trim()) || /^\/[^\s/]/.test(r.link.trim())) ? r.link.trim().slice(0, 500) : null;
    return image ? [{ image, heading: line(r.heading, 120), text: line(r.text, 240), link }] : [];
  }) : [];
  return {
    enabled: o.enabled === true, instantBook: o.instantBook === true, intro: line(o.intro, 600), heading: line(o.heading, 80),
    heroImage: webImage(o.heroImage), slides, logoSize: o.logoSize === "md" || o.logoSize === "xl" ? o.logoSize : "lg",
    accent: typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent : null,
  };
}
export interface Brand { key: string; name: string; email: string | null; phone: string | null }
export const DEFAULT_UNITS: RateUnit[] = [
  { key: "each", label: "Per hire", hours: 0 },
  { key: "half_day", label: "Half day", hours: 4 },
  { key: "day", label: "Day", hours: 24 },
  { key: "week", label: "Week", hours: 168 },
];
export const DEFAULT_HIRE: HireSettings = {
  enabled: false, units: DEFAULT_UNITS, bufferHours: 2, graceHours: 1, excludeWeekends: false, bondMode: "sum",
  depositPct: 0, defaultStart: "09:00", defaultEnd: "17:00", quoteDays: 14, deliveryFee: 0,
  deliveryZone: null, brands: [], itemBrands: {}, shop: DEFAULT_SHOP,
};

export function cleanBrands(raw: unknown): Brand[] {
  if (!Array.isArray(raw)) return [];
  const out: Brand[] = [];
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  for (const r of raw.slice(0, 12)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = str(o.name, 120);
    const key = (str(o.key, 40) ?? (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "")).replace(/[^a-z0-9-]/g, "");
    if (!name || !key || out.some((b) => b.key === key)) continue;
    out.push({ key, name, email: str(o.email, 200), phone: str(o.phone, 40) });
  }
  return out;
}
/** The brand an item is sold under (null when the business has no brands). */
export function brandOf(s: Pick<HireSettings, "brands" | "itemBrands">, itemId: string | null | undefined): Brand | null {
  if (!s.brands.length) return null;
  const k = itemId ? s.itemBrands[itemId] : undefined;
  return s.brands.find((b) => b.key === k) ?? s.brands[0];
}
/** A booking's brand: the brand of most of what's on it (by value), else the main one. */
export function bookingBrand(s: Pick<HireSettings, "brands" | "itemBrands">, lines: { item_id: string | null; line_total: number }[]): Brand | null {
  if (!s.brands.length) return null;
  const score = new Map<string, number>();
  for (const l of lines) { const b = brandOf(s, l.item_id); if (b) score.set(b.key, (score.get(b.key) ?? 0) + Math.max(0.01, Number(l.line_total) || 0)); }
  const best = [...score].sort((a, b) => b[1] - a[1])[0];
  return s.brands.find((b) => b.key === best?.[0]) ?? s.brands[0];
}

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
export const unitKey = (label: string) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export function cleanUnits(raw: unknown): RateUnit[] {
  if (!Array.isArray(raw)) return DEFAULT_UNITS;
  const out: RateUnit[] = [];
  for (const r of raw.slice(0, 12)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 40) : "";
    const key = typeof o.key === "string" && o.key ? unitKey(o.key) : unitKey(label);
    if (!label || !key || out.some((u) => u.key === key)) continue;
    out.push({ key, label, hours: Math.round(num(o.hours, 0, 24 * 366, 0) * 100) / 100 });
  }
  return out.length ? out : DEFAULT_UNITS;
}

export function readHireSettings(settings: unknown): HireSettings {
  const h = ((settings as { hire?: unknown } | null)?.hire ?? {}) as Record<string, unknown>;
  return {
    enabled: h.enabled === true,
    units: cleanUnits(h.units),
    bufferHours: num(h.bufferHours, 0, 24 * 14, DEFAULT_HIRE.bufferHours),
    graceHours: num(h.graceHours, 0, 24, DEFAULT_HIRE.graceHours),
    excludeWeekends: h.excludeWeekends === true,
    bondMode: h.bondMode === "max" ? "max" : "sum",
    depositPct: num(h.depositPct, 0, 100, 0),
    defaultStart: hhmm(h.defaultStart, DEFAULT_HIRE.defaultStart),
    defaultEnd: hhmm(h.defaultEnd, DEFAULT_HIRE.defaultEnd),
    quoteDays: Math.round(num(h.quoteDays, 1, 365, DEFAULT_HIRE.quoteDays)),
    deliveryFee: num(h.deliveryFee, 0, 100_000, 0),
    deliveryZone: (() => {
      const z = (h.deliveryZone ?? null) as Record<string, unknown> | null;
      if (!z || typeof z !== "object") return null;
      const states = Array.isArray(z.states) ? (z.states as unknown[]).filter((x): x is string => typeof x === "string" && /^[A-Z]{2,3}$/.test(x)) : [];
      return states.length ? { label: typeof z.label === "string" && z.label.trim() ? z.label.trim().slice(0, 40) : states.join("/"), fee: num(z.fee, 0, 100_000, 0), states } : null;
    })(),
    brands: cleanBrands(h.brands),
    itemBrands: h.itemBrands && typeof h.itemBrands === "object" ? Object.fromEntries(Object.entries(h.itemBrands as Record<string, unknown>).filter(([k, v]) => /^[0-9a-f-]{36}$/i.test(k) && typeof v === "string")) as Record<string, string> : {},
    shop: cleanShop(h.shop),
  };
}

/* ------------------------------------------------------------------ items */

export type Rate = { unit: string; price: number };
export type ItemKind = "hire" | "sale" | "package";
export interface HireItem {
  id: string; name: string; code: string | null; kind: ItemKind; category: string | null;
  quantity: number; out_of_service: number; rates: Rate[]; bond: number; buffer_hours: number | null;
  companions: { item_id: string; qty: number; auto: boolean }[]; package_lines: { item_id: string; qty: number }[]; active: boolean;
}

export function cleanRates(raw: unknown, units: RateUnit[]): Rate[] {
  if (!Array.isArray(raw)) return [];
  const keys = new Set(units.map((u) => u.key));
  const out: Rate[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const unit = typeof o.unit === "string" ? o.unit : "";
    const raw = num(o.price, -1, 1_000_000, -1);
    const price = Math.round(raw * 100) / 100;
    if (keys.has(unit) && raw >= 0 && !out.some((x) => x.unit === unit)) out.push({ unit, price });
  }
  return out;
}

export function cleanRefs<T extends { item_id: string; qty: number }>(raw: unknown, extra: (o: Record<string, unknown>) => Omit<T, "item_id" | "qty">, self?: string): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const r of raw.slice(0, 40)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.item_id === "string" && /^[0-9a-f-]{36}$/i.test(o.item_id) ? o.item_id : null;
    const qty = Math.round(num(o.qty, 0, 10_000, 0));
    if (!id || id === self || qty <= 0 || out.some((x) => x.item_id === id)) continue;
    out.push({ item_id: id, qty, ...extra(o) } as T);
  }
  return out;
}

/* ------------------------------------------------------------------ pricing */

/** Whole Saturdays and Sundays strictly inside a hire (local dates "YYYY-MM-DD"). */
export function weekendDaysBetween(startDate: string, endDate: string): number {
  const s = Date.parse(startDate + "T00:00:00Z"), e = Date.parse(endDate + "T00:00:00Z");
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  let n = 0;
  for (let t = s + 86_400_000; t < e && n < 400; t += 86_400_000) { const d = new Date(t).getUTCDay(); if (d === 0 || d === 6) n++; }
  return n;
}

/** Hours to charge for: the period, less the grace allowance and any skipped weekend days; at least 1 hour. */
export function chargeableHours(startMs: number, endMs: number, opts: { graceHours: number; weekendDays?: number }): number {
  const raw = (endMs - startMs) / 3_600_000;
  if (!(raw > 0)) return 0;
  const units = Math.ceil(raw - 1e-9);
  // within the grace allowance of a whole day: charge the whole day only
  const g = Math.max(0, opts.graceHours);
  let h = units;
  const over = raw % 24;
  if (raw > 24 && over > 0 && over <= g + 1e-9) h = Math.floor(raw / 24) * 24;
  h -= Math.max(0, opts.weekendDays ?? 0) * 24;
  return Math.max(1, h);
}

export interface PricePart { unit: string; label: string; count: number; price: number }
export interface Price { each: number; parts: PricePart[]; note: string }

/**
 * The cheapest way to charge for `hours` with the item's rates — e.g. 6 days at $90/day ($540) loses to a $300 week.
 * Timed rates (half day, day, week…) are combined; flat rates (per hire) apply when an item has no timed rates.
 */
export function bestPrice(rates: Rate[], units: RateUnit[], hours: number): Price {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const timed = rates.map((r) => ({ r, u: byKey.get(r.unit) })).filter((x): x is { r: Rate; u: RateUnit } => !!x.u && x.u.hours > 0);
  if (!timed.length) {
    const flat = rates.find((r) => byKey.get(r.unit)?.hours === 0);
    if (!flat) return { each: 0, parts: [], note: "No price set" };
    const u = byKey.get(flat.unit)!;
    return { each: flat.price, parts: [{ unit: u.key, label: u.label, count: 1, price: flat.price }], note: u.label };
  }
  const H = Math.min(Math.max(1, Math.ceil(hours)), 24 * 400);
  const cost = new Float64Array(H + 1); const pick = new Int16Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < timed.length; i++) {
      const c = timed[i].r.price + cost[Math.max(0, h - Math.ceil(timed[i].u.hours))];
      if (c < best - 1e-9 || (Math.abs(c - best) < 1e-9 && timed[i].u.hours > timed[bi].u.hours)) { best = c; bi = i; }
    }
    cost[h] = best; pick[h] = bi;
  }
  const counts = new Map<number, number>();
  for (let h = H; h > 0;) { const i = pick[h]; counts.set(i, (counts.get(i) ?? 0) + 1); h = Math.max(0, h - Math.ceil(timed[i].u.hours)); }
  const parts = [...counts.entries()].map(([i, count]) => ({ unit: timed[i].u.key, label: timed[i].u.label, count, price: timed[i].r.price }))
    .sort((a, b) => (byKey.get(b.unit)!.hours - byKey.get(a.unit)!.hours));
  const each = Math.round(cost[H] * 100) / 100;
  return { each, parts, note: parts.map((p) => `${p.count} × ${p.label.toLowerCase()}`).join(" + ") };
}

/** Price for one of an item over a hire (a package without its own rates is the sum of what's in it). */
export function priceItem(item: HireItem, items: Map<string, HireItem>, units: RateUnit[], hours: number): Price {
  if (item.kind === "sale") {
    const flat = item.rates.find((r) => units.find((u) => u.key === r.unit)?.hours === 0) ?? item.rates[0];
    return flat ? { each: flat.price, parts: [], note: "Each" } : { each: 0, parts: [], note: "No price set" };
  }
  if (item.kind === "package" && !item.rates.length) {
    let each = 0;
    for (const l of item.package_lines) { const c = items.get(l.item_id); if (c && c.kind !== "package") each += bestPrice(c.rates, units, hours).each * l.qty; }
    return { each: Math.round(each * 100) / 100, parts: [], note: "Package" };
  }
  return bestPrice(item.rates, units, hours);
}

/* ------------------------------------------------------------------ availability */

export interface Hold { itemId: string; qty: number; start: number; end: number; bookingId: string; label: string; status: HireStatus }
export interface LineRef { itemId: string | null; qty: number }

/** What each line actually takes off the shelf: packages are broken into their items; sales and misc lines take nothing. */
export function stockNeeds(lines: LineRef[], items: Map<string, HireItem>): Map<string, number> {
  const need = new Map<string, number>();
  const add = (id: string, q: number) => need.set(id, (need.get(id) ?? 0) + q);
  for (const l of lines) {
    const it = l.itemId ? items.get(l.itemId) : undefined;
    if (!it || l.qty <= 0) continue;
    if (it.kind === "hire") add(it.id, l.qty);
    else if (it.kind === "package") for (const p of it.package_lines) { const c = items.get(p.item_id); if (c?.kind === "hire") add(c.id, p.qty * l.qty); }
  }
  return need;
}

export const hireable = (it: HireItem) => Math.max(0, it.quantity - it.out_of_service);
const bufferMs = (it: HireItem | undefined, dflt: number) => (it?.buffer_hours ?? dflt) * 3_600_000;

/** The most of an item in use at any moment in [from, to), counting each hire's turnaround after it ends. */
export function peakUse(holds: Hold[], from: number, to: number, buffer: number): number {
  const hits = holds.filter((h) => h.start < to && h.end + buffer > from);
  if (!hits.length) return 0;
  const ev: [number, number][] = [];
  for (const h of hits) { ev.push([Math.max(h.start, from), h.qty]); ev.push([Math.min(h.end + buffer, to), -h.qty]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // ends before starts at the same moment
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
  return peak;
}

export interface Shortage {
  itemId: string; name: string; wanted: number; free: number; short: number;
  clashes: { bookingId: string; label: string; qty: number }[];
  freeFrom: number | null;                                  // the earliest start that would fit, same length of hire
  alternatives: { id: string; name: string; free: number }[]; // same category, enough free
}

/**
 * Check a booking's lines against every other hire holding stock. Returns what's short, who has it, when it frees up
 * and what else in the same category could be sent instead.
 */
export function checkStock(lines: LineRef[], items: Map<string, HireItem>, holds: Hold[], from: number, to: number, defaultBuffer: number): Shortage[] {
  const out: Shortage[] = [];
  const byItem = new Map<string, Hold[]>();
  for (const h of holds) { const a = byItem.get(h.itemId) ?? []; a.push(h); byItem.set(h.itemId, a); }
  const need = stockNeeds(lines, items);
  for (const [id, wanted] of need) {
    const it = items.get(id); if (!it) continue;
    const hs = byItem.get(id) ?? [];
    const buf = bufferMs(it, defaultBuffer);
    // my own turnaround matters too: a hire starting during my turnaround clashes
    const free = hireable(it) - peakUse(hs, from, to + buf, buf);
    if (free >= wanted) continue;
    const clashes = hs.filter((h) => h.start < to + buf && h.end + buf > from).map((h) => ({ bookingId: h.bookingId, label: h.label, qty: h.qty }));
    const len = to - from;
    let freeFrom: number | null = null;
    const starts = [...new Set(hs.map((h) => h.end + buf).filter((t) => t > from))].sort((a, b) => a - b);
    for (const t of starts) if (hireable(it) - peakUse(hs, t, t + len + buf, buf) >= wanted) { freeFrom = t; break; }
    const alternatives: Shortage["alternatives"] = [];
    if (it.category) for (const o of items.values()) {
      if (o.id === id || o.kind !== "hire" || !o.active || o.category !== it.category) continue;
      const ob = bufferMs(o, defaultBuffer);
      const f = hireable(o) - peakUse(byItem.get(o.id) ?? [], from, to + ob, ob) - (need.get(o.id) ?? 0);
      if (f >= wanted - Math.max(0, free)) alternatives.push({ id: o.id, name: o.name, free: f });
    }
    alternatives.sort((a, b) => b.free - a.free);
    out.push({ itemId: id, name: it.name, wanted, free: Math.max(0, free), short: wanted - Math.max(0, free), clashes, freeFrom, alternatives: alternatives.slice(0, 3) });
  }
  return out;
}

/** Peak use of each item for each day (for the availability grid). `days` are [start, end) in ms. */
export function usageGrid(items: HireItem[], holds: Hold[], days: [number, number][], defaultBuffer: number): Map<string, number[]> {
  const byItem = new Map<string, Hold[]>();
  for (const h of holds) { const a = byItem.get(h.itemId) ?? []; a.push(h); byItem.set(h.itemId, a); }
  const out = new Map<string, number[]>();
  for (const it of items) {
    const hs = byItem.get(it.id) ?? []; const buf = bufferMs(it, defaultBuffer);
    out.set(it.id, days.map(([s, e]) => peakUse(hs, s, e, buf)));
  }
  return out;
}

/** Turn booking lines (with their booking's window) into stock holds, packages broken into items. */
export function holdsFrom(rows: { booking_id: string; item_id: string | null; quantity: number; qty_returned?: number; label: string; status: HireStatus; start: number; end: number }[], items: Map<string, HireItem>): Hold[] {
  const out: Hold[] = [];
  for (const r of rows) {
    // once items come back early they're free again
    const qty = r.status === "out" ? Math.max(0, r.quantity - (r.qty_returned ?? 0)) : r.quantity;
    for (const [itemId, q] of stockNeeds([{ itemId: r.item_id, qty }], items)) out.push({ itemId, qty: q, start: r.start, end: r.end, bookingId: r.booking_id, label: r.label, status: r.status });
  }
  return out;
}

/* ------------------------------------------------------------------ companions, bonds, totals */

/** Items that come with an item (auto ones are added straight away; the rest are offered). */
export function companionsFor(item: HireItem, qty: number, items: Map<string, HireItem>) {
  return item.companions.map((c) => ({ item: items.get(c.item_id), qty: c.qty * qty, auto: c.auto })).filter((c): c is { item: HireItem; qty: number; auto: boolean } => !!c.item && c.item.active);
}

export function bondFor(lines: LineRef[], items: Map<string, HireItem>, mode: "sum" | "max"): number {
  let sum = 0, max = 0;
  for (const l of lines) {
    const it = l.itemId ? items.get(l.itemId) : undefined;
    if (!it || !(it.bond > 0)) continue;
    sum += it.bond * l.qty; max = Math.max(max, it.bond);
  }
  return Math.round((mode === "max" ? max : sum) * 100) / 100;
}

export function bookingTotal(lines: { line_total: number }[], deliveryFee: number, discount: number) {
  const items = lines.reduce((a, l) => a + (Number(l.line_total) || 0), 0);
  const total = Math.max(0, Math.round((items + (deliveryFee || 0) - (discount || 0)) * 100) / 100);
  const gst = Math.round((total / 11) * 100) / 100;
  return { items: Math.round(items * 100) / 100, total, gst };
}

/* ------------------------------------------------------------------ product pages */

/** A web address part from a name: "Big Buck Hunter (Arcade)" → "big-buck-hunter-arcade". */
export function itemSlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}
/** Photos: web addresses only, no repeats, at most 12. */
export function cleanImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const u = typeof v === "string" ? v.trim() : "";
    if (/^https:\/\/\S+$/i.test(u) && u.length <= 1000 && !out.includes(u)) out.push(u);
    if (out.length >= 12) break;
  }
  return out;
}
/** Specs shown on the product page, e.g. Size: 2m × 1m. */
export function cleanSpecs(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const value = typeof o.value === "string" ? o.value.trim().slice(0, 200) : "";
    return label && value ? [{ label, value }] : [];
  });
}
