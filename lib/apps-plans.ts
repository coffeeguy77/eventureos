import type { SupabaseClient } from "@supabase/supabase-js";
import { readPlanApps } from "./apps";

/** Which apps each plan includes (Platform admin → Plans). Every plan includes every app until that's set. */
export async function planApps(db: SupabaseClient) {
  const { data, error } = await db.from("platform_settings").select("value").eq("key", "plan_apps").maybeSingle();
  return { plans: readPlanApps(error ? null : data?.value), ready: !error || !/platform_settings|does not exist|Could not find/i.test(error.message), set: !!data };
}
