/**
 * Line helpers: work out a quote line's quantity (and its description) from how people think about it.
 *  - Staff lines (charged by the hour): service start → end, number of staff; setup time is added before the
 *    service using the package's rule (e.g. 30 min), with its minimum hours and rounding.
 *  - Drinks lines (charged per serve): hot + cold. Typing a total puts it all on hot (keeping any cold).
 * Pure — used by the quote builder and tested with `npx tsx`.
 */
import { serviceHours, staffHours, type StaffRule } from "@/lib/pricing/engine";
import { shortTime } from "@/lib/calendar/job-invite";

/** One shift day: a date (or "Day 2" when not confirmed), setup before service, and who's working. */
export interface ShiftDay {
  date: string | null;          // YYYY-MM-DD, or null → "Day N"
  start: string | null;         // service start HH:MM
  end: string | null;           // service end HH:MM
  setup_minutes: number;        // paid setup before service
  units: number;                // carts / stations running that day
  per_unit: number;             // staff per cart
}
export interface StaffDetails {
  kind: "staff";
  days: ShiftDay[];
  /** What a "unit" is called, e.g. "cart" (shown when more than one runs) */
  unit_label?: string;
  /** Driving to and from the job, charged each way on every day (set from the quote's Travel line) */
  travel_minutes?: number;
  /**
   * Override for this quote: charge every staff member at least this many hours a shift, with no included hour
   * (e.g. a regular on a cheaper coffee price, where the van's free first hour doesn't pay).
   */
  min_shift?: number;
  // Older single-day shape (still read): start, end, staff, setup_minutes
  start?: string | null; end?: string | null; staff?: number; setup_minutes?: number;
}
export interface ServesDetails { kind: "serves"; hot: number; cold: number }
/**
 * Travel to a job (e.g. the coffee van): kilometres each way, doubled for the return trip, for each day it goes out.
 * The driving time is charged on the barista line (travel_minutes each way) and lengthens the shift and calendar entry.
 */
export interface TravelDetails {
  kind: "travel";
  /** Where the van is going (goes into the calendar entry) */
  address: string;
  km: number;               // one way
  drive_minutes: number;    // one way, as driven
  charge_minutes: number;   // one way, as charged (e.g. 1 hr 45 → 2 hrs)
  trips: number;            // return trips (usually one per day)
}
export type LineDetails = StaffDetails | ServesDetails | TravelDetails;

const toMin = (t: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const fmtH = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(h * 4 % 1 === 0 ? 2 : 1).replace(/0$/, "")} hr${h === 1 ? "" : "s"}`;

/** Every staff line as days (older single-day lines become one undated day). */
export function shiftDays(d: StaffDetails): ShiftDay[] {
  if (Array.isArray(d.days) && d.days.length) return d.days;
  return [{ date: null, start: d.start ?? null, end: d.end ?? null, setup_minutes: d.setup_minutes ?? 0, units: 1, per_unit: Math.max(1, d.staff ?? 1) }];
}

/** When the team arrives to set up, e.g. "07:30" for an 8am start with 30 min setup. */
export function setupTime(d: { start: string | null; setup_minutes: number }): string | null {
  const s = toMin(d.start);
  return s == null ? null : hhmm(s - (d.setup_minutes || 0));
}

const addDays = (iso: string, n: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
/** "Monday 24th November" */
export function longDay(iso: string) {
  const t = new Date(`${iso}T12:00:00Z`);
  const wd = t.toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });
  const mo = t.toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" });
  return `${wd} ${ordinal(t.getUTCDate())} ${mo}`;
}
export const dayLabel = (day: ShiftDay, i: number) => (day.date ? longDay(day.date) : `Day ${i + 1}`);

/** The next day: same hours and team as the last day, dated the day after it (or "Day N" when undated). */
export function nextShiftDay(days: ShiftDay[]): ShiftDay {
  const last = days[days.length - 1];
  if (!last) return { date: null, start: null, end: null, setup_minutes: 30, units: 1, per_unit: 1 };
  return { ...last, date: last.date ? addDays(last.date, 1) : null };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 || w.endsWith("s") ? "" : "s"}`;
const hrLabel = (h: number) => `${Number.isInteger(h) ? h : Number(h.toFixed(2))} hr${h === 1 ? "" : "s"}`;
const hrsText = (h: number) => `${Number.isInteger(h) ? h : Number(h.toFixed(2))}hrs`;

