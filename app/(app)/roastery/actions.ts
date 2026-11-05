"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { cleanCurve, type ImportRoast } from "@/lib/roastery/core";

/** Roastery (back end): green coffees, stock in and out, roast log and the roast recorder import. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  return { ok: false, error: /roastery_|has_curve|"curve"/.test(m) && /does not exist|could not find|schema cache/i.test(m) ? "Roastery needs its database updates first: run supabase/migrations/0098_roastery.sql and 0099_roastery_curves.sql in Supabase." : m };
};
const UUID = /^[0-9a-f-]{36}$/i;
const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
const kgNum = (v: unknown, what: string, { min = 0, max = 100000, allowZero = false } = {}) => {
  const x = Math.round(Number(v) * 1000) / 1000;
  if (!Number.isFinite(x) || x < min || x > max || (!allowZero && x === 0)) throw new Error(`${what} doesn't look right.`);
  return x;
};
const optNum = (v: unknown, what: string, min: number, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  if (!Number.isFinite(x) || x < min || x > max) throw new Error(`${what} doesn't look right.`);
  return x;
};
const when = (v: unknown) => {
  if (typeof v !== "string" || !v) return new Date().toISOString();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("That date doesn't look right.");
  return d.toISOString();
};

async function roastery() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Roastery.");
  return ctx;
}
const done = (coffeeId?: string | null) => {
  revalidatePath("/roastery"); revalidatePath("/roastery/roasts"); revalidatePath("/roastery/planner");
  if (coffeeId) revalidatePath(`/roastery/coffees/${coffeeId}`);
};

async function coffeeName(supabase: Awaited<ReturnType<typeof roastery>>["supabase"], orgId: string, id: string) {
  const { data, error } = await supabase.from("roastery_coffees").select("name").eq("organisation_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That coffee wasn't found.");
  return data.name as string;
}

export interface CoffeeInput { id?: string; name: string; origin?: string | null; supplier?: string | null; process?: string | null; batch_kg: number | string; reorder_kg?: number | string | null; notes?: string | null; archived?: boolean }

export async function saveCoffee(i: CoffeeInput): Promise<R<{ id: string }>> {
  try {
    const { supabase, org, user, profile } = await roastery();
    const name = t(i.name, 80);
    if (!name) throw new Error("Give the coffee a name.");
    const row = {
      name, origin: t(i.origin, 120), supplier: t(i.supplier, 120), process: t(i.process, 60), notes: t(i.notes, 2000),
      batch_kg: kgNum(i.batch_kg, "Batch size", { min: 0.1, max: 500 }), reorder_kg: optNum(i.reorder_kg, "Reorder level", 0, 100000),
      archived: !!i.archived, updated_at: new Date().toISOString(),
    };
    let id = i.id;
    if (id) {
      if (!UUID.test(id)) throw new Error("That coffee wasn't found.");
      const { error } = await supabase.from("roastery_coffees").update(row).eq("organisation_id", org.id).eq("id", id);
      if (error) throw new Error(/duplicate/.test(error.message) ? `You already have a coffee called ${name}.` : error.message);
    } else {
      const { data, error } = await supabase.from("roastery_coffees").insert({ ...row, organisation_id: org.id }).select("id").single();
      if (error) throw new Error(/duplicate/.test(error.message) ? `You already have a coffee called ${name}.` : error.message);
      id = data.id as string;
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: i.id ? "roastery.coffee_updated" : "roastery.coffee_added", entityType: "roastery_coffee", entityId: id, summary: `${actorName(profile)} ${i.id ? "updated" : "added"} green coffee ${name}` });
    done(id);
    return { ok: true, data: { id: id! } };
  } catch (e) { return fail(e); }
}

export interface StockInput { coffee_id: string; mode: "received" | "count" | "adjust"; kg: number | string; cost_per_kg?: number | string | null; note?: string | null; happened_at?: string | null }

/** Green coffee in (with its cost), a stock-take count (sets on hand), or a plus/minus correction. */
export async function moveStock(i: StockInput): Promise<R> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!UUID.test(i.coffee_id)) throw new Error("Choose a coffee.");
    const name = await coffeeName(supabase, org.id, i.coffee_id);
    const at = when(i.happened_at);
    let kg: number, kind: "received" | "adjusted", cost: number | null = null, summary: string;
    if (i.mode === "received") {
      kg = kgNum(i.kg, "Kilos received", { min: 0.001 });
      cost = optNum(i.cost_per_kg, "Cost per kg", 0, 10000);
      kind = "received";
      summary = `${actorName(profile)} received ${kg} kg of ${name} green${cost != null ? ` at $${cost.toFixed(2)}/kg` : ""}`;
    } else if (i.mode === "count") {
      const counted = kgNum(i.kg, "Counted kilos", { min: 0, allowZero: true });
      const { data, error } = await supabase.from("roastery_stock_moves").select("kg").eq("organisation_id", org.id).eq("coffee_id", i.coffee_id);
      if (error) throw new Error(error.message);
      const onHand = (data ?? []).reduce((a, x) => a + Number(x.kg), 0);
      kg = Math.round((counted - onHand) * 1000) / 1000;
      if (kg === 0) { return { ok: true, data: undefined }; }
      kind = "adjusted";
      summary = `${actorName(profile)} counted ${counted} kg of ${name} green (system said ${onHand.toFixed(2)} kg, ${kg > 0 ? "+" : ""}${kg} kg)`;
    } else {
      kg = kgNum(i.kg, "Adjustment", { min: -100000 });
      kind = "adjusted";
      summary = `${actorName(profile)} adjusted ${name} green stock by ${kg > 0 ? "+" : ""}${kg} kg`;
    }
    const note = t(i.note, 500) ?? (i.mode === "count" ? "Stock-take" : null);
    const { error } = await supabase.from("roastery_stock_moves").insert({ organisation_id: org.id, coffee_id: i.coffee_id, kind, kg, cost_per_kg: cost, note, happened_at: at });
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `roastery.stock_${kind}`, entityType: "roastery_coffee", entityId: i.coffee_id, summary });
    done(i.coffee_id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export interface RoastInput {
  coffee_id: string; green_kg: number | string; roasted_kg?: number | string | null; roasted_at?: string | null; profile?: string | null;
  first_crack_s?: number | string | null; end_s?: number | string | null; drop_c?: number | string | null; dtr_pct?: number | string | null;
  score?: number | string | null; notes?: string | null; deduct: boolean;
}

export async function logRoast(i: RoastInput): Promise<R<{ id: string }>> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!UUID.test(i.coffee_id)) throw new Error("Choose a coffee.");
    const name = await coffeeName(supabase, org.id, i.coffee_id);
    const green = kgNum(i.green_kg, "Green kilos", { min: 0.01, max: 500 });
    const roasted = optNum(i.roasted_kg, "Roasted kilos", 0.01, green);
    const at = when(i.roasted_at);
    const { data, error } = await supabase.from("roastery_roasts").insert({
      organisation_id: org.id, coffee_id: i.coffee_id, roasted_at: at, green_kg: green, roasted_kg: roasted, profile: t(i.profile, 120),
      first_crack_s: optNum(i.first_crack_s, "First crack time", 0, 3600), end_s: optNum(i.end_s, "Roast time", 0, 3600),
      drop_c: optNum(i.drop_c, "Drop temperature", 100, 300), dtr_pct: optNum(i.dtr_pct, "DTR", 0, 60), score: optNum(i.score, "Cup score", 0, 100),
      notes: t(i.notes, 2000), source: "manual",
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (i.deduct) {
      const { error: e2 } = await supabase.from("roastery_stock_moves").insert({ organisation_id: org.id, coffee_id: i.coffee_id, kind: "roasted", kg: -green, roast_id: data.id, happened_at: at });
      if (e2) { await supabase.from("roastery_roasts").delete().eq("id", data.id); throw new Error(e2.message); }
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roastery.roasted", entityType: "roastery_roast", entityId: data.id, summary: `${actorName(profile)} logged a roast: ${green} kg ${name}${roasted ? ` → ${roasted} kg` : ""}${i.deduct ? " (taken off green stock)" : ""}` });
    done(i.coffee_id);
    return { ok: true, data: { id: data.id as string } };
  } catch (e) { return fail(e); }
}

/** Several batches of one coffee weighed after roasting, e.g. "25.8, 25.95, 25.95". Kept for yield; stock optional. */
export async function addWeighedBatches(i: { coffee_id: string; green_kg: number | string; roasted: string; roasted_at?: string | null; deduct: boolean }): Promise<R<{ n: number }>> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!UUID.test(i.coffee_id)) throw new Error("Choose a coffee.");
    const name = await coffeeName(supabase, org.id, i.coffee_id);
    const green = kgNum(i.green_kg, "Green kilos per batch", { min: 0.01, max: 500 });
    const list = String(i.roasted ?? "").split(/[\s,;]+/).filter(Boolean).map((x) => kgNum(x, `Roasted weight "${x}"`, { min: 0.01, max: green }));
    if (!list.length) throw new Error("Enter at least one roasted weight.");
    if (list.length > 100) throw new Error("Add at most 100 batches at a time.");
    const at = when(i.roasted_at);
    const { data, error } = await supabase.from("roastery_roasts").insert(list.map((r) => ({ organisation_id: org.id, coffee_id: i.coffee_id, roasted_at: at, green_kg: green, roasted_kg: r, source: "weighed_list" }))).select("id");
    if (error) throw new Error(error.message);
    if (i.deduct) {
      const { error: e2 } = await supabase.from("roastery_stock_moves").insert((data ?? []).map((x) => ({ organisation_id: org.id, coffee_id: i.coffee_id, kind: "roasted", kg: -green, roast_id: x.id, happened_at: at })));
      if (e2) throw new Error(e2.message);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roastery.weighed", entityType: "roastery_coffee", entityId: i.coffee_id, summary: `${actorName(profile)} added ${list.length} weighed ${name} batch${list.length > 1 ? "es" : ""} (${green} kg green each: ${list.join(", ")} kg roasted)` });
    done(i.coffee_id);
    return { ok: true, data: { n: list.length } };
  } catch (e) { return fail(e); }
}

