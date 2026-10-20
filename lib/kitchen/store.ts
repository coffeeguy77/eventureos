/**
 * Saving ingredients and recipes — shared by the office Kitchen page and the chef's staff app.
 * The caller checks who's allowed; every write here is scoped to the organisation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export interface IngredientInput { id?: string | null; name: string; unit: string; pack_size: number | null; pack_label: string | null; supplier: string | null; station: string | null; notes: string | null }
export interface RecipeInput { ingredient_id: string; qty_per_serve: number; prep_note: string | null }

export async function storeIngredient(db: SupabaseClient, orgId: string, i: IngredientInput): Promise<string> {
  const name = txt(i.name, 120);
  if (!name) throw new Error("Give the ingredient a name.");
  const row = {
    name, unit: txt(i.unit, 20) ?? "each", pack_size: i.pack_size && i.pack_size > 0 ? Math.round(i.pack_size * 1000) / 1000 : null,
    pack_label: txt(i.pack_label, 60), supplier: txt(i.supplier, 120), station: txt(i.station, 60), notes: txt(i.notes, 500),
  };
  const q = i.id && UUID.test(i.id)
    ? db.from("catering_ingredients").update(row).eq("id", i.id).eq("organisation_id", orgId).select("id").single()
    : db.from("catering_ingredients").insert({ organisation_id: orgId, ...row }).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There's already an ingredient with that name." : error.message);
  return data.id as string;
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
