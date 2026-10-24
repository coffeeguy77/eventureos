"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function ownerOrAdmin() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Only owners and admins can change this.");
  return ctx;
}

/** Switch the test code (GIFTCARDTEST) on or off. */
export async function setTestingAction(enabled: boolean): Promise<R> {
  try {
    const { org } = await ownerOrAdmin();
    const db = createServiceClient();
    const { data } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const { error } = await db.from("organisations").update({ settings: { ...settings, testing: { ...((settings.testing as object) ?? {}), enabled } } }).eq("id", org.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings/testing");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Remove every test booking, gift certificate, order, gift card and test student — real records are never touched. */
export async function clearTestResultsAction(): Promise<R<{ cleared: Record<string, number> }>> {
  try {
    const { org } = await ownerOrAdmin();
    const db = createServiceClient();
    const { data, error } = await db.rpc("clear_test_data", { p_org: org.id });
    if (error) return { ok: false, error: /clear_test_data/.test(error.message) ? "Run the 0065 test mode database update first." : error.message };
    revalidatePath("/settings/testing");
    return { ok: true, cleared: (data ?? {}) as Record<string, number> };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
