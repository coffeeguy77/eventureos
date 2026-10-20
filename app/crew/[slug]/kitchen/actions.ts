"use server";

import { revalidatePath } from "next/cache";
import { crewSession } from "@/lib/crew/server";
import { isKitchen } from "@/lib/crew/skills";
import { storeIngredient, storeIngredientActive, storeRecipe, type IngredientInput, type RecipeInput } from "@/lib/kitchen/store";

type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };

/** Only staff ticked "Kitchen" in Settings → Team can change recipes and ingredients from the staff app. */
async function chef(slug: string) {
  const s = await crewSession(slug);
  if (!s) throw new Error("Please sign in again.");
  if (!isKitchen(s.member.skills)) throw new Error("Only kitchen staff can change recipes and ingredients.");
  return s;
}
const done = (slug: string) => { revalidatePath(`/crew/${slug}/kitchen`); revalidatePath("/kitchen"); };

export async function chefSaveIngredient(slug: string, i: IngredientInput): Promise<Result> {
  return run(async () => { const s = await chef(slug); const id = await storeIngredient(s.db, s.org.id, i); done(slug); return id; });
}

export async function chefArchiveIngredient(slug: string, id: string, active: boolean): Promise<Result> {
  return run(async () => { const s = await chef(slug); const m = await storeIngredientActive(s.db, s.org.id, id, active); done(slug); return m; });
}

export async function chefSaveRecipe(slug: string, serviceId: string, lines: RecipeInput[]): Promise<Result> {
  return run(async () => { const s = await chef(slug); const m = await storeRecipe(s.db, s.org.id, serviceId, lines); done(slug); return m; });
}
