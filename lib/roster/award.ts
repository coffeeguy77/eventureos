/**
 * Award hours (pure). Turns worked times into the hours Xero Payroll pays, by category, per day:
 *   ordinary (Mon–Fri) · saturday · sunday · public_holiday · overtime_150 · overtime_200   — the hours themselves
 *   evening (Mon–Fri 7pm–midnight) · late_night (Mon–Fri midnight–7am)                     — loadings, paid on top
 * Each category is sent to Xero against the earnings rate you map it to, and Xero works out the dollars from the
 * employee's pay template. The multipliers below are only used for cost estimates on the roster; they are settings
 * (check them against the current Fair Work pay guide) — the time windows and categories are what drive payroll.
 */

export type EmploymentType = "casual" | "part_time" | "full_time";
export const CATEGORIES = ["ordinary", "saturday", "sunday", "public_holiday", "overtime_150", "overtime_200", "evening", "late_night"] as const;
export type Category = (typeof CATEGORIES)[number];
export type DayHours = Record<Category, number>;
export const CATEGORY_LABEL: Record<Category, string> = {
  ordinary: "Ordinary (Mon–Fri)", saturday: "Saturday", sunday: "Sunday", public_holiday: "Public holiday",
  overtime_150: "Overtime — first hours", overtime_200: "Overtime — after that", evening: "Evening — Mon–Fri", late_night: "Early morning / late night — Mon–Fri",
};
/** Loadings are paid on top of the hours, so they don't add to the hours worked. */
export const LOADINGS: Category[] = ["evening", "late_night"];

export interface TypeRules { weekday: number; saturday: number; sunday: number; public_holiday: number; overtime_150: number; overtime_200: number; min_hours: number; evening: number; late_night: number }
export interface AwardRules {
  casual: TypeRules; part_time: TypeRules; full_time: TypeRules;
  evening_from: string; late_to: string;
  /** "add": evening / late-night hours are a loading paid on top (e.g. $ per hour, Hospitality Award);
   *  "replace": those hours are paid at their own rate instead of ordinary (e.g. 110% / 115%, Fast Food Award) */
  loadings: "add" | "replace";
  /** $ per hour for the evening and late-night loadings when they're added on top (cost estimates only) */
  evening_dollars: number; late_night_dollars: number;
  /** hours in a week (Mon–Sun) before overtime; null = no weekly overtime */
  weekly_overtime: number | null;
  /** hours in one shift before overtime; null = no daily overtime */
  daily_overtime: number | null;
  /** overtime hours each day paid at the first rate before the second rate starts */
  overtime_first_hours: number;
  /** casuals get overtime too */
  casual_overtime: boolean;
}

/** Starting values — the structure of the Hospitality Industry (General) Award. Check the numbers against the current pay guide. */
export const DEFAULT_RULES: AwardRules = {
  casual: { weekday: 1.25, saturday: 1.5, sunday: 1.75, public_holiday: 2.5, overtime_150: 1.75, overtime_200: 2.25, min_hours: 2, evening: 0, late_night: 0 },
  part_time: { weekday: 1, saturday: 1.25, sunday: 1.5, public_holiday: 2.25, overtime_150: 1.5, overtime_200: 2, min_hours: 3, evening: 0, late_night: 0 },
  full_time: { weekday: 1, saturday: 1.25, sunday: 1.5, public_holiday: 2.25, overtime_150: 1.5, overtime_200: 2, min_hours: 0, evening: 0, late_night: 0 },
  evening_from: "19:00", late_to: "07:00", loadings: "add", evening_dollars: 0, late_night_dollars: 0,
  weekly_overtime: 38, daily_overtime: null, overtime_first_hours: 2, casual_overtime: true,
};

/**
 * Fast Food Industry Award 2020 (MA000003): cl. 21 Table 6 penalties (Sunday at the Level 1 rate), cl. 20.6 Table 5
 * overtime, cl. 11.3 / 10.2 minimum engagement (3 hours), cl. 20.2 / 20.4 overtime after 38 a week or 11 in a day.
 * Mon–Fri 10pm–midnight and midnight–6am are paid at their own rate (110% / 115%, casuals 135% / 140%).
 */
export const FAST_FOOD_RULES: AwardRules = {
  casual: { weekday: 1.25, saturday: 1.5, sunday: 1.5, public_holiday: 2.5, overtime_150: 1.75, overtime_200: 2.25, min_hours: 3, evening: 1.35, late_night: 1.4 },
  part_time: { weekday: 1, saturday: 1.25, sunday: 1.25, public_holiday: 2.25, overtime_150: 1.5, overtime_200: 2, min_hours: 3, evening: 1.1, late_night: 1.15 },
  full_time: { weekday: 1, saturday: 1.25, sunday: 1.25, public_holiday: 2.25, overtime_150: 1.5, overtime_200: 2, min_hours: 0, evening: 1.1, late_night: 1.15 },
  evening_from: "22:00", late_to: "06:00", loadings: "replace", evening_dollars: 0, late_night_dollars: 0,
  weekly_overtime: 38, daily_overtime: 11, overtime_first_hours: 2, casual_overtime: true,
};
export const RULE_PRESETS = { fast_food: { label: "Fast Food Industry Award (MA000003)", rules: FAST_FOOD_RULES }, hospitality: { label: "Hospitality Industry (General) Award (MA000009)", rules: DEFAULT_RULES } } as const;