/** Roasted weight, cup score and notes added after the roast. */
export async function updateRoast(i: { id: string; roasted_kg?: number | string | null; score?: number | string | null; notes?: string | null }): Promise<R> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!UUID.test(i.id)) throw new Error("That roast wasn't found.");
    const { data: r, error: e1 } = await supabase.from("roastery_roasts").select("green_kg, coffee_id, roasted_kg, score").eq("organisation_id", org.id).eq("id", i.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!r) throw new Error("That roast wasn't found.");
    const roasted = optNum(i.roasted_kg, "Roasted kilos", 0.01, Number(r.green_kg));
    const score = optNum(i.score, "Cup score", 0, 100);
    const { error } = await supabase.from("roastery_roasts").update({ roasted_kg: roasted, score, notes: t(i.notes, 2000) }).eq("organisation_id", org.id).eq("id", i.id);
    if (error) throw new Error(error.message);
    const changes: Record<string, [unknown, unknown]> = {};
    if (Number(r.roasted_kg ?? NaN) !== (roasted ?? NaN)) changes.roasted_kg = [r.roasted_kg, roasted];
    if (Number(r.score ?? NaN) !== (score ?? NaN)) changes.score = [r.score, score];
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roastery.roast_updated", entityType: "roastery_roast", entityId: i.id, summary: `${actorName(profile)} updated a roast${roasted ? ` (roasted ${roasted} kg from ${r.green_kg} kg)` : ""}${score != null ? `, cup score ${score}` : ""}`, changes });
    done(r.coffee_id as string | null);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Remove a roast; if it was taken off green stock, the stock goes back with it. */
