/**
 * Multi-day jobs: a job can run over several dates (e.g. 20–23 October), each with its own setup / start / finish.
 *   events.days = [{ date: "2026-10-20", setup: "08:30", start: "09:00", finish: "13:00" }, …]  (two or more days)
 * A one-day job keeps using event_date / setup_time / start_time / finish_time and leaves days empty.
 * Pure — used by the job form, the calendar and the quote builder, and tested with `npx tsx`.
 */
import { setupTime, type ShiftDay } from "@/lib/quotes/line-helpers";

export interface EventDay { date: string; setup: string | null; start: string | null; finish: string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const time = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, "0") : null);
export const MAX_DAYS = 31;

/** Well-formed days only: valid dates, one entry per date, in date order. */
export function parseDays(raw: unknown): EventDay[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EventDay[] = [];
  for (const x of raw.slice(0, 200)) {
    const r = (x ?? {}) as Record<string, unknown>;
    const date = typeof r.date === "string" && DATE.test(r.date) && !Number.isNaN(Date.parse(`${r.date}T12:00:00Z`)) ? r.date : null;
    if (!date || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, setup: time(r.setup), start: time(r.start), finish: time(r.finish) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_DAYS);
}

export function addDays(iso: string, n: number) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive (empty if backwards or longer than MAX_DAYS). */
export function dateRange(from: string, to: string): string[] {
  if (!DATE.test(from) || !DATE.test(to) || to < from) return [];
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out.length > MAX_DAYS ? [] : out;
}

interface EventTimes { event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; days?: unknown; fleet_dates?: string[] | null }

/**
 * The days a job runs, with hours for each:
 *  1. the job's own days (two or more), any missing hours filled from the quote's barista hours for that date;
 *  2. otherwise the quote's barista hours when they're dated over two or more days;
 *  3. otherwise the one event date (hours from the job, or the quote's barista hours).
 */
export function jobDays(ev: EventTimes, staff: ShiftDay[] = []): EventDay[] {
  const fromStaff = (s: ShiftDay | undefined) => (s ? { setup: s.start ? setupTime(s) : null, start: s.start, finish: s.end } : { setup: null, start: null, finish: null });
  const dated = staff.filter((s): s is ShiftDay & { date: string } => !!s.date && DATE.test(s.date));
  const own = parseDays(ev.days);
  if (own.length >= 2) {
    return own.map((d) => {
      const s = fromStaff(dated.find((x) => x.date === d.date));
      return d.start || d.finish || d.setup ? d : { date: d.date, ...s };
    });
  }
  const staffDays = parseDays(dated.map((s) => ({ date: s.date, ...fromStaff(s) })));
  if (staffDays.length >= 2) return staffDays;
  if (!ev.event_date) return [];
  const s = fromStaff(dated.find((x) => x.date === ev.event_date) ?? staff[0]);
  const start = time(ev.start_time) ?? s.start;
  return [{
    date: ev.event_date,
    setup: time(ev.setup_time) ?? (ev.start_time ? null : s.setup),
    start, finish: time(ev.finish_time) ?? s.finish,
  }];
}

/** The days to show in the job form when it opens: its own days, else the website's hire dates, else dated barista hours. */
export function formDays(ev: EventTimes, staff: ShiftDay[] = []): EventDay[] {
  const own = parseDays(ev.days);
  if (own.length >= 2) return own;
  const fleet = parseDays((ev.fleet_dates ?? []).map((date) => ({ date })));
  const staffDays = jobDays({ ...ev, days: [] }, staff);
  if (fleet.length >= 2) {
    return fleet.map((d) => staffDays.find((x) => x.date === d.date) ?? { date: d.date, setup: time(ev.setup_time), start: time(ev.start_time), finish: time(ev.finish_time) });
  }
  return staffDays.length >= 2 ? staffDays : [];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parts = (iso: string) => { const t = new Date(`${iso}T12:00:00Z`); return { wd: WD[t.getUTCDay()], d: t.getUTCDate(), m: MONTHS[t.getUTCMonth()], y: t.getUTCFullYear() }; };

/** "Tue 20, Wed 21, Thu 22 & Fri 23 October 2026" (months / years shown where they change). */
export function datesText(dates: string[]): string {
  const ds = [...new Set(dates)].sort();
  if (!ds.length) return "";
  const p = ds.map(parts);
  const bits = p.map((x, i) => {
    const next = p[i + 1];
    const endOfMonth = !next || next.m !== x.m || next.y !== x.y;
    const endOfYear = !next || next.y !== x.y;
    return `${x.wd} ${x.d}${endOfMonth ? ` ${x.m}` : ""}${endOfYear ? ` ${x.y}` : ""}`;
  });
  return bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} & ${bits[bits.length - 1]}`;
}

/** The line added to a hire item's description for a multi-day job. Recognised (and replaced) by withHireDays. */
export const HIRE_DAYS_LINE = /^\d+ days? hire[ :–-].*$/m;

/**
 * A hire line (coffee cart / van / caravan) for a job over several days: quantity = days (× units running each day)
 * and "4 days hire – Tue 20, Wed 21, Thu 22 & Fri 23 October 2026" at the end of the description.
 * One date (or none): the hire-days line is taken off and the quantity is left alone (null) unless it was ours.
 */
export function withHireDays(description: string | null, days: { date: string; units?: number }[]): { description: string; quantity: number | null } {
  const base = (description ?? "").replace(new RegExp(`\\n*${HIRE_DAYS_LINE.source}`, "m"), "").trimEnd();
  const ds = [...new Map(days.filter((d) => DATE.test(d.date)).map((d) => [d.date, Math.max(1, Math.floor(d.units ?? 1))])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (ds.length < 2) return { description: base, quantity: HIRE_DAYS_LINE.test(description ?? "") ? Math.max(1, ds[0]?.[1] ?? 1) : null };
  const qty = ds.reduce((a, [, u]) => a + u, 0);
  const line = `${ds.length} days hire – ${datesText(ds.map(([d]) => d))}`;
  return { description: base ? `${base}\n\n${line}` : line, quantity: qty };
}

/** Event days → shift-day-like rows (for hire quantities). */
export const hireDays = (days: EventDay[], units = 1) => days.map((d) => ({ date: d.date, units }));

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const LONG_WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Wednesday 21st October" */
export function longDayLabel(iso: string) {
  const t = new Date(`${iso}T12:00:00Z`);
  return `${LONG_WD[t.getUTCDay()]} ${ordinal(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]}`;
}