export function readRules(raw: unknown): AwardRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AwardRules>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const nOrNull = (v: unknown, d: number | null) => (v === null ? null : typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  const t = (k: EmploymentType): TypeRules => {
    const x = (r[k] ?? {}) as Partial<TypeRules>, d = DEFAULT_RULES[k];
    return { weekday: num(x.weekday, d.weekday), saturday: num(x.saturday, d.saturday), sunday: num(x.sunday, d.sunday), public_holiday: num(x.public_holiday, d.public_holiday),
      overtime_150: num(x.overtime_150, d.overtime_150), overtime_200: num(x.overtime_200, d.overtime_200), min_hours: num(x.min_hours, d.min_hours),
      evening: num(x.evening, d.evening), late_night: num(x.late_night, d.late_night) };
  };
  const time = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    casual: t("casual"), part_time: t("part_time"), full_time: t("full_time"),
    evening_from: time(r.evening_from, DEFAULT_RULES.evening_from), late_to: time(r.late_to, DEFAULT_RULES.late_to),
    loadings: r.loadings === "replace" ? "replace" : "add",
    evening_dollars: num(r.evening_dollars, 0), late_night_dollars: num(r.late_night_dollars, 0),
    weekly_overtime: nOrNull(r.weekly_overtime, DEFAULT_RULES.weekly_overtime), daily_overtime: nOrNull(r.daily_overtime, DEFAULT_RULES.daily_overtime),
    overtime_first_hours: num(r.overtime_first_hours, DEFAULT_RULES.overtime_first_hours), casual_overtime: r.casual_overtime ?? DEFAULT_RULES.casual_overtime,
  };
}

/** A worked (or rostered) stretch in local wall-clock time, "YYYY-MM-DDTHH:MM". */
export interface Worked { start: string; finish: string; breakMinutes: number }

const empty = (): DayHours => ({ ordinary: 0, saturday: 0, sunday: 0, public_holiday: 0, overtime_150: 0, overtime_200: 0, evening: 0, late_night: 0 });
const MIN = 60_000;
const toMs = (local: string) => Date.parse(`${local}:00Z`);
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const BASE: Category[] = ["ordinary", "saturday", "sunday", "public_holiday"];

/** Monday of the week a date is in. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return dateOf(d.getTime() - back * 86_400_000);
}

/**
 * Hours by category for each day. `holidays` are YYYY-MM-DD dates. Hours go to the day they were worked
 * (a shift past midnight puts its later hours on the next day). Minutes are kept exact and rounded to 2 places at the end.
 */
