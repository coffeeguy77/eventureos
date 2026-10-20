"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { storeIngredient, storeIngredientActive, storeRecipe, type IngredientInput, type RecipeInput } from "@/lib/kitchen/store";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager", "sales"].includes(ctx.role)) throw new Error("You don't have access to the kitchen.");
  return ctx;
}

export type { IngredientInput } from "@/lib/kitchen/store";

export async function saveIngredient(i: IngredientInput): Promise<Result<string>> {
  return run(async () => {
    const { supabase, org } = await office();
    const id = await storeIngredient(supabase, org.id, i);
    revalidatePath("/kitchen");
    return id;
  });
}

export async function archiveIngredient(id: string, active: boolean): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await office();
    const msg = await storeIngredientActive(supabase, org.id, id, active);
    revalidatePath("/kitchen");
    return msg;
  });
}

/** Replace a menu item's recipe in one go. */
export async function saveRecipe(serviceId: string, lines: RecipeInput[]): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await office();
    const msg = await storeRecipe(supabase, org.id, serviceId, lines);
    revalidatePath("/kitchen");
    return msg;
  });
}

/** Catering by day for a multi-day job: which days, what time, and how many of each item each day. */
export async function saveCateringDays(eventId: string, plan: { days: { date: string; time: string | null }[]; qty: Record<string, Record<string, number>> }): Promise<Result> {
  return run(async () => {
    if (!UUID.test(eventId)) throw new Error("Unknown job.");
    const { supabase, org } = await office();
    const { readCateringDays } = await import("@/lib/kitchen/split");
    const clean = readCateringDays(plan);
    if (plan.days?.length && clean.days.length !== plan.days.length) throw new Error("Each day needs a different, valid date.");
    const { error } = await supabase.from("events").update({ catering_days: clean }).eq("id", eventId).eq("organisation_id", org.id);
    if (error) throw new Error(/catering_days/.test(error.message) ? "Catering by day needs the database update (0061_kitchen_salary_catering_days.sql)." : error.message);
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/kitchen");
    return "Saved";
  });
}
