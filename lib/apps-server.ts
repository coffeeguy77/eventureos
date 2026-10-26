import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { readAppAccess, type AppAccess } from "./apps";
import { readHireSettings } from "./hire/core";

/** A business's app access (null = all apps). Tolerates the column not existing yet (before migration 0068). */
export const orgAppAccess = cache(async (orgId: string): Promise<AppAccess> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organisations").select("app_access").eq("id", orgId).maybeSingle();
  if (error || !data) return null;
  return readAppAccess((data as { app_access: unknown }).app_access);
});

/**
 * Is Hire on? Given to the business by EventureOS (app access) — or, for businesses without app access set, switched
 * on by their own owner or manager (Settings → Modules).
 */
export function hireOn(access: AppAccess, settings: unknown) {
  return access ? access.has("rentals") : readHireSettings(settings).enabled;
}