export function awardHours(entries: Worked[], type: EmploymentType, holidays: Set<string>, rules: AwardRules = DEFAULT_RULES): Map<string, DayHours> {
  const tr = rules[type];
  const days = new Map<string, DayHours>(); // minutes while working, hours at the end
  const day = (d: string) => { let v = days.get(d); if (!v) days.set(d, (v = empty())); return v; };
  const ev = hm(rules.evening_from), late = hm(rules.late_to);
  // per entry: base minutes by (date, category), so a break and a minimum engagement apply to that shift only
  const shifts: { start: number; parts: { date: string; cat: Category; mins: number }[] }[] = [];

  for (const e of [...entries].sort((a, b) => a.start.localeCompare(b.start))) {
    const a = toMs(e.start), b = toMs(e.finish);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const parts: { date: string; cat: Category; mins: number }[] = [];
    // walk minute boundaries: midnight, the end of late night, the start of evening
    let t = a;
    while (t < b) {
      const date = dateOf(t), m = Math.round((t - toMs(`${date}T00:00`)) / MIN);
      const cuts = [late, ev, 1440].filter((c) => c > m);
      const next = Math.min(b, toMs(`${date}T00:00`) + Math.min(...cuts) * MIN);
      const mins = Math.round((next - t) / MIN);
      const dow = new Date(t).getUTCDay();
      let cat: Category = holidays.has(date) ? "public_holiday" : dow === 0 ? "sunday" : dow === 6 ? "saturday" : "ordinary";
      if (cat === "ordinary" && (m >= ev || m < late)) {
        const window: Category = m >= ev ? "evening" : "late_night";
        // paid at their own rate instead of ordinary, or as a loading on top
        if (rules.loadings === "replace") cat = window; else day(date)[window] += mins;
      }
      parts.push({ date, cat, mins });
      t = next;
    }
    // unpaid break comes off the biggest part of the shift
    let brk = Math.max(0, Math.round(e.breakMinutes));
    for (const p of [...parts].sort((x, y) => y.mins - x.mins)) { const take = Math.min(brk, p.mins); p.mins -= take; brk -= take; if (!brk) break; }
    // minimum engagement: short shifts are paid up to the minimum, at the rate the shift started on
    const paid = parts.reduce((s, p) => s + p.mins, 0);
    const minMins = Math.round(tr.min_hours * 60);
    if (paid > 0 && paid < minMins && parts.length) parts[0].mins += minMins - paid;
    shifts.push({ start: a, parts });
  }

  // overtime: daily (per shift) and weekly (Mon–Sun), only out of ordinary and Saturday hours
  const ot = type !== "casual" || rules.casual_overtime;
  const weekly = new Map<string, number>(), dayOt = new Map<string, number>();
  const convertible = (c: Category) => c === "ordinary" || c === "saturday" || c === "evening" || c === "late_night";
  for (const s of shifts) {
    let shiftMins = 0;
    for (const p of s.parts) {
      let normal = p.mins, over = 0;
      if (ot && convertible(p.cat)) {
        const wk = weekOf(p.date);
        const used = weekly.get(wk) ?? 0;
        const dailyLeft = rules.daily_overtime == null ? Infinity : Math.max(0, rules.daily_overtime * 60 - shiftMins);
        const weeklyLeft = rules.weekly_overtime == null ? Infinity : Math.max(0, rules.weekly_overtime * 60 - used);
        normal = Math.min(p.mins, dailyLeft, weeklyLeft);
        over = p.mins - normal;
        weekly.set(wk, used + normal);
        if (over > 0) {
          const firstLeft = Math.max(0, rules.overtime_first_hours * 60 - (dayOt.get(p.date) ?? 0));
          const first = Math.min(over, firstLeft);
          day(p.date).overtime_150 += first;
          day(p.date).overtime_200 += over - first;
          dayOt.set(p.date, (dayOt.get(p.date) ?? 0) + over);
        }
      } else if (ot) {
        // Sunday and public holiday hours count towards the week's hours, but stay at their own rate
        const wk = weekOf(p.date);
        weekly.set(wk, (weekly.get(wk) ?? 0) + p.mins);
      }
      day(p.date)[p.cat] += normal;
      shiftMins += p.mins;
    }
  }
  const out = new Map<string, DayHours>();
  for (const [d, v] of [...days].sort(([x], [y]) => x.localeCompare(y))) {
    const h = empty();
    for (const c of CATEGORIES) h[c] = Math.round((v[c] / 60) * 100) / 100;
    out.set(d, h);
  }
  return out;
}

/** Hours worked (loadings paid on top aren't hours). */
export const workedHours = (h: DayHours, rules?: Pick<AwardRules, "loadings">) =>
  BASE.reduce((s, c) => s + h[c], 0) + h.overtime_150 + h.overtime_200 + (rules?.loadings === "replace" ? h.evening + h.late_night : 0);

/** A flat hourly rate (an agreed rate, no penalties): every hour is ordinary. */
export function flatHours(entries: Worked[]): Map<string, DayHours> {
  const out = new Map<string, DayHours>();
  for (const e of entries) {
    const a = toMs(e.start), b = toMs(e.finish);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const d = dateOf(a), h = out.get(d) ?? empty();
    h.ordinary = Math.round((h.ordinary + Math.max(0, (b - a) / MIN - e.breakMinutes) / 60) * 100) / 100;
    out.set(d, h);
  }
  return out;
}

/** Estimated cost of these hours at a base (ordinary full-time) hourly rate. */
export function estimateCost(byDay: Map<string, DayHours>, type: EmploymentType, baseRate: number, rules: AwardRules = DEFAULT_RULES): number {
  const r = rules[type];
  let c = 0;
  for (const h of byDay.values()) {
    c += baseRate * (h.ordinary * r.weekday + h.saturday * r.saturday + h.sunday * r.sunday + h.public_holiday * r.public_holiday + h.overtime_150 * r.overtime_150 + h.overtime_200 * r.overtime_200);
    c += rules.loadings === "replace" ? baseRate * (h.evening * r.evening + h.late_night * r.late_night) : h.evening * rules.evening_dollars + h.late_night * rules.late_night_dollars;
  }
  return Math.round(c * 100) / 100;
}

/** Round a local "HH:MM" to the nearest step (minutes). */
export function roundTime(local: string, step: number): string {
  if (!step || step <= 1) return local;
  const ms = toMs(local);
  const r = Math.round(ms / (step * MIN)) * step * MIN;
  return new Date(r).toISOString().slice(0, 16);
}
