/** Pay periods of a Xero payroll calendar (pure). */
export interface PayCalendar { id: string; name: string; type: string; start: string | null }

const DAY = 86_400_000;
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The pay period (start, end) of a calendar that contains a date. Monthly calendars run on the start date's day of the month. */
export function periodFor(cal: PayCalendar, date: string): { start: string; end: string } | null {
  if (!cal.start) return null;
  const len = cal.type === "WEEKLY" ? 7 : cal.type === "FORTNIGHTLY" ? 14 : cal.type === "FOURWEEKLY" ? 28 : 0;
  if (len) {
    const k = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${cal.start}T00:00:00Z`)) / (len * DAY));
    const start = add(cal.start, k * len);
    return { start, end: add(start, len - 1) };
  }
  if (cal.type === "MONTHLY") {
    const day = Number(cal.start.slice(8, 10));
    const [y, m] = date.split("-").map(Number);
    const mk = (yy: number, mm: number) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`; };
    let start = mk(y, m);
    if (start > date) start = m === 1 ? mk(y - 1, 12) : mk(y, m - 1);
    const [sy, sm] = start.split("-").map(Number);
    const next = sm === 12 ? mk(sy + 1, 1) : mk(sy, sm + 1);
    return { start, end: add(next, -1) };
  }
  return null;
}

/** The dates of a period, in order. */
export function periodDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = add(d, 1)) out.push(d);
  return out;
}
