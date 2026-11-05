/**
 * Unpaid meal breaks (pure — no database).
 *
 * A shift of `after_hours` or longer always has at least `min` minutes of unpaid break, whether or not it was clocked.
 * Breaks are clocked on the café iPad: a shorter one still counts as `min`; a longer one counts as taken (so sitting on
 * the couch for 45 minutes costs 45 minutes); `max` is the longest allowed — anything over is flagged.
 * Flags are for managers only (training): no break clocked, short, long, over the limit.
 *
 * Smart breaks (optional): over a week, the total deducted is the larger of (shifts × min) and the breaks actually
 * taken — so a 20-minute break on a busy day is balanced by a 40-minute one on a quiet day instead of costing extra.
 */
export interface BreakRules { min: number; after_hours: number; max: number; smart: boolean }
export type BreakFlag = "none" | "short" | "long" | "over";
export interface BreakEntry {
  id: string; work_date: string;
  /** paid start → finish, minutes */
  spanMinutes: number;
  /** minutes clocked on the iPad; null = no break clocked */
  taken: number | null;
  /** break_minutes as saved */
  stored: number;
  /** clocked by the person (iPad / phone), not set by the office, not an event shift */
  tracked: boolean;
  /** a no-break rule covers this shift (e.g. Saturdays): no automatic break, no "no break" flag */
  exempt?: boolean;
}
export interface BreakResult { minutes: number; flag: BreakFlag | null; taken: number | null; balanced: boolean }

export const qualifies = (spanMinutes: number, r: BreakRules) => r.min > 0 && spanMinutes >= r.after_hours * 60;

export function breakFlag(spanMinutes: number, taken: number | null, r: BreakRules): BreakFlag | null {
  if (taken != null && taken > r.max) return "over";
  if (!qualifies(spanMinutes, r)) return null;
  if (taken == null) return "none";
  if (taken < r.min) return "short";
  if (taken > r.min) return "long";
  return null;
}

/** One shift's unpaid break: at least `floor` (the minimum, or the rostered break if longer) when the shift qualifies. */
export function shiftBreak(spanMinutes: number, taken: number | null, r: BreakRules, floor = r.min): number {
  if (!qualifies(spanMinutes, r)) return Math.max(0, taken ?? 0);
  return Math.max(floor, r.min, taken ?? 0);
}

const mondayOf = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10); };

/** The break each entry is paid with. Untracked entries keep what's saved; with smart breaks, each week is balanced. */
export function effectiveBreaks(list: BreakEntry[], r: BreakRules): Map<string, BreakResult> {
  const out = new Map<string, BreakResult>();
  for (const e of list) out.set(e.id, { minutes: e.stored, flag: e.tracked ? breakFlag(e.spanMinutes, e.taken, e.exempt ? { ...r, min: 0 } : r) : null, taken: e.taken, balanced: false });
  if (!r.smart) return out;
  const weeks = new Map<string, BreakEntry[]>();
  for (const e of list) if (e.tracked && !e.exempt && qualifies(e.spanMinutes, r)) { const k = mondayOf(e.work_date); weeks.set(k, [...(weeks.get(k) ?? []), e]); }
  for (const group of weeks.values()) {
    const base = group.map((e) => ({ e, m: e.taken ?? r.min }));
    let short = group.length * r.min - base.reduce((t, x) => t + x.m, 0);
    for (const x of base) {
      if (short > 0 && x.m < r.min) { const add = Math.min(r.min - x.m, short); x.m += add; short -= add; }
      const cur = out.get(x.e.id)!;
      out.set(x.e.id, { ...cur, minutes: Math.round(x.m), balanced: x.m !== Math.max(r.min, x.e.taken ?? 0) });
    }
  }
  return out;
}

export const FLAG_LABEL: Record<BreakFlag, string> = { none: "No break clocked", short: "Short break", long: "Long break", over: "Over the break limit" };

/* ---------------- no-break rules ---------------- */
/**
 * Shifts that don't get the automatic unpaid break (e.g. Saturdays — nobody stops; the chef on Mondays).
 * A rule is a day (0 = Sunday … 6 = Saturday), a staff member, or both. Breaks they actually clock still count.
 */
export interface BreakSkip { day: number | null; member: string | null }
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function cleanSkips(v: unknown): BreakSkip[] {
  const out: BreakSkip[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const day = Number.isInteger(r.day) && Number(r.day) >= 0 && Number(r.day) <= 6 ? Number(r.day) : null;
    const member = typeof r.member === "string" && /^[0-9a-f-]{36}$/i.test(r.member) ? r.member : null;
    if (day == null && member == null) continue; // "everyone, every day" would switch breaks off altogether — that's the minutes field
    if (!out.some((o) => o.day === day && o.member === member)) out.push({ day, member });
  }
  return out.slice(0, 40);
}

const weekdayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();

/** Does this person's shift on this date skip the automatic break? */
export function skipsBreak(skips: readonly BreakSkip[] | null | undefined, memberId: string | null | undefined, workDate: string | null | undefined): boolean {
  if (!skips?.length || !workDate || !/^\d{4}-\d{2}-\d{2}/.test(workDate)) return false;
  const d = weekdayOf(workDate);
  return skips.some((r) => (r.day == null || r.day === d) && (r.member == null || r.member === memberId));
}

/** The meal-break rule for one shift: no automatic break when a no-break rule matches. */
export function mealFor<M extends { after_hours: number; minutes: number; skip?: BreakSkip[] }>(meal: M, memberId: string | null | undefined, workDate: string | null | undefined): { after_hours: number; minutes: number; skipped: boolean } {
  const skipped = skipsBreak(meal.skip, memberId, workDate);
  return { after_hours: meal.after_hours, minutes: skipped ? 0 : meal.minutes, skipped };
}
