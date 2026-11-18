/**
 * Business Sales P&L (pure): a unit's monthly sales from Square, its standard crew's wages, and its expenses
 * (Xero suppliers' actual spend × share, or typed-in yearly amounts) → monthly profit for the chosen months.
 * Everything is ex GST. Wages include super.
 */
export interface StaffLine {
  role: string; headcount: number; pay_type: "annual" | "hourly";
  annual: number | null; hourly: number | null; hours_per_shift: number | null; shifts_per_week: number | null; weeks_per_year: number | null;
  super_pct: number | null;
}
export interface ExpenseLine { kind: "cogs" | "overhead"; source: "xero" | "manual"; xero_contact_id: string | null; name: string; share_pct: number; annual: number | null }
export interface DailyRow { location_id: string; day: string; category: string; sales: number; orders: number }
export interface SpendRow { contact_id: string; month: string; amount: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Wages for one crew line per year, before super. */
export function yearlyPay(s: StaffLine): number {
  const n = Math.max(0, Number(s.headcount) || 0);
  if (s.pay_type === "annual") return n * Math.max(0, Number(s.annual) || 0);
  const weeks = s.weeks_per_year == null ? 52 : Math.max(0, Number(s.weeks_per_year) || 0);
  return n * Math.max(0, Number(s.hourly) || 0) * Math.max(0, Number(s.hours_per_shift) || 0) * Math.max(0, Number(s.shifts_per_week) || 0) * weeks;
}
/** Wages + super for one crew line per year. */
export function yearlyCost(s: StaffLine, unitSuper: number): number {
  const sp = s.super_pct == null ? unitSuper : Number(s.super_pct) || 0;
  return r2(yearlyPay(s) * (1 + Math.max(0, sp) / 100));
}

/** The last `count` calendar months ending with the month of `today` (YYYY-MM-01, oldest first). */
export function monthList(today: string, count: number): string[] {
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}-01`);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export interface MonthPnl { month: string; sales: number; orders: number; cogs: number; wages: number; overheads: number; gross: number; profit: number; partial: boolean; /** before the period (or the first sale): nothing counted */ nodata?: boolean }
export interface UnitPnl {
  months: MonthPnl[];
  totals: { sales: number; orders: number; cogs: number; wages: number; overheads: number; gross: number; profit: number; margin: number | null; avgOrder: number | null };
  byLocation: { location_id: string; sales: number; orders: number }[];
  byCategory: { category: string; sales: number }[];
  byWeekday: { day: number; label: string; avg: number; days: number }[];
  expenseLines: { name: string; kind: "cogs" | "overhead"; source: "xero" | "manual"; total: number }[];
  crew: { role: string; yearly: number }[];
}

/** Share of month `m` (YYYY-MM-01) inside from..to (1 when no period is given). */
export function covered(m: string, from: string | undefined, to: string): number {
  if (!from) return 1;
  const [y, mo] = m.slice(0, 7).split("-").map(Number);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const start = from.slice(0, 7) === m.slice(0, 7) ? Number(from.slice(8, 10)) : from < m ? 1 : dim + 1;
  const end = to.slice(0, 7) === m.slice(0, 7) ? Number(to.slice(8, 10)) : to > m ? dim : 0;
  return Math.max(0, end - start + 1) / dim;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * @param months  the months to report (oldest first); the current month counts as partial
 * @param daily   Square rows for the unit's locations (category '' = whole orders; others split by category)
 * @param exclude categories to leave out (their sales come off the whole-order totals)
 */
export function unitPnl(o: {
  months: string[]; today: string; daily: DailyRow[]; exclude: string[]; staff: StaffLine[]; superPct: number; expenses: ExpenseLine[]; spend: SpendRow[];
  /** a rolling period (e.g. this day last year → today): sales outside it are left out and the first and last months are pro-rated */
  from?: string; to?: string;
}): UnitPnl {
  const first = o.months[0], last = o.months[o.months.length - 1].slice(0, 7);
  // monthly category rows are dated the 1st, so only whole-day rows are held to the exact from/to
  const inRange = (d: string, cat: string) => (cat === "" && o.from ? d >= o.from && d <= (o.to ?? o.today) : d.slice(0, 7) >= first.slice(0, 7) && d.slice(0, 7) <= last);
  const ex = new Set(o.exclude.map((c) => c.toLowerCase()));
  const curMonth = `${o.today.slice(0, 7)}-01`;
  const sales = new Map<string, number>(), orders = new Map<string, number>(), loc = new Map<string, { sales: number; orders: number }>();
  const cat = new Map<string, number>(), perDay = new Map<string, number>();
  for (const r of o.daily) {
    if (!inRange(r.day, r.category)) continue;
    const m = `${r.day.slice(0, 7)}-01`;
    if (r.category === "") {
      sales.set(m, (sales.get(m) ?? 0) + Number(r.sales));
      orders.set(m, (orders.get(m) ?? 0) + Number(r.orders));
      const l = loc.get(r.location_id) ?? { sales: 0, orders: 0 };
      l.sales += Number(r.sales); l.orders += Number(r.orders); loc.set(r.location_id, l);
      perDay.set(r.day, (perDay.get(r.day) ?? 0) + Number(r.sales));
    } else if (ex.has(r.category.toLowerCase())) {
      // an excluded category's sales come off that month, location and day
      sales.set(m, (sales.get(m) ?? 0) - Number(r.sales));
      const l = loc.get(r.location_id) ?? { sales: 0, orders: 0 };
      l.sales -= Number(r.sales); loc.set(r.location_id, l);
      perDay.set(r.day, (perDay.get(r.day) ?? 0) - Number(r.sales));
    } else cat.set(r.category, (cat.get(r.category) ?? 0) + Number(r.sales));
  }
  const crewYear = o.staff.reduce((t, s) => t + yearlyCost(s, o.superPct), 0);
  const spend = new Map<string, number>();
  for (const s of o.spend) spend.set(`${s.contact_id}|${s.month}`, (spend.get(`${s.contact_id}|${s.month}`) ?? 0) + Number(s.amount));
  const expTotals = o.expenses.map((e) => ({ name: e.name, kind: e.kind, source: e.source, total: 0 }));
  const months: MonthPnl[] = o.months.map((m) => {
    const f = covered(m, o.from, o.to ?? o.today);
    // the current month's Xero spend is already "so far"; an earlier month cut by the period is pro-rated
    const fSpend = m === curMonth ? 1 : f;
    let cogs = 0, overheads = 0;
    o.expenses.forEach((e, i) => {
      const share = Math.max(0, Number(e.share_pct) || 0) / 100;
      const v = e.source === "xero" ? (spend.get(`${e.xero_contact_id}|${m}`) ?? 0) * share * fSpend : ((Math.max(0, Number(e.annual) || 0) * share) / 12) * f;
      expTotals[i].total += v;
      if (e.kind === "cogs") cogs += v; else overheads += v;
    });
    const s = sales.get(m) ?? 0, wages = (crewYear / 12) * f;
    const gross = s - cogs;
    return { month: m, sales: r2(s), orders: orders.get(m) ?? 0, cogs: r2(cogs), wages: r2(wages), overheads: r2(overheads), gross: r2(gross), profit: r2(gross - wages - overheads), partial: m === curMonth || f < 1, nodata: f === 0 };
  });
  const sum = (k: keyof MonthPnl) => r2(months.reduce((t, x) => t + (Number(x[k]) || 0), 0));
  const totals = { sales: sum("sales"), orders: sum("orders"), cogs: sum("cogs"), wages: sum("wages"), overheads: sum("overheads"), gross: sum("gross"), profit: sum("profit"), margin: null as number | null, avgOrder: null as number | null };
  totals.margin = totals.sales > 0 ? Math.round((totals.profit / totals.sales) * 1000) / 10 : null;
  totals.avgOrder = totals.orders > 0 ? r2(totals.sales / totals.orders) : null;
  const wd = WEEKDAYS.map((label, day) => ({ day, label, total: 0, days: 0 }));
  for (const [d, v] of perDay) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); wd[w].total += v; wd[w].days += 1; }
  return {
    months, totals,
    byLocation: [...loc.entries()].map(([location_id, v]) => ({ location_id, sales: r2(v.sales), orders: v.orders })).sort((a, b) => b.sales - a.sales),
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, sales: r2(v) })).sort((a, b) => b.sales - a.sales),
    byWeekday: wd.map((w) => ({ day: w.day, label: w.label, avg: w.days ? r2(w.total / w.days) : 0, days: w.days })),
    expenseLines: expTotals.map((e) => ({ ...e, total: r2(e.total) })),
    crew: o.staff.map((s) => ({ role: s.role, yearly: yearlyCost(s, o.superPct) })),
  };
}
