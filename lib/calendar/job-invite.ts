/**
 * What a job looks like in Google Calendar: "Coffee Cart | Press Club", then the times the team needs
 * (setup, service), how many serves, and where. Pure — no server imports, tested with `npx tsx`.
 */

export interface JobInviteInput {
  /** What's being supplied, e.g. "Coffee Cart" (from the quote's package), or null if unknown */
  label: string | null;
  /** Fallback when no package matches, e.g. the event name */
  eventName: string;
  customer: { name: string; company: string | null; kind: string | null } | null;
  date: string | null;          // YYYY-MM-DD
  setupTime: string | null;     // HH:MM[:SS]
  startTime: string | null;     // service start
  finishTime: string | null;    // service end
  serves: number | null;
  servesLabel?: string | null;  // e.g. "coffees" (default "serves")
  staffCount?: number | null;
  staffLabel?: string | null;   // e.g. "barista" (default "staff")
  venue: string | null;
  address: string | null;
}

/** "9am", "9:30am", "12pm" */
export function shortTime(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""}${suffix}`;
}

/** "Coffee Cart | Press Club" — the company if there is one, otherwise the person. */
export function jobTitle(i: Pick<JobInviteInput, "label" | "eventName" | "customer">): string {
  const who = i.customer ? (i.customer.company?.trim() || i.customer.name.trim()) : "";
  const what = i.label?.trim() || i.eventName.trim();
  return who ? `${what} | ${who}` : what;
}

export function jobDescription(i: JobInviteInput): string {
  const lines: string[] = [];
  const setup = shortTime(i.setupTime), start = shortTime(i.startTime), end = shortTime(i.finishTime);
  if (setup) lines.push(`Setup ${setup}`);
  if (start) lines.push(`Service ${start}${end ? ` – ${end}` : ""}`);
  if (i.serves != null && i.serves > 0) lines.push(`${i.serves} ${i.servesLabel?.trim() || "serves"}`);
  if (i.staffCount != null && i.staffCount > 1) {
    const l = i.staffLabel?.trim();
    lines.push(`${i.staffCount} ${l ? (l.endsWith("s") ? l : `${l}s`) : "staff"}`);
  }
  const where = [i.venue?.trim(), i.address?.trim()].filter((v): v is string => !!v).filter((v, n, a) => a.indexOf(v) === n);
  if (where.length) { if (lines.length) lines.push(""); lines.push(...where); }
  return lines.join("\n");
}

/** Day of week (0 = Sunday … 6 = Saturday) for a YYYY-MM-DD date. */
export function weekday(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/** Show the booking as Free on these days (e.g. Saturdays, so a website booking system sharing the calendar isn't blocked). */
export function isFreeDay(date: string | null, freeDays: number[]): boolean {
  return !!date && freeDays.includes(weekday(date));
}
