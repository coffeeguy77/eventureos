import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lossByCoffee, lossFor, stockByCoffee, type Move } from "./core";

export interface Coffee {
  id: string; name: string; origin: string | null; supplier: string | null; process: string | null;
  batch_kg: number; reorder_kg: number | null; notes: string | null; archived: boolean;
}
export interface Roast {
  id: string; coffee_id: string | null; roasted_at: string; green_kg: number; roasted_kg: number | null; loss_pct: number | null;
  profile: string | null; charge_c: number | null; turning_point_s: number | null; first_crack_s: number | null; first_crack_c: number | null;
  end_s: number | null; drop_c: number | null; dtr_pct: number | null; score: number | null; notes: string | null;
  source: "manual" | "recorder" | "weighed_list"; recorder_name: string | null; has_curve: boolean;
}
export interface CoffeeSummary extends Coffee {
  onHand: number; value: number | null; avgCost: number | null;
  loss: { pct: number; n: number; own: boolean } | null;
  roasts: number; lastRoast: string | null; low: boolean;
  avg: { dtr: number | null; fc: number | null; drop: number | null; score: number | null };
  best: Roast | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** Everything the Roastery pages need for one business. Throws a plain message if the tables aren't there yet. */
export async function loadRoastery(supabase: SupabaseClient, orgId: string) {
  const [c, m, r] = await Promise.all([
    supabase.from("roastery_coffees").select("id, name, origin, supplier, process, batch_kg, reorder_kg, notes, archived").eq("organisation_id", orgId).order("name"),
    supabase.from("roastery_stock_moves").select("coffee_id, kind, kg, cost_per_kg").eq("organisation_id", orgId).limit(20000),
    supabase.from("roastery_roasts").select("id, coffee_id, roasted_at, green_kg, roasted_kg, loss_pct, profile, charge_c, turning_point_s, first_crack_s, first_crack_c, end_s, drop_c, dtr_pct, score, notes, source, recorder_name, has_curve").eq("organisation_id", orgId).order("roasted_at", { ascending: false }).limit(5000),
  ]);
  for (const x of [c, m, r]) if (x.error) throw new Error(x.error.message);
  const coffees = (c.data ?? []).map((x) => ({ ...x, batch_kg: Number(x.batch_kg), reorder_kg: num(x.reorder_kg) })) as Coffee[];
  const moves = (m.data ?? []).map((x) => ({ ...x, kg: Number(x.kg), cost_per_kg: num(x.cost_per_kg) })) as Move[];
  const roasts = (r.data ?? []).map((x) => ({ ...x, green_kg: Number(x.green_kg), roasted_kg: num(x.roasted_kg), loss_pct: num(x.loss_pct), charge_c: num(x.charge_c), first_crack_c: num(x.first_crack_c), drop_c: num(x.drop_c), dtr_pct: num(x.dtr_pct), score: num(x.score) })) as Roast[];
  const stock = stockByCoffee(moves);
  const loss = lossByCoffee(roasts);
  const summaries: CoffeeSummary[] = coffees.map((cf) => {
    const s = stock.get(cf.id), mine = roasts.filter((x) => x.coffee_id === cf.id);
    const scored = mine.filter((x) => x.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const onHand = s?.onHand ?? 0;
    return {
      ...cf, onHand, value: s?.value ?? null, avgCost: s?.avgCost ?? null, loss: lossFor(cf.id, loss),
      roasts: mine.length, lastRoast: mine[0]?.roasted_at ?? null, low: cf.reorder_kg != null && onHand <= cf.reorder_kg,
      avg: { dtr: avg(mine.map((x) => x.dtr_pct)), fc: avg(mine.map((x) => x.first_crack_s)), drop: avg(mine.map((x) => x.drop_c)), score: avg(mine.map((x) => x.score)) },
      best: scored[0] ?? null,
    };
  });
  return { coffees: summaries, roasts, loss };
}

export const tablesMissing = (e: unknown) => /roastery_/.test(String(e instanceof Error ? e.message : e)) && /does not exist|could not find|schema cache/i.test(String(e instanceof Error ? e.message : e));
