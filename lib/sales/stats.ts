/**
 * Headline sales figures for a listing, from the Square sales brought in (ex GST): per rolling year (the last 12 full
 * months, the 12 before, …), coffees sold and coffee revenue (the categories the seller picks), orders, average sale,
 * best day, category split, best sellers and the monthly series. Pure maths here; the queries are in stats-server.ts.
 */
export interface StatItemRow { month: string; item: string; category: string; qty: number; sales: number }
export interface StatDayRow { day: string; category: string; sales: number; orders: number }

export interface YearStats {
  label: string; from: string; to: string; complete: boolean;
  sales: number; orders: number; avgSale: number | null; perDay: number | null; tradingDays: number;
  coffees: number; coffeeSales: number; coffeesPerDay: number | null;
  categories: { category: string; sales: number }[];
  bestSellers: { item: string; qty: number; sales: number }[];
  weekdays: { label: string; avg: number }[];
  bestDay: { label: string; avg: number } | null;
}
export interface SaleStats { years: YearStats[]; months: { month: string; sales: number; coffees: number }[]; firstMonth: string | null }

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Month starts (YYYY-MM-01): the `n` full months before the month of `today`, oldest first. */
export function fullMonths(today: string, n: number): string[] {
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { m -= 1; if (m === 0) { m = 12; y -= 1; } out.unshift(`${y}-${String(m).padStart(2, "0")}-01`); }
  return out;
}
const monYear = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

export function isCoffee(category: string, chosen: string[]): boolean {
  const c = category.trim().toLowerCase();
  return chosen.some((x) => x.trim().toLowerCase() === c);
}

/** A starting suggestion for "which categories are coffee" — shown to the seller to confirm, never applied silently. */
export function suggestCoffeeCategories(categories: string[]): string[] {
  return categories.filter((c) => /coffee|espresso|hot bev|hot drink|\b\d\s?oz\b|latte|cappuc/i.test(c) && !/bag|bean|retail|stock/i.test(c));
}

export function saleStats(o: { today: string; years: number; days: StatDayRow[]; items: StatItemRow[]; coffeeCategories: string[] }): SaleStats {
  const months = fullMonths(o.today, o.years * 12);
  const firstWithSales = o.days.filter((d) => d.category === "" && Number(d.orders) > 0).reduce<string | null>((m, d) => (!m || d.day < m ? d.day : m), null);
  const firstMonth = firstWithSales ? `${firstWithSales.slice(0, 7)}-01` : null;
  const byMonth = new Map(months.map((m) => [m, { month: m, sales: 0, coffees: 0 }]));
  for (const d of o.days) if (d.category === "") { const v = byMonth.get(`${d.day.slice(0, 7)}-01`); if (v) v.sales += Number(d.sales); }
  for (const i of o.items) if (isCoffee(i.category, o.coffeeCategories)) { const v = byMonth.get(i.month.slice(0, 10)); if (v) v.coffees += Number(i.qty); }
  const years: YearStats[] = [];
  for (let y = 0; y < o.years; y++) {
    const ms = months.slice(months.length - 12 * (y + 1), months.length - 12 * y);
    if (!ms.length) break;
    const from = ms[0], to = monthEnd(ms[ms.length - 1]);
    if (firstMonth && to < firstMonth) break; // no sales brought in for this year at all
    const days = o.days.filter((d) => d.category === "" && d.day >= from && d.day <= to);
    const items = o.items.filter((i) => i.month >= from && i.month <= to);
    const sales = days.reduce((t, d) => t + Number(d.sales), 0), orders = days.reduce((t, d) => t + Number(d.orders), 0);
    const perDayTotal = new Map<string, number>();
    for (const d of days) if (Number(d.orders) > 0) perDayTotal.set(d.day, (perDayTotal.get(d.day) ?? 0) + Number(d.sales));
    const tradingDays = perDayTotal.size;
    const wd = WD.map((label) => ({ label, total: 0, n: 0 }));
    for (const [d, v] of perDayTotal) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); wd[w].total += v; wd[w].n += 1; }
    const weekdays = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: wd[i].label, avg: wd[i].n ? r2(wd[i].total / wd[i].n) : 0 }));
    const best = weekdays.reduce<{ label: string; avg: number } | null>((b, w) => (w.avg > (b?.avg ?? 0) ? w : b), null);
    const cat = new Map<string, number>(), top = new Map<string, { item: string; qty: number; sales: number }>();
    let coffees = 0, coffeeSales = 0;
    for (const i of items) {
      cat.set(i.category || "Uncategorised", (cat.get(i.category || "Uncategorised") ?? 0) + Number(i.sales));
      const t = top.get(i.item) ?? { item: i.item, qty: 0, sales: 0 }; t.qty += Number(i.qty); t.sales += Number(i.sales); top.set(i.item, t);
      if (isCoffee(i.category, o.coffeeCategories)) { coffees += Number(i.qty); coffeeSales += Number(i.sales); }
    }
    years.push({
      label: y === 0 ? "Last 12 months" : `${monYear(from)} – ${monYear(to)}`, from, to,
      complete: !firstMonth || firstMonth <= from,
      sales: r2(sales), orders, avgSale: orders ? r2(sales / orders) : null, perDay: tradingDays ? r2(sales / tradingDays) : null, tradingDays,
      coffees: Math.round(coffees), coffeeSales: r2(coffeeSales), coffeesPerDay: tradingDays ? Math.round(coffees / tradingDays) : null,
      categories: [...cat.entries()].map(([category, v]) => ({ category, sales: r2(v) })).sort((a, b) => b.sales - a.sales),
      bestSellers: [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 10).map((t) => ({ ...t, qty: Math.round(t.qty), sales: r2(t.sales) })),
      weekdays, bestDay: best,
    });
  }
  return { years, months: [...byMonth.values()].map((m) => ({ ...m, sales: Math.round(m.sales), coffees: Math.round(m.coffees) })), firstMonth };
}

/** Sales of the given categories over the last 12 full months (backs up a term of sale, e.g. coffee bag sales). */
export function categoryTotal(items: StatItemRow[], categories: string[], today: string): { sales: number; qty: number } {
  const ms = fullMonths(today, 12), from = ms[0], to = ms[ms.length - 1];
  let sales = 0, qty = 0;
  for (const i of items) if (i.month >= from && i.month <= to && isCoffee(i.category, categories)) { sales += Number(i.sales); qty += Number(i.qty); }
  return { sales: r2(sales), qty: Math.round(qty) };
}
