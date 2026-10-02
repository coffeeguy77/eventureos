"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { errMessage, saveIntegrationSettings } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { RateLimited } from "@/lib/integrations/runtime";
import { cleanRecodeMap } from "@/lib/integrations/xero-recode-plan";
import { recodeCandidates, recodeInvoice } from "@/lib/integrations/xero-recode";

/**
 * Recode Xero invoices by item (Settings → Integrations → Xero → Recode by item).
 * Owners and admins only: it changes accounts on posted (including paid) invoices in Xero.
 */
const PAGE = "/settings/integrations/xero/recode";

async function ownerOrAdmin() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Only owners and admins can recode invoices in Xero.");
  return ctx;
}

export async function saveRecodeMap(raw: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, org, user, profile } = await ownerOrAdmin();
    const sctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const map = cleanRecodeMap(raw);
    const before = cleanRecodeMap(sctx.integration.settings?.recode_map);
    await saveIntegrationSettings(sctx, { recode_map: map });
    if (JSON.stringify(before) !== JSON.stringify(map)) {
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: sctx.integration.id,
        summary: `${actorName(profile)} set Xero recode-by-item accounts: ${Object.entries(map).map(([k, v]) => `${k} → ${v}`).join(", ") || "none"}` });
    }
    revalidatePath(PAGE);
    return { ok: true };
  } catch (e) { return { ok: false, error: errMessage(e) }; }
}

export interface RecodeBatchResult {
  updated: { number: string; changes: { item: string; from: string | null; to: string }[] }[];
  skipped: { id: string; number: string; reason: string }[];
  remaining: number;
  stopped?: string;
}

/**
 * Recode the next few invoices (newest first). `only` runs a single invoice (the test run).
 * `skip` = invoices Xero refused this session (e.g. before the lock date) so the loop moves on.
 */
export async function runRecodeBatch(opts: { limit?: number; skip?: string[]; only?: string }): Promise<{ ok: true; data: RecodeBatchResult } | { ok: false; error: string }> {
  try {
    const { supabase, org, user, profile } = await ownerOrAdmin();
    const sctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const map = cleanRecodeMap(sctx.integration.settings?.recode_map);
    if (!Object.keys(map).length) return { ok: false, error: "Choose at least one item's account first." };
    const skip = new Set((opts.skip ?? []).slice(0, 5000));
    const all = await recodeCandidates(supabase, org.id, map);
    const queue = (opts.only ? all.filter((r) => r.id === opts.only) : all.filter((r) => !skip.has(r.id))).slice(0, opts.only ? 1 : Math.min(8, Math.max(1, opts.limit ?? 5)));
    const out: RecodeBatchResult = { updated: [], skipped: [], remaining: 0 };
    for (const inv of queue) {
      let r;
      try { r = await recodeInvoice(sctx, inv.xero_invoice_id, map); }
      catch (e) {
        if (e instanceof RateLimited) { out.stopped = e.message; break; }
        out.skipped.push({ id: inv.id, number: inv.number, reason: errMessage(e) }); continue;
      }
      if (r.kind === "skipped") { out.skipped.push({ id: inv.id, number: r.number, reason: r.reason }); continue; }
      if (r.kind === "mismatch") {
        out.stopped = `Stopped: after updating ${r.number}, Xero's copy didn't match (${r.reason}). Please check that invoice in Xero.`;
        await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.recode_mismatch", entityType: "invoice", entityId: inv.id, summary: out.stopped });
        break;
      }
      // Keep EventureOS's copy in step with Xero, so this invoice drops off the list
      await supabase.from("invoices").update({ line_items: r.lines }).eq("id", inv.id).eq("organisation_id", org.id);
      if (r.kind === "updated") out.updated.push({ number: r.number, changes: r.changes });
    }
    if (out.updated.length) {
      const n = out.updated.reduce((a, u) => a + u.changes.length, 0);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.recode", entityType: "integration", entityId: sctx.integration.id,
        summary: `${actorName(profile)} recoded ${n} line${n === 1 ? "" : "s"} on ${out.updated.map((u) => u.number).join(", ")} in Xero`,
        metadata: { updated: out.updated } });
    }
    const left = await recodeCandidates(supabase, org.id, map);
    const skipped = new Set([...skip, ...out.skipped.map((s) => s.id)]);
    out.remaining = left.filter((r) => !skipped.has(r.id)).length;
    return { ok: true, data: out };
  } catch (e) { return { ok: false, error: errMessage(e) }; }
}
