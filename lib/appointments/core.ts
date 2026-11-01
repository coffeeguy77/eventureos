/**
 * Appointments (pure — no database): settings, and the free times a client can book.
 *
 * Free time = inside your weekly hours, not on a blocked day, at least `notice_hours` from now, within `horizon_days`,
 * and clear of anything already on (other meetings, calendar entries) with `buffer` minutes either side.
 */
export type ApptKind = "video" | "phone" | "in_person";
export const KIND_LABEL: Record<ApptKind, string> = { video: "Video call", phone: "Phone call", in_person: "In person" };

export interface ApptSettings {
  enabled: boolean;               // the public booking page is on
  title: string;                  // e.g. "Book a meeting"
  intro: string;
  durations: number[];            // minutes the client can choose
  notice_hours: number;           // earliest booking from now
  buffer: number;                 // minutes kept free around meetings
  horizon_days: number;           // how far ahead they can book
  step: number;                   // start times every N minutes
  weekly: Record<string, [string, string][]>; // "0".."6" (Sun..Sat) → [["09:00","17:00"], …]
  kinds: ApptKind[];
  location: string;               // for in-person meetings
  meeting_url: string;            // your standing video link (Google Meet / Zoom), optional
  auto_confirm: boolean;          // website bookings are confirmed straight away (else they wait for you)
  blocked: { from: string; to: string; reason: string }[]; // whole days you're away
  on_website: boolean;            // show "Book a meeting" on your EventureOS website
}

const DEFAULT_WEEK: ApptSettings["weekly"] = { "0": [], "1": [["09:00", "17:00"]], "2": [["09:00", "17:00"]], "3": [["09:00", "17:00"]], "4": [["09:00", "17:00"]], "5": [["09:00", "16:00"]], "6": [] };
const HM = /^\d{2}:\d{2}$/;

export function readApptSettings(orgSettings: unknown): ApptSettings {
  const a = ((orgSettings as { appointments?: Record<string, unknown> } | null)?.appointments ?? {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  const weekly: ApptSettings["weekly"] = {};
  const w = (a.weekly ?? DEFAULT_WEEK) as Record<string, unknown>;
  for (const d of ["0", "1", "2", "3", "4", "5", "6"]) {
    const list = Array.isArray(w[d]) ? (w[d] as unknown[]) : [];
    weekly[d] = list.filter((x): x is [string, string] => Array.isArray(x) && HM.test(String(x[0])) && HM.test(String(x[1])) && String(x[0]) < String(x[1])).slice(0, 4);
  }
  const durations = (Array.isArray(a.durations) ? (a.durations as unknown[]) : [30, 60]).map(Number).filter((x) => [15, 20, 30, 45, 60, 90, 120].includes(x));
  const kinds = (Array.isArray(a.kinds) ? (a.kinds as unknown[]) : ["video", "phone", "in_person"]).filter((k): k is ApptKind => k === "video" || k === "phone" || k === "in_person");
  const blocked = (Array.isArray(a.blocked) ? (a.blocked as { from?: unknown; to?: unknown; reason?: unknown }[]) : [])
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(String(b.from)) && /^\d{4}-\d{2}-\d{2}$/.test(String(b.to ?? b.from)))
    .map((b) => ({ from: String(b.from), to: String(b.to ?? b.from) < String(b.from) ? String(b.from) : String(b.to ?? b.from), reason: typeof b.reason === "string" ? b.reason.slice(0, 80) : "" }));
  return {
    enabled: a.enabled === true,
    title: typeof a.title === "string" && a.title.trim() ? a.title.trim().slice(0, 80) : "Book a meeting",
    intro: typeof a.intro === "string" ? a.intro.slice(0, 500) : "",
    durations: durations.length ? [...new Set(durations)].sort((x, y) => x - y) : [30],
    notice_hours: n(a.notice_hours, 24, 0, 720), buffer: n(a.buffer, 15, 0, 120), horizon_days: n(a.horizon_days, 30, 1, 180), step: [15, 30, 60].includes(Number(a.step)) ? Number(a.step) : 30,
    weekly, kinds: kinds.length ? kinds : ["video"],
    location: typeof a.location === "string" ? a.location.slice(0, 200) : "", meeting_url: typeof a.meeting_url === "string" && /^https:\/\//.test(a.meeting_url) ? a.meeting_url.slice(0, 300) : "",
    auto_confirm: a.auto_confirm !== false, blocked, on_website: a.on_website === true,
  };
}

/** Local wall time in a timezone → UTC ms. */
export function zonedMs(date: string, hhmm: string, tz: string): number {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const off = (ms: number) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
    const g = (t: string) => p.find((x) => x.type === t)!.value;
    return Date.parse(`${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}:00Z`) - ms;
  };
  let ms = guess - off(guess);
  ms = guess - off(ms);
  return ms;
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface Busy { start: number; end: number } // ms
export interface DaySlots { date: string; times: string[] } // local "HH:MM" starts

/** Free start times per day for a meeting of `duration` minutes. `today` = local date in the business's timezone. */
export function freeSlots(s: ApptSettings, o: { today: string; tz: string; now: number; duration: number; busy: Busy[]; days?: number }): DaySlots[] {
  const out: DaySlots[] = [];
  const earliest = o.now + s.notice_hours * 3_600_000;
  const pad = s.buffer * 60_000;
  const horizon = Math.min(o.days ?? s.horizon_days, s.horizon_days);
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(o.today, i);
    if (s.blocked.some((b) => date >= b.from && date <= b.to)) { out.push({ date, times: [] }); continue; }
    const dow = String(new Date(`${date}T00:00:00Z`).getUTCDay());
    const times: string[] = [];
    for (const [from, to] of s.weekly[dow] ?? []) {
      for (let m = mins(from); m + o.duration <= mins(to); m += s.step) {
        const start = zonedMs(date, hm(m), o.tz), end = start + o.duration * 60_000;
        if (start < earliest) continue;
        if (o.busy.some((b) => start < b.end + pad && end > b.start - pad)) continue;
        times.push(hm(m));
      }
    }
    out.push({ date, times });
  }
  return out;
}

/** Is a specific time free (used to double-check a booking as it's saved)? */
export function isFree(s: ApptSettings, o: { tz: string; now: number; start: number; end: number; busy: Busy[]; ignoreHours?: boolean }): string | null {
  if (o.start < o.now + s.notice_hours * 3_600_000 && !o.ignoreHours) return `Please choose a time at least ${s.notice_hours} hours away.`;
  const pad = s.buffer * 60_000;
  if (o.busy.some((b) => o.start < b.end + pad && o.end > b.start - pad)) return "That time has just been taken — please choose another.";
  return null;
}

/** An .ics calendar file for an appointment (so it lands in the client's own calendar). */
export function icsFor(a: { id: string; title: string; start: number; end: number; location: string | null; description: string; organiser: string; status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED" }): string {
  const f = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (x: string) => x.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventureOS//Appointments//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${a.id}@eventureos.com.au`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(a.start)}`, `DTEND:${f(a.end)}`, `SUMMARY:${esc(a.title)}`,
    `DESCRIPTION:${esc(a.description)}`, a.location ? `LOCATION:${esc(a.location)}` : "", `ORGANIZER;CN=${esc(a.organiser)}:mailto:noreply@eventureos.com.au`, `STATUS:${a.status ?? "CONFIRMED"}`,
    "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
}
