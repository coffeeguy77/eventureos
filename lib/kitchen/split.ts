/**
 * Catering by day: a multi-day job can have its catering delivered across several days at different times
 * (e.g. 30 on Thursday at 7:30am and 50 on Friday at 7:30am).
 *   events.catering_days = { days: [{ date, time }], qty: { "<item key>": { "<date>": qty } } }
 * The item key is the menu item's service id (or "name:<lower-case name>" for a line with no menu item).
 * Pure — no database.
 */
import type { DeliveryItem } from "./core";

export interface CateringDay { date: string; time: string | null }
export interface CateringDays { days: CateringDay[]; qty: Record<string, Record<string, number>> }
export interface DayPart { date: string; time: string | null; items: DeliveryItem[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}/;
const MAX_DAYS = 31;

export const itemKey = (i: { service_id: string | null; name: string }) => i.service_id ?? `name:${i.name.trim().toLowerCase()}`;

/** Well-formed plan only: valid dates (one per date, in order), times as HH:MM, whole non-negative quantities. */
export function readCateringDays(v: unknown): CateringDays {
  const r = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const days: CateringDay[] = [];
  for (const x of Array.isArray(r.days) ? r.days.slice(0, 200) : []) {
    const d = (x ?? {}) as Record<string, unknown>;
    if (typeof d.date !== "string" || !DATE.test(d.date) || Number.isNaN(Date.parse(`${d.date}T12:00:00Z`)) || seen.has(d.date)) continue;
    seen.add(d.date);
    days.push({ date: d.date, time: typeof d.time === "string" && TIME.test(d.time) ? d.time.slice(0, 5).padStart(5, "0") : null });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const kept = days.slice(0, MAX_DAYS);
  const dates = new Set(kept.map((d) => d.date));
  const qty: CateringDays["qty"] = {};
  const rawQty = (r.qty && typeof r.qty === "object" && !Array.isArray(r.qty) ? r.qty : {}) as Record<string, unknown>;
  for (const [key, perDay] of Object.entries(rawQty)) {
    if (!perDay || typeof perDay !== "object" || Array.isArray(perDay)) continue;
    const row: Record<string, number> = {};
    for (const [date, n] of Object.entries(perDay as Record<string, unknown>)) {
      const q = Math.floor(Number(n));
      if (dates.has(date) && Number.isFinite(q) && q > 0) row[date] = Math.min(q, 100000);
    }
    if (Object.keys(row).length) qty[key] = row;
  }
  return { days: kept, qty };
}

/** True when the job has its catering split over two or more days. */
export const hasSplit = (p: CateringDays) => p.days.length >= 2;

/**
 * Split a job's catering items into one delivery per day.
 *  - no plan (fewer than two days): everything on the fallback date and time;
 *  - an item with quantities entered: those quantities on those days (a warning if they don't add up to the quote);
 *  - an item with nothing entered: all of it on the first day (with a warning so it gets looked at).
 */
export function splitByDay(items: DeliveryItem[], plan: CateringDays, fallback: { date: string; time: string | null }): { parts: DayPart[]; warnings: string[] } {
  // Same menu item on two quote lines counts once
  const merged = new Map<string, DeliveryItem>();
  for (const it of items) {
    if (!(it.qty > 0)) continue;
    const k = itemKey(it);
    const m = merged.get(k);
    if (m) m.qty += it.qty; else merged.set(k, { ...it });
  }
  const list = [...merged.values()];
  if (!hasSplit(plan)) return { parts: list.length ? [{ date: fallback.date, time: fallback.time, items: list }] : [], warnings: [] };

  const warnings: string[] = [];
  const byDay = new Map<string, DeliveryItem[]>(plan.days.map((d) => [d.date, []]));
  for (const it of list) {
    const entry = plan.qty[itemKey(it)];
    if (!entry) {
      byDay.get(plan.days[0].date)!.push(it);
      warnings.push(`${it.name}: not split by day yet — all ${it.qty} shown on the first day`);
      continue;
    }
    let sum = 0;
    for (const d of plan.days) {
      const n = entry[d.date] ?? 0;
      if (n > 0) { byDay.get(d.date)!.push({ ...it, qty: n }); sum += n; }
    }
    if (sum !== it.qty) warnings.push(`${it.name}: ${sum} split across the days but the quote has ${it.qty}`);
  }
  // Something on the plan that's no longer on the quote
  const keys = new Set(list.map(itemKey));
  for (const k of Object.keys(plan.qty)) if (!keys.has(k)) warnings.push("A split item is no longer on the quote — check the catering days");
  return {
    parts: plan.days.map((d) => ({ date: d.date, time: d.time, items: byDay.get(d.date)! })).filter((p) => p.items.length),
    warnings: [...new Set(warnings)],
  };
}

/* ------------------------------------------------------------------ kitchen order (v2) */
/*
 * The kitchen order for a job: what the kitchen makes, day by day — ready-by time, delivery / at-event time, notes, and
 * any items that aren't on the quote. Stored in events.catering_days as { v: 2, days: [...], notes }.
 * When a job has one, it's what the kitchen sees; the quote is only compared against it.
 */
export interface OrderItem { service_id: string | null; name: string; qty: number; note: string | null }
export interface OrderDay { date: string; ready: string | null; deliver: string | null; note: string | null; items: OrderItem[] }
export interface KitchenOrder { days: OrderDay[]; notes: string | null }

const hhmm = (v: unknown) => (typeof v === "string" && TIME.test(v) ? v.slice(0, 5).padStart(5, "0") : null);
const note = (v: unknown, n = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A saved kitchen order (null when the job doesn't have one — the old by-day split or nothing). */
export function readKitchenOrder(v: unknown): KitchenOrder | null {
  const r = (v && typeof v === "object" && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
  if (!r || r.v !== 2 || !Array.isArray(r.days)) return null;
  const seen = new Set<string>();
  const days: OrderDay[] = [];
  for (const x of r.days.slice(0, MAX_DAYS)) {
    const d = (x ?? {}) as Record<string, unknown>;
    if (typeof d.date !== "string" || !DATE.test(d.date) || Number.isNaN(Date.parse(`${d.date}T12:00:00Z`)) || seen.has(d.date)) continue;
    seen.add(d.date);
    const items: OrderItem[] = [];
    for (const y of Array.isArray(d.items) ? d.items.slice(0, 60) : []) {
      const i = (y ?? {}) as Record<string, unknown>;
      const qty = Math.floor(Number(i.qty));
      const name = note(i.name, 160);
      if (!name || !(qty > 0)) continue;
      items.push({ service_id: typeof i.service_id === "string" && UUID.test(i.service_id) ? i.service_id : null, name, qty: Math.min(qty, 100000), note: note(i.note, 200) });
    }
    days.push({ date: d.date, ready: hhmm(d.ready), deliver: hhmm(d.deliver), note: note(d.note), items });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { days, notes: note(r.notes, 1000) };
}

/** What gets saved (cleaned, with the version marker). */
export const kitchenOrderValue = (o: KitchenOrder) => ({ v: 2, days: o.days, notes: o.notes });

/** A starting kitchen order from the quote (and an older by-day split, if the job has one). */
export function draftKitchenOrder(items: DeliveryItem[], plan: CateringDays, fallback: { date: string; deliver: string | null; ready: string | null }): KitchenOrder {
  const { parts } = splitByDay(items, plan, { date: fallback.date, time: fallback.deliver });
  const days: OrderDay[] = parts.map((p) => ({ date: p.date, ready: fallback.ready, deliver: p.time, note: null, items: p.items.map((i) => ({ service_id: i.service_id, name: i.name, qty: i.qty, note: null })) }));
  return { days: days.length ? days : [{ date: fallback.date, ready: fallback.ready, deliver: fallback.deliver, note: null, items: [] }], notes: null };
}

/** Kitchen order vs the quote: items whose totals differ (the quote may have changed since the order was set). */
export function compareWithQuote(order: KitchenOrder, quoteItems: DeliveryItem[]): string[] {
  const totals = new Map<string, { name: string; order: number; quote: number }>();
  const add = (i: { service_id: string | null; name: string }, k: "order" | "quote", n: number) => {
    const key = itemKey(i);
    const t = totals.get(key) ?? { name: i.name, order: 0, quote: 0 };
    t[k] += n; totals.set(key, t);
  };
  for (const d of order.days) for (const i of d.items) add(i, "order", i.qty);
  for (const i of quoteItems) if (i.qty > 0) add(i, "quote", i.qty);
  const out: string[] = [];
  for (const t of totals.values()) {
    if (t.order === t.quote) continue;
    if (!t.quote) out.push(`${t.name}: ${t.order} in the kitchen order but not on the quote`);
    else if (!t.order) out.push(`${t.name}: ${t.quote} on the quote but not in the kitchen order`);
    else out.push(`${t.name}: kitchen order ${t.order}, quote ${t.quote}`);
  }
  return out;
}
