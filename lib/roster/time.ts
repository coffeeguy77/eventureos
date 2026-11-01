/** Local wall-clock helpers for the roster ("YYYY-MM-DDTHH:MM" in the business's time zone). */

/** A UTC timestamp as local "YYYY-MM-DDTHH:MM". */
export function toLocal(ts: string | Date, tz: string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Local "YYYY-MM-DDTHH:MM" as a UTC ISO timestamp (handles daylight saving). */
export function fromLocal(local: string, tz: string): string {
  const [date, time] = local.split("T");
  // first guess: treat as UTC, then correct by the zone's offset at that moment (twice, for DST edges)
  let guess = Date.parse(`${date}T${time}:00Z`);
  for (let i = 0; i < 2; i++) {
    const shown = Date.parse(`${toLocal(new Date(guess), tz)}:00Z`);
    guess += Date.parse(`${date}T${time}:00Z`) - shown;
  }
  return new Date(guess).toISOString();
}

/** A shift's start and finish as local stamps; a finish at or before the start runs past midnight. */
export function shiftSpan(date: string, start: string, finish: string): { start: string; finish: string } {
  const s = `${date}T${start.slice(0, 5)}`;
  const nextDay = finish.slice(0, 5) <= start.slice(0, 5);
  const fd = nextDay ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  return { start: s, finish: `${fd}T${finish.slice(0, 5)}` };
}

export const hoursBetween = (a: string, b: string) => Math.max(0, (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 3_600_000);

/** The 7 dates of the week starting on a Monday. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
}
