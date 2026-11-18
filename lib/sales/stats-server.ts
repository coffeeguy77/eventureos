import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullMonths, saleStats, type SaleStats, type StatDayRow, type StatItemRow } from "./stats";

/** All rows of a query, 1000 at a time. */
async function all<T>(page: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 200; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function sydneyToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** The Square rows for a unit's locations over the last `years` full years (excluded categories left out). */
export async function loadStatRows(db: SupabaseClient, orgId: string, locs: string[], exclude: string[], years: number, today = sydneyToday()) {
  if (!locs.length) return { days: [] as StatDayRow[], items: [] as StatItemRow[], today };
  const ms = fullMonths(today, years * 12);
  const from = ms[0], to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const ex = new Set(exclude.map((c) => c.toLowerCase()));
  const [days, items] = await Promise.all([
    all<StatDayRow>((a, b) => db.rpc("sale_unit_data", { p_org: orgId, p_locs: locs, p_from: from, p_to: to, p_exclude: exclude }).range(a, b)),
    all<StatItemRow>((a, b) => db.from("sale_square_items").select("month, item, category, qty, sales").eq("organisation_id", orgId).in("location_id", locs).gte("month", from).lte("month", to).order("month").order("item").range(a, b)),
  ]);
  return { days, items: items.filter((i) => !ex.has((i.category ?? "").toLowerCase())), today };
}

export async function unitStats(db: SupabaseClient, orgId: string, unit: { square_location_ids: string[]; exclude_categories: string[] }, coffeeCategories: string[], years = 3): Promise<SaleStats & { items: StatItemRow[]; today: string }> {
  const { days, items, today } = await loadStatRows(db, orgId, unit.square_location_ids ?? [], unit.exclude_categories ?? [], years);
  return { ...saleStats({ today, years, days, items, coffeeCategories }), items, today };
}
