"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager", "sales"].includes(ctx.role)) throw new Error("You don't have access to the kitchen.");
  return ctx;
}

export interface IngredientInput { id?: string | null; name: string; unit: string; pack_size: number | null; pack_label: string | null; supplier: string | null; station: string | null; notes: string | null }

export async function saveIngredient(i: IngredientInput): Promise<Result<string>> {
  return run(async () => {
    const { supabase, org } = await office();
    const name = txt(i.name, 120);
    if (!name) throw new Error("Give the ingredient a name.");
    const row = {
      name, unit: txt(i.unit, 20) ?? "each", pack_size: i.pack_size && i.pack_size > 0 ? Math.round(i.pack_size * 1000) / 1000 : null,
      pack_label: txt(i.pack_label, 60), supplier: txt(i.supplier, 120), station: txt(i.station, 60), notes: txt(i.notes, 500),
    };
    const q = i.id && UUID.test(i.id)
      ? supabase.from("catering_ingredients").update(row).eq("id", i.id).eq("organisation_id", org.id).select("id").single()
      : supabase.from("catering_ingredients").insert({ organisation_id: org.id, ...row }).select("id").single();
    const { data, error } = await q;
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There's already an ingredient with that name." : error.message);
    revalidatePath("/kitchen");
    return data.id as string;
  });
}

export async function archiveIngredient(id: string, active: boolean): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Not found");
    const { error } = await supabase.from("catering_ingredients").update({ active }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/kitchen");
    return active ? "Back in use." : "Hidden from new recipes.";
  });
}

/** Replace a menu item's recipe in one go. */
export async function saveRecipe(serviceId: string, lines: { ingredient_id: string; qty_per_serve: number; prep_note: string | null }[]): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(serviceId)) throw new Error("Choose a menu item.");
    const { data: svc } = await supabase.from("services").select("id").eq("id", serviceId).eq("organisation_id", org.id).maybeSingle();
    if (!svc) throw new Error("That menu item isn't in your price list.");
    const clean = lines.filter((l) => UUID.test(l.ingredient_id) && Number(l.qty_per_serve) > 0);
    if (new Set(clean.map((l) => l.ingredient_id)).size !== clean.length) throw new Error("An ingredient is in the recipe twice.");
    const { error: dErr } = await supabase.from("catering_recipe_lines").delete().eq("organisation_id", org.id).eq("service_id", serviceId);
    if (dErr) throw new Error(dErr.message);
    if (clean.length) {
      const { error } = await supabase.from("catering_recipe_lines").insert(clean.map((l) => ({
        organisation_id: org.id, service_id: serviceId, ingredient_id: l.ingredient_id, qty_per_serve: Math.round(Number(l.qty_per_serve) * 10000) / 10000, prep_note: txt(l.prep_note, 200),
      })));
      if (error) throw new Error(error.message);
    }
    revalidatePath("/kitchen");
    return "Recipe saved.";
  });
}
