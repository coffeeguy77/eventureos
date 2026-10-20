/**
 * Saving ingredients and recipes — shared by the office Kitchen page and the chef's staff app.
 * The caller checks who's allowed; every write here is scoped to the organisation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export interface IngredientInput {
  id?: string | null; name: string; unit: string; pack_size: number | null; pack_label: string | null; supplier: string | null; station: string | null; notes: string | null;
  /** Labels (after the 0062 update): nutrition per 100 g, where it came from, weight of one each/slice/piece, allergens */
  nutrition?: Record<string, number> | null; nutrition_source?: string | null; grams_each?: number | null; allergens?: string[] | null;
}

const NUTRITION_COLS = /nutrition|grams_each|allergens/;

/** Ingredients with their nutrition and allergens (or without them, before the 0062 update). */
export async function loadIngredients(db: SupabaseClient, orgId: string) {
  const base = "id, name, unit, pack_size, pack_label, supplier, station, notes, active";
  type Res = { data: unknown[] | null; error: { message: string } | null };
  let r = (await db.from("catering_ingredients").select(`${base}, nutrition, nutrition_source, grams_each, allergens`).eq("organisation_id", orgId).order("name")) as unknown as Res;
  const labels = !(r.error && NUTRITION_COLS.test(r.error.message));
  if (!labels) r = (await db.from("catering_ingredients").select(base).eq("organisation_id", orgId).order("name")) as unknown as Res;
  return { error: r.error, labels, rows: ((r.data ?? []) as Record<string, unknown>[]).map((i) => ({
    ...i, pack_size: i.pack_size == null ? null : Number(i.pack_size), grams_each: i.grams_each == null ? null : Number(i.grams_each),
    allergens: (i.allergens as string[] | null) ?? [], nutrition: (i.nutrition as Record<string, number> | null) ?? null, nutrition_source: (i.nutrition_source as string | null) ?? null,
  })) as { id: string; name: string; unit: string; pack_size: number | null; pack_label: string | null; supplier: string | null; station: string | null; notes: string | null; active: boolean; nutrition: Record<string, number> | null; nutrition_source: string | null; grams_each: number | null; allergens: string[] }[] };
}
export interface RecipeInput { ingredient_id: string; qty_per_serve: number; prep_note: string | null }

export async function storeIngredient(db: SupabaseClient, orgId: string, i: IngredientInput): Promise<string> {
  const name = txt(i.name, 120);
  if (!name) throw new Error("Give the ingredient a name.");
  const row = {
    name, unit: txt(i.unit, 20) ?? "each", pack_size: i.pack_size && i.pack_size > 0 ? Math.round(i.pack_size * 1000) / 1000 : null,
    pack_label: txt(i.pack_label, 60), supplier: txt(i.supplier, 120), station: txt(i.station, 60), notes: txt(i.notes, 500),
  };
  const { readPer100, ALLERGENS } = await import("./nutrition");
  const extra: Record<string, unknown> = {};
  if (i.nutrition !== undefined) extra.nutrition = i.nutrition ? readPer100(i.nutrition) : null;
  if (i.nutrition_source !== undefined) extra.nutrition_source = txt(i.nutrition_source, 200);
  if (i.grams_each !== undefined) extra.grams_each = i.grams_each && Number(i.grams_each) > 0 ? Math.round(Number(i.grams_each) * 100) / 100 : null;
  if (i.allergens !== undefined) extra.allergens = (i.allergens ?? []).filter((a) => (ALLERGENS as readonly string[]).includes(a));
  const save = (r: Record<string, unknown>) => i.id && UUID.test(i.id)
    ? db.from("catering_ingredients").update(r).eq("id", i.id).eq("organisation_id", orgId).select("id").single()
    : db.from("catering_ingredients").insert({ organisation_id: orgId, ...r }).select("id").single();
  let { data, error } = await save({ ...row, ...extra });
  // Before the 0062 update: save the rest without the label details
  if (error && Object.keys(extra).length && NUTRITION_COLS.test(error.message)) ({ data, error } = await save(row));
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There's already an ingredient with that name." : error.message);
  return data!.id as string;
}

export async function storeIngredientActive(db: SupabaseClient, orgId: string, id: string, active: boolean): Promise<string> {
  if (!UUID.test(id)) throw new Error("Not found");
  const { error } = await db.from("catering_ingredients").update({ active }).eq("id", id).eq("organisation_id", orgId);
  if (error) throw new Error(error.message);
  return active ? "Back in use." : "Hidden from new recipes.";
}

/** Replace a menu item's recipe in one go. */
export async function storeRecipe(db: SupabaseClient, orgId: string, serviceId: string, lines: RecipeInput[]): Promise<string> {
  if (!UUID.test(serviceId)) throw new Error("Choose a menu item.");
  const { data: svc } = await db.from("services").select("id").eq("id", serviceId).eq("organisation_id", orgId).maybeSingle();
  if (!svc) throw new Error("That menu item isn't in your price list.");
  const clean = (Array.isArray(lines) ? lines : []).filter((l) => UUID.test(l.ingredient_id) && Number(l.qty_per_serve) > 0);
  if (new Set(clean.map((l) => l.ingredient_id)).size !== clean.length) throw new Error("An ingredient is in the recipe twice.");
  if (clean.length) {
    const { data: ok } = await db.from("catering_ingredients").select("id").eq("organisation_id", orgId).in("id", clean.map((l) => l.ingredient_id));
    if ((ok ?? []).length !== clean.length) throw new Error("An ingredient isn't on your list.");
  }
  const { error: dErr } = await db.from("catering_recipe_lines").delete().eq("organisation_id", orgId).eq("service_id", serviceId);
  if (dErr) throw new Error(dErr.message);
  if (clean.length) {
    const { error } = await db.from("catering_recipe_lines").insert(clean.map((l) => ({
      organisation_id: orgId, service_id: serviceId, ingredient_id: l.ingredient_id, qty_per_serve: Math.round(Number(l.qty_per_serve) * 10000) / 10000, prep_note: txt(l.prep_note, 200),
    })));
    if (error) throw new Error(error.message);
  }
  return "Recipe saved.";
}
