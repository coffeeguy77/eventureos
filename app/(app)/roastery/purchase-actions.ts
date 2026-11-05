"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";

type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  return { ok: false, error: /roastery_purchase/.test(m) && /does not exist|could not find|schema cache/i.test(m) ? "Purchases need their database update first: run supabase/migrations/0100_green_purchases.sql in Supabase." : m };
};
async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Roastery.");
  return ctx;
}

/** Read green coffee invoices from Gmail now (a few minutes' worth); press again — or leave it to the 10-minute check — to carry on. */
export async function importGreenNow(): Promise<R<{ imported: number; duplicates: number; skipped: number; failed: number; found: number; more: boolean; problems: string[] }>> {
  try {
    const { org } = await manager();
    const db = createServiceClient();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { orgAiKey } = await import("@/lib/ai/key");
    const { importGreenInvoices } = await import("@/lib/roastery/purchase-import");
    const ctx = await buildContext(db, "service", org.id, "gmail", null);
    const r = await importGreenInvoices(ctx, { aiKey: await orgAiKey(org.id), budgetMs: 240_000, parallel: 6 });
    revalidatePath("/roastery/purchases");
    return { ok: true, data: { imported: r.imported, duplicates: r.duplicates, skipped: r.skipped, failed: r.failed, found: r.found, more: r.more, problems: r.lines.slice(0, 5) } };
  } catch (e) { return fail(e); }
}

/** Which senders' invoices are read (addresses or whole domains). */
export async function saveGreenSenders(list: string[]): Promise<R> {
  try {
    const { org } = await manager();
    const clean = [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim().toLowerCase().replace(/^@/, "")).filter((x) => /^[a-z0-9._%+-]*@?[a-z0-9.-]+\.[a-z]{2,}$/.test(x)))].slice(0, 30);
    if (!clean.length) throw new Error("Add at least one sender email or domain.");
    const db = createServiceClient();
    const { data: o } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (o?.settings ?? {}) as Record<string, unknown>;
    const ro = (settings.roastery ?? {}) as Record<string, unknown>;
    const gi = (ro.green_import ?? {}) as Record<string, unknown>;
    // new senders: read the whole history again (anything already in is skipped)
    const { error } = await db.from("organisations").update({ settings: { ...settings, roastery: { ...ro, green_import: { ...gi, senders: clean, done: false } } } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/roastery/purchases");
    return { ok: true, data: `Saved — ${clean.length} sender${clean.length === 1 ? "" : "s"}.` };
  } catch (e) { return fail(e); }
}