/** Hours to charge across every day and person, the line's description, and per-day workings. */
export function staffLine(d: StaffDetails, rule: StaffRule | null, label = "staff") {
  const days = shiftDays(d);
  const unitWord = d.unit_label?.trim() || "cart";
  const out: { day: string; staff: number; perPerson: number; hours: number; each: number[] }[] = [];
  const blocks: string[] = [];
  const multi = days.length > 1 || days.some((x) => x.date);
  for (const [i, day] of days.entries()) {
    const s = toMin(day.start), e = toMin(day.end);
    if (s == null || e == null) return null;
    const hrs = serviceHours(s, e);
    const ms = Math.max(0, d.min_shift ?? 0);
    const r: StaffRule = { ...(rule ?? { service_id: "" }), setup_minutes: day.setup_minutes, packdown_minutes: rule?.packdown_minutes ?? 0,
      ...(ms ? { included_hours: 0, min_hours: Math.max(rule?.min_hours ?? 0, ms), min_hours_extra: Math.max(rule?.min_hours_extra ?? 0, ms) } : {}) };
    const units = Math.max(1, Math.floor(day.units || 1)), per = Math.max(1, Math.floor(day.per_unit || 1));
    const staff = units * per;
    const travel = Math.max(0, d.travel_minutes ?? 0) * 2 / 60;
    const each = Array.from({ length: staff }, (_, n) => Math.round((staffHours(r, hrs, n === 0) + travel) * 100) / 100);
    const hours = Math.round(each.reduce((a, b) => a + b, 0) * 100) / 100;
    out.push({ day: dayLabel(day, i), staff, perPerson: each[0], hours, each });
    const setup = setupTime(day);
    const who = units > 1 ? ` – ${plural(per, label)} / per ${unitWord}` : staff > 1 && multi ? ` – ${plural(staff, label)}` : "";
    const lines = [
      multi ? `${dayLabel(day, i)} – ${hrsText(each[0])}${staff > 1 && each.some((x) => x !== each[0]) ? ` + ${each.slice(1).map(hrLabel).join(" + ")} (${hrsText(hours)})` : staff > 1 ? ` x${staff} (${hrsText(hours)})` : ""}` : null,
      day.setup_minutes > 0 && setup ? `Setup ${shortTime(setup)}` : null,
      `Service ${shortTime(day.start)} – ${shortTime(day.end)}${who}`,
      travel > 0 ? `Travel ${minutesText(d.travel_minutes!)} each way (${hrsText(travel)})` : null,
      !multi && staff > 1 ? (each.every((x) => x === each[0]) ? `${plural(staff, label)} × ${hrsText(each[0]).replace("hrs", " hrs")}` : `${plural(staff, label)}: ${each.map(hrLabel).join(" + ")}`) : null,
    ].filter(Boolean);
    blocks.push(lines.join("\n"));
  }
  const quantity = Math.round(out.reduce((a, x) => a + x.hours, 0) * 100) / 100;
  return { quantity, description: blocks.join("\n\n"), days: out, perStaff: [out[0]?.perPerson ?? 0] };
}

/** Quantity and first description line for a drinks line. */
export function servesLine(d: ServesDetails, base: string | null) {
  const hot = Math.max(0, Math.round(d.hot || 0)), cold = Math.max(0, Math.round(d.cold || 0));
  const head = cold ? `${hot} Hot + ${cold} Cold drinks` : `${hot} Hot drinks`;
  return { quantity: hot + cold, description: base?.trim() ? `${head}\n\n${base.trim()}` : head };
}

/** A total typed straight into Qty: everything that isn't cold is hot. */
export function servesFromQuantity(d: ServesDetails, qty: number): ServesDetails {
  const total = Math.max(0, Math.round(qty));
  const cold = Math.min(Math.max(0, Math.round(d.cold || 0)), total);
  return { kind: "serves", hot: total - cold, cold };
}

/** Accept only well-formed details (from the browser or the database). */
export function cleanDetails(raw: unknown): LineDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0; };
  if (r.kind === "staff") {
    const t = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null);
    const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const rawDays = Array.isArray(r.days) ? r.days : [{ date: null, start: r.start, end: r.end, setup_minutes: r.setup_minutes, units: 1, per_unit: r.staff }];
    const days = rawDays.slice(0, 31).map((x) => {
      const y = (x ?? {}) as Record<string, unknown>;
      return { date: date(y.date), start: t(y.start), end: t(y.end), setup_minutes: Math.round(n(y.setup_minutes, 600)),
        units: Math.max(1, Math.round(n(y.units ?? 1, 50))), per_unit: Math.max(1, Math.round(n(y.per_unit ?? 1, 50))) };
    });
    const unit = typeof r.unit_label === "string" ? r.unit_label.trim().slice(0, 30) : "";
    const travel = Math.round(n(r.travel_minutes, 24 * 60));
    const minShift = Math.round(n(r.min_shift, 12) * 4) / 4;
    return { kind: "staff", days, ...(unit ? { unit_label: unit } : {}), ...(travel ? { travel_minutes: travel } : {}), ...(minShift ? { min_shift: minShift } : {}) };
  }
  if (r.kind === "travel") {
    return { kind: "travel", address: typeof r.address === "string" ? r.address.trim().slice(0, 300) : "", km: Math.round(n(r.km, 5000) * 10) / 10,
      drive_minutes: Math.round(n(r.drive_minutes, 24 * 60)), charge_minutes: Math.round(n(r.charge_minutes, 24 * 60)), trips: Math.max(1, Math.round(n(r.trips ?? 1, 62))) };
  }
  if (r.kind === "serves") return { kind: "serves", hot: Math.round(n(r.hot, 1_000_000)), cold: Math.round(n(r.cold, 1_000_000)) };
  return null;
}

/** "1 hr 45 min", "2 hrs", "45 min" */
export function minutesText(m: number) {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return [h ? `${h} hr${h === 1 ? "" : "s"}` : "", r ? `${r} min` : ""].filter(Boolean).join(" ") || "0 min";
}

/** Driving time rounded up to the next half hour — what's charged by default (1 hr 45 → 2 hrs). */
export const chargeMinutes = (drive: number) => Math.ceil(Math.max(0, drive) / 30) * 30;

/** The travel line: return kilometres for every trip, and its description. */
export function travelLine(d: TravelDetails, from: string | null) {
  const trips = Math.max(1, Math.round(d.trips || 1));
  const quantity = Math.round(d.km * 2 * trips * 10) / 10;
  const km = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1)} km`;
  const lines = [
    `${from?.trim() || "Our base"} → ${d.address.trim() || "the venue"}`,
    `${km(d.km)} each way · ${km(d.km * 2)} return${trips > 1 ? ` × ${trips} trips = ${km(quantity)}` : ""}`,
    d.charge_minutes > 0 ? `Driving ${minutesText(d.drive_minutes || d.charge_minutes)} each way${d.charge_minutes !== d.drive_minutes ? ` (charged as ${minutesText(d.charge_minutes)})` : ""} — on the barista hours` : null,
  ].filter(Boolean);
  return { quantity, description: lines.join("\n") };
}
