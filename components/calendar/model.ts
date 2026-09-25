/** Calendar model: pure, timezone-safe helpers shared by the server page and client views.
 *  All "dates" are org-local calendar dates (YYYY-MM-DD); all instants are UTC ISO strings. */
import { addDaysISO, todayISO, zonedMidnightUTC } from "@/lib/format";

export type CalView = "month" | "week" | "day" | "agenda";
export const VIEWS: { key: CalView; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
  { key: "agenda", label: "Agenda" },
];

export type EntryKind = "event" | "site_visit" | "setup" | "hold" | "other";
export const KIND_LABEL: Record<EntryKind, string> = {
  event: "Event", site_visit: "Site visit", setup: "Setup", hold: "Hold", other: "Other",
};

export type SyncStatus = "local" | "pending" | "synced" | "error";

export interface Resource {
  id: string; name: string; colour: string; provider: "local" | "google" | "microsoft";
  syncEnabled: boolean; externalCalendarId: string | null; isDefault: boolean; hidden: boolean;
}

export interface Segment {
  date: string;      // org-local date
  startMin: number;  // minutes after local midnight (0–1440)
  endMin: number;
  fromPrev: boolean; // continues from the previous day
  toNext: boolean;   // continues into the next day
}

export interface Entry {
  id: string; title: string; kind: EntryKind; startsAt: string; endsAt: string; allDay: boolean;
  lane: "allday" | "timed"; location: string | null;
  resourceId: string; eventId: string | null; eventName: string | null; eventNumber: number | null;
  customerName: string | null; syncStatus: SyncStatus; externalEventId: string | null; lastSyncedAt: string | null;
  timeLabel: string; dateLabel: string; conflictsWith: string[]; segments: Segment[];
}

export const AGENDA_DAYS = 60;
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 23;

export const isISODate = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

/** 0 = Monday … 6 = Sunday */
export const weekdayMon0 = (iso: string) => (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
export const startOfWeek = (iso: string) => addDaysISO(iso, -weekdayMon0(iso));
export const firstOfMonth = (iso: string) => iso.slice(0, 8) + "01";
export function addMonthsISO(iso: string, n: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Inclusive-exclusive local-date range the view displays. */
export function viewRange(view: CalView, date: string): { start: string; end: string } {
  if (view === "day") return { start: date, end: addDaysISO(date, 1) };
  if (view === "week") { const s = startOfWeek(date); return { start: s, end: addDaysISO(s, 7) }; }
  if (view === "agenda") return { start: date, end: addDaysISO(date, AGENDA_DAYS) };
  const first = firstOfMonth(date);
  const start = startOfWeek(first);
  const lastOfMonth = addDaysISO(addMonthsISO(first, 1), -1);
  const end = addDaysISO(startOfWeek(lastOfMonth), 7);
  return { start, end };
}

export function stepDate(view: CalView, date: string, dir: 1 | -1) {
  if (view === "month") return addMonthsISO(firstOfMonth(date), dir);
  if (view === "week") return addDaysISO(date, 7 * dir);
  if (view === "agenda") return addDaysISO(date, 30 * dir);
  return addDaysISO(date, dir);
}

export function daysIn(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d < end; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

const fmtUTC = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { ...o, timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

export function viewTitle(view: CalView, date: string) {
  if (view === "month") return fmtUTC(date, { month: "long", year: "numeric" });
  if (view === "day") return fmtUTC(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { start, end } = viewRange(view, date);
  const last = addDaysISO(end, -1);
  const sameYear = start.slice(0, 4) === last.slice(0, 4);
  const sameMonth = start.slice(0, 7) === last.slice(0, 7);
  const a = fmtUTC(start, sameMonth ? { day: "numeric" } : sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  const b = fmtUTC(last, { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

/** Local clock of an instant in a timezone. */
export function localParts(ts: string, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")), hhmm: `${get("hour")}:${get("minute")}` };
}

/** Split an entry into one segment per local day it touches within [days]. */
export function segmentsFor(startsAt: string, endsAt: string, days: string[], tz: string): Segment[] {
  const s = Date.parse(startsAt);
  const e = Math.max(Date.parse(endsAt), s + 60_000); // zero-length entries still occupy a minute
  const out: Segment[] = [];
  for (const d of days) {
    const ds = Date.parse(zonedMidnightUTC(d, tz));
    const de = Date.parse(zonedMidnightUTC(addDaysISO(d, 1), tz));
    if (s < de && e > ds) {
      const startMin = s <= ds ? 0 : localParts(new Date(s).toISOString(), tz).minutes;
      const endMin = e >= de ? 1440 : Math.max(startMin + 1, localParts(new Date(e).toISOString(), tz).minutes);
      out.push({ date: d, startMin, endMin, fromPrev: s < ds, toNext: e > de });
    }
  }
  return out;
}

/** Map of entry id → ids of entries on the SAME resource whose times overlap. */
export function findConflicts(rows: { id: string; resourceId: string; startsAt: string; endsAt: string }[]) {
  const map: Record<string, string[]> = {};
  const byRes = new Map<string, typeof rows>();
  for (const r of rows) byRes.set(r.resourceId, [...(byRes.get(r.resourceId) ?? []), r]);
  for (const list of byRes.values()) {
    const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aEnd = Date.parse(a.endsAt);
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (Date.parse(b.startsAt) >= aEnd) break;
        (map[a.id] ??= []).push(b.id);
        (map[b.id] ??= []).push(a.id);
      }
    }
  }
  return map;
}

export function minutesLabel(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export const isToday = (iso: string, tz: string) => iso === todayISO(tz);

/** Build a /calendar URL, keeping only non-default params. */
export function calendarHref(p: { view: CalView; date: string; hide: string[]; today: string; panel?: string }) {
  const q = new URLSearchParams();
  if (p.view !== "month") q.set("view", p.view);
  if (p.date !== p.today) q.set("date", p.date);
  if (p.hide.length) q.set("hide", p.hide.join(","));
  if (p.panel) q.set("panel", p.panel);
  const s = q.toString();
  return s ? `/calendar?${s}` : "/calendar";
}
