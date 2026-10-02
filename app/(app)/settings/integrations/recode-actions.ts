"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient, errMessage, saveIntegrationSettings } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { RateLimited } from "@/lib/integrations/runtime";
import { cleanRecodeMap, cleanRecodeRules } from "@/lib/integrations/xero-recode-plan";
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
    const rules = cleanRecodeRules(sctx.integration.settings?.recode_rules);
    if (!Object.keys(map).length && !rules.length) return { ok: false, error: "Choose at least one item's account first." };
    const skip = new Set((opts.skip ?? []).slice(0, 5000));
    // Read with the server's access (already checked: owner/admin of this organisation) — one pass, no row-by-row policy checks
    const all = await recodeCandidates(createServiceClient(), org.id, map, rules);
    const queue = (opts.only ? all.filter((r) => r.id === opts.only) : all.filter((r) => !skip.has(r.id))).slice(0, opts.only ? 1 : Math.min(8, Math.max(1, opts.limit ?? 5)));
    const out: RecodeBatchResult = { updated: [], skipped: [], remaining: 0 };
    const started = Date.now();
    const done = new Set<string>();
    for (const inv of queue) {
      if (Date.now() - started > 30_000) break; // leave time to finish well inside the page's time limit
      let r;
      try { r = await recodeInvoice(sctx, inv.xero_invoice_id, map, rules); }
      catch (e) {
        if (e instanceof RateLimited) {
          const mins = Math.max(1, Math.ceil(e.retryAfterSec / 60));
          out.stopped = `Xero has asked EventureOS to pause (it limits how many changes an app can make). Everything done so far is saved. Wait about ${mins} minute${mins === 1 ? "" : "s"}, then press Recode again — it carries on from where it stopped.`;
          break;
        }
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
      done.add(inv.id);
      if (r.kind === "updated") out.updated.push({ number: r.number, changes: r.changes });
    }
    if (out.updated.length) {
      const n = out.updated.reduce((a, u) => a + u.changes.length, 0);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.recode", entityType: "integration", entityId: sctx.integration.id,
        summary: `${actorName(profile)} recoded ${n} line${n === 1 ? "" : "s"} on ${out.updated.map((u) => u.number).join(", ")} in Xero`,
        metadata: { updated: out.updated } });
    }
    const skipped = new Set([...skip, ...out.skipped.map((s) => s.id)]);
    out.remaining = all.filter((r) => !done.has(r.id) && !skipped.has(r.id)).length;
    return { ok: true, data: out };
  } catch (e) { return { ok: false, error: errMessage(e) }; }
}

export async function saveRecodeRules(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, org, user, profile } = await ownerOrAdmin();
    const sctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const rules = cleanRecodeRules(raw);
    await saveIntegrationSettings(sctx, { recode_rules: rules });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: sctx.integration.id,
      summary: `${actorName(profile)} updated Xero recode special rules (${rules.length})`, metadata: { rules } });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (e) { return { ok: false, error: errMessage(e) }; }
}
