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
