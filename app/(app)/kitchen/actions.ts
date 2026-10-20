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


/** The kitchen order for a job (days, ready-by times, items, notes). null = go back to what the quote says. */
export async function saveKitchenOrder(eventId: string, order: { days: { date: string; ready: string | null; deliver: string | null; note: string | null; items: { service_id: string | null; name: string; qty: number; note: string | null }[] }[]; notes: string | null } | null): Promise<Result> {
  return run(async () => {
    if (!UUID.test(eventId)) throw new Error("Unknown job.");
    const { supabase, org } = await office();
    const { readKitchenOrder, kitchenOrderValue } = await import("@/lib/kitchen/split");
    let value: unknown = {};
    if (order) {
      if (!order.days?.length) throw new Error("Add at least one day.");
      const clean = readKitchenOrder({ v: 2, ...order });
      if (!clean || clean.days.length !== order.days.length) throw new Error("Each day needs a different, valid date.");
      if (!clean.days.some((d) => d.items.length)) throw new Error("Add at least one item.");
      value = kitchenOrderValue(clean);
    }
    const { error } = await supabase.from("events").update({ catering_days: value }).eq("id", eventId).eq("organisation_id", org.id);
    if (error) throw new Error(/catering_days/.test(error.message) ? "The kitchen order needs the database update (0061_kitchen_salary_catering_days.sql)." : error.message);
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/kitchen");
    return order ? "Kitchen order saved." : "Back to what the quote says.";
  });
}