export async function deleteRoast(id: string): Promise<R> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!UUID.test(id)) throw new Error("That roast wasn't found.");
    const { data: r } = await supabase.from("roastery_roasts").select("green_kg, coffee_id, roasted_at").eq("organisation_id", org.id).eq("id", id).maybeSingle();
    if (!r) throw new Error("That roast wasn't found.");
    const { error } = await supabase.from("roastery_roasts").delete().eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roastery.roast_deleted", entityType: "roastery_roast", entityId: id, summary: `${actorName(profile)} deleted a ${r.green_kg} kg roast from ${String(r.roasted_at).slice(0, 10)}` });
    done(r.coffee_id as string | null);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/**
 * Import roasts parsed in the browser from the W45A roast recorder (index.csv + each roast's CSV) or an import bundle.
 * Each roast is added once, by its recorder file name; importing again only adds a curve a roast didn't have yet.
 * Coffees that don't exist are added. With `deduct` (and unless the roast says otherwise) the green comes off stock.
 */
export async function importRoasts(list: ImportRoast[], deduct: boolean): Promise<R<{ added: number; curves: number; already: number; newCoffees: string[] }>> {
  try {
    const { supabase, org, user, profile } = await roastery();
    if (!Array.isArray(list) || !list.length) throw new Error("Nothing to import.");
    if (list.length > 50) throw new Error("Import at most 50 roasts at a time.");
    const rows = list.map((r) => {
      const name = t(r?.name, 200), coffee = t(r?.coffee, 80), batch = Number(r?.batch_kg);
      if (!name || !coffee) throw new Error("Each roast needs a name and a coffee.");
      if (!Number.isFinite(batch) || batch <= 0 || batch > 500) throw new Error(`${name}: the batch weight doesn't look right.`);
      const charge = new Date(String(r.charge));
      const num = (v: unknown, lo: number, hi: number) => { const x = Number(v); return v == null || v === "" || !Number.isFinite(x) || x < lo || x > hi ? null : x; };
      const roasted = num(r.roasted_kg, 0.01, batch);
      return {
        name, coffee, batch, at: Number.isNaN(charge.getTime()) ? new Date().toISOString() : charge.toISOString(), roasted,
        profile: t(r.profile, 120), charge_c: num(r.charge_bean_c, 0, 400), tp: num(r.turning_point_s, 0, 3600), fc: num(r.first_crack_s, 0, 3600),
        fc_c: num(r.first_crack_bean_c, 0, 400), end: num(r.end_s, 0, 3600), drop: num(r.drop_bean_c, 0, 400), dtr: num(r.dtr_pct, 0, 60),
        score: num(r.score, 0, 100), notes: t(r.notes, 2000), curve: cleanCurve(r.curve), deduct: deduct && r.deduct !== false,
      };
    });
    const { data: existing, error: e0 } = await supabase.from("roastery_coffees").select("id, name").eq("organisation_id", org.id);
    if (e0) throw new Error(e0.message);
    const byName = new Map((existing ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));
    const newCoffees: string[] = [];
    for (const r of rows) {
      const k = r.coffee.toLowerCase();
      if (byName.has(k)) continue;
      const { data, error } = await supabase.from("roastery_coffees").insert({ organisation_id: org.id, name: r.coffee, batch_kg: r.batch }).select("id").single();
      if (error) throw new Error(error.message);
      byName.set(k, data.id as string); newCoffees.push(r.coffee);
    }
    const { data: have, error: e1 } = await supabase.from("roastery_roasts").select("id, recorder_name, has_curve").eq("organisation_id", org.id).in("recorder_name", rows.map((r) => r.name));
    if (e1) throw new Error(e1.message);
    const seen = new Map((have ?? []).map((x) => [x.recorder_name as string, x as { id: string; has_curve: boolean }]));
    let added = 0, curves = 0, already = 0;
    for (const r of rows) {
      const old = seen.get(r.name);
      if (old) {
        already++;
        if (!old.has_curve && r.curve) {
          const { error } = await supabase.from("roastery_roasts").update({ curve: r.curve }).eq("organisation_id", org.id).eq("id", old.id);
          if (error) throw new Error(error.message);
          curves++;
        }
        continue;
      }
      const coffeeId = byName.get(r.coffee.toLowerCase())!;
      const { data, error } = await supabase.from("roastery_roasts").insert({
        organisation_id: org.id, coffee_id: coffeeId, roasted_at: r.at, green_kg: r.batch, roasted_kg: r.roasted, profile: r.profile,
        charge_c: r.charge_c, turning_point_s: r.tp, first_crack_s: r.fc, first_crack_c: r.fc_c, end_s: r.end, drop_c: r.drop, dtr_pct: r.dtr,
        score: r.score, notes: r.notes, source: "recorder", recorder_name: r.name, curve: r.curve,
      }).select("id").single();
      if (error) { if (/duplicate/.test(error.message)) { already++; continue; } throw new Error(error.message); }
      if (r.deduct) {
        const { error: e2 } = await supabase.from("roastery_stock_moves").insert({ organisation_id: org.id, coffee_id: coffeeId, kind: "roasted", kg: -r.batch, roast_id: data.id, happened_at: r.at });
        if (e2) throw new Error(e2.message);
      }
      added++; if (r.curve) curves++;
    }
    if (added || curves) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roastery.imported", entityType: "roastery_roast", summary: `${actorName(profile)} imported ${added} roast${added === 1 ? "" : "s"}${curves ? ` (${curves} with roast graph${curves === 1 ? "" : "s"})` : ""}`, metadata: { added, curves, already, newCoffees } });
    done();
    return { ok: true, data: { added, curves, already, newCoffees } };
  } catch (e) { return fail(e); }
}
