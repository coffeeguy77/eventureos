import { CATEGORIES, roundTime, type Category, type DayHours } from "./award";
import type { RosterSettings } from "./settings";
import { fromLocal, shiftSpan, toLocal } from "./time";

/** Paid start/finish: clock times rounded, or the rostered times when they clocked within the grace minutes. */
export function paidTimes(settings: Pick<RosterSettings, "rounding" | "grace">, tz: string, clockIn: string, clockOut: string, shift: { shift_date: string; start_time: string; finish_time: string } | null) {
  const inL = toLocal(clockIn, tz), outL = toLocal(clockOut, tz);
  let start = roundTime(inL, settings.rounding), finish = roundTime(outL, settings.rounding);
  if (shift) {
    const span = shiftSpan(shift.shift_date, shift.start_time, shift.finish_time);
    const mins = (a: string, b: string) => Math.abs(Date.parse(`${a}:00Z`) - Date.parse(`${b}:00Z`)) / 60_000;
    if (mins(inL, span.start) <= settings.grace) start = span.start;
    if (mins(outL, span.finish) <= settings.grace) finish = span.finish;
  }
  if (finish <= start) finish = roundTime(outL, 1);
  return { start: fromLocal(start, tz), finish: fromLocal(finish, tz) };
}

/** Timesheet lines for a period: one per earnings rate, with hours for each day of the period. */
export function timesheetLines(byDay: Map<string, DayHours>, dates: string[], earnings: Partial<Record<Category, string>>): { earningsRateId: string; units: number[] }[] {
  const ordinary = earnings.ordinary;
  const lines = new Map<string, number[]>();
  for (const c of CATEGORIES) {
    // a loading with no earnings rate isn't sent (it would double the hours as Ordinary); base hours fall back to Ordinary
    const rate = earnings[c] ?? (c === "evening" || c === "late_night" ? null : ordinary);
    if (!rate) continue;
    const units = lines.get(rate) ?? dates.map(() => 0);
    dates.forEach((d, i) => { units[i] = Math.round((units[i] + (byDay.get(d)?.[c] ?? 0)) * 100) / 100; });
    lines.set(rate, units);
  }
  return [...lines].filter(([, u]) => u.some((x) => x > 0)).map(([earningsRateId, units]) => ({ earningsRateId, units }));
}

