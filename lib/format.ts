/** Formatting helpers. Dates are shown in the organisation's timezone. */

export function money(value: number | string | null | undefined, currency = "AUD", opts: { cents?: boolean } = {}) {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function compactMoney(value: number, currency = "AUD") {
  if (Math.abs(value) >= 10000) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return money(value, currency, { cents: false });
}

/** Today's calendar date (YYYY-MM-DD) in a timezone. */
export function todayISO(tz: string, base: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / 86400000);
}

/** Format a plain date column (no timezone shift). */
export function fmtDate(iso: string | null | undefined, style: "short" | "medium" | "long" | "weekday" = "medium") {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : style === "weekday"
          ? { weekday: "short", day: "numeric", month: "short" }
          : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "UTC" }).format(d);
}

/** Format a timestamp in the org timezone. */
export function fmtDateTime(ts: string | null | undefined, tz: string, style: "time" | "datetime" | "date" = "datetime") {
  if (!ts) return "—";
  const d = new Date(ts);
  const opts: Intl.DateTimeFormatOptions =
    style === "time"
      ? { hour: "numeric", minute: "2-digit" }
      : style === "date"
        ? { day: "numeric", month: "short", year: "numeric" }
        : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: tz }).format(d);
}

export function fmtTime(hhmmss: string | null | undefined) {
  if (!hhmmss) return "";
  const [h, m] = hhmmss.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export function timeRange(start: string | null, finish: string | null) {
  if (!start) return "";
  return finish ? `${fmtTime(start)} – ${fmtTime(finish)}` : fmtTime(start);
}

/** "3h ago", "in 2d", "just now" */
export function relative(ts: string | null | undefined, now: Date = new Date()) {
  if (!ts) return "—";
  const diff = Date.parse(ts) - now.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  let label: string;
  if (mins < 1) return "just now";
  if (mins < 60) label = `${mins}m`;
  else if (mins < 60 * 24) label = `${Math.round(mins / 60)}h`;
  else if (mins < 60 * 24 * 30) label = `${Math.round(mins / 1440)}d`;
  else if (mins < 60 * 24 * 365) label = `${Math.round(mins / 43200)}mo`;
  else label = `${Math.round(mins / 525600)}y`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}

/** Relative description of a date column vs today: "Today", "Tomorrow", "In 5 days", "3 days ago". */
export function relativeDay(iso: string | null | undefined, today: string) {
  if (!iso) return "";
  const n = daysBetween(today, iso.slice(0, 10));
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1) return n <= 60 ? `In ${n} days` : `In ${Math.round(n / 30)} months`;
  return -n <= 60 ? `${-n} days ago` : `${Math.round(-n / 30)} months ago`;
}

export function greeting(tz: string, now: Date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName: string | null | undefined, email?: string) {
  if (fullName) return fullName.split(" ")[0];
  return email ? email.split("@")[0] : "there";
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.replace(/[^\p{L}\s&]/gu, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Start/end (UTC ISO) of the org-local calendar month containing `now`. */
export function monthBoundsUTC(tz: string, now: Date = new Date()) {
  const today = todayISO(tz, now);
  const first = today.slice(0, 8) + "01";
  const [y, m] = first.split("-").map(Number);
  const next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
  return { start: zonedMidnightUTC(first, tz), end: zonedMidnightUTC(next, tz), label: new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" }).format(new Date(first + "T00:00:00Z")) };
}

/** Offset (ms) of a timezone from UTC at a given instant — independent of the server's own timezone. */
function tzOffsetMs(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - at.getTime();
}

/** UTC instant (ISO) of local midnight for a calendar date in a timezone. */
export function zonedMidnightUTC(iso: string, tz: string) {
  return zonedTimeUTC(iso, "00:00", tz);
}

/** UTC instant (ISO) of a local date + time (HH:MM) in a timezone. */
export function zonedTimeUTC(iso: string, hhmm: string, tz: string) {
  const guess = new Date(`${iso.slice(0, 10)}T${hhmm.slice(0, 5)}:00Z`);
  const first = guess.getTime() - tzOffsetMs(guess, tz);
  // second pass handles DST transitions
  const exact = guess.getTime() - tzOffsetMs(new Date(first), tz);
  return new Date(exact).toISOString();
}
