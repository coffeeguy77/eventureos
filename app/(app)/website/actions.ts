"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { readEvents, type EventsSettings } from "@/lib/events/core";
import { readReminders, type ReminderSettings } from "@/lib/reminders/core";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the website.");
  return ctx;
}

async function saveKey(key: "events" | "reminders", value: unknown) {
  const { supabase, org } = await manager();
  const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) throw new Error(e1.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, [key]: value } }).eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/website");
  return org.slug as string;
}

export async function saveEventsSettings(input: EventsSettings): Promise<Result> {
  return run(async () => {
    // Run it through the same reader the website uses, so only clean values are stored
    const clean = readEvents({ events: input });
    if (clean.enabled && !clean.fleet.cart && !clean.fleet.van && !clean.fleet.diy) throw new Error("Add at least one cart, van or equipment kit before switching the events pages on.");
    await saveKey("events", clean);
    return clean.enabled ? "Saved — your events pages are live." : "Saved. The events pages are switched off.";
  });
}

export async function saveReminderSettings(input: ReminderSettings): Promise<Result> {
  return run(async () => {
    const clean = readReminders({ reminders: input });
    await saveKey("reminders", clean);
    const on = Object.values(clean.sections).filter((s) => s.on).length;
    return clean.enabled && on ? `Saved — reminders are on for ${on} section${on > 1 ? "s" : ""}. They go out with the daily run.` : "Saved. Reminders are off — nothing will be sent.";
  });
}
