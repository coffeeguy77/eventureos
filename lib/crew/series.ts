/** Regular (repeating) shifts: which dates a weekly / fortnightly shift falls on. Pure — tested with tsx. */
export interface SeriesLike { weekday: number; every_weeks: number; starts_on: string; ends_on: string | null }

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function seriesDates(s: SeriesLike, from: string, to: string): string[] {
  const start = day(s.starts_on);
  // first occurrence on/after starts_on with the right weekday
  const first = start + (((s.weekday - new Date(start).getUTCDay()) + 7) % 7) * 86400000;
  const step = Math.max(1, s.every_weeks) * 7 * 86400000;
  const lo = Math.max(day(from), first), hi = Math.min(day(to), s.ends_on ? day(s.ends_on) : Infinity);
  const out: string[] = [];
  let t = first + Math.max(0, Math.ceil((lo - first) / step)) * step;
  for (; t <= hi; t += step) out.push(iso(t));
  return out;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (isoDate: string) => new Date(day(isoDate)).getUTCDay();
