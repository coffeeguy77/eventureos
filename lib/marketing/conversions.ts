import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import { adsMutate, adsSearch } from "./google";

/**
 * A client's Google Ads conversion actions, and which of them count as conversions ("primary" — what the bidding
 * optimises for and what the Conversions column shows). Secondary actions are still recorded ("observe only").
 * GA4 imports start HIDDEN; making one primary also sets it ENABLED.
 * https://developers.google.com/google-ads/api/fields/v26/conversion_action
 */
export interface ConversionRow {
  resource: string; id: string; name: string; status: string; category: string; type: string; origin: string | null;
  primary: boolean; all30: number; conv30: number;
}

export async function listConversions(ctx: SyncContext, customerId: string): Promise<ConversionRow[]> {
  type A = { conversionAction?: { resourceName?: string; id?: string; name?: string; status?: string; category?: string; type?: string; origin?: string; primaryForGoal?: boolean } };
  const actions = await adsSearch<A>(ctx, customerId, "SELECT conversion_action.resource_name, conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.category, conversion_action.type, conversion_action.origin, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != 'REMOVED'");
  // how often each fired in the last 30 days (all conversions, primary or not)
  type M = { segments?: { conversionAction?: string }; metrics?: { allConversions?: number; conversions?: number } };
  let stats: M[] = [];
  try { stats = await adsSearch<M>(ctx, customerId, "SELECT segments.conversion_action, metrics.all_conversions, metrics.conversions FROM customer WHERE segments.date DURING LAST_30_DAYS"); } catch { /* figures optional */ }
  const by = new Map<string, { all: number; conv: number }>();
  for (const s of stats) { const k = s.segments?.conversionAction; if (!k) continue; const o = by.get(k) ?? { all: 0, conv: 0 }; o.all += Number(s.metrics?.allConversions ?? 0); o.conv += Number(s.metrics?.conversions ?? 0); by.set(k, o); }
  return actions.filter((a) => a.conversionAction?.resourceName).map((a) => {
    const c = a.conversionAction!;
    const m = by.get(c.resourceName!) ?? { all: 0, conv: 0 };
    return { resource: c.resourceName!, id: c.id ?? "", name: c.name ?? "", status: c.status ?? "", category: c.category ?? "", type: c.type ?? "", origin: c.origin ?? null, primary: !!c.primaryForGoal, all30: Math.round(m.all * 100) / 100, conv30: Math.round(m.conv * 100) / 100 };
  }).sort((x, y) => Number(y.primary) - Number(x.primary) || y.all30 - x.all30 || x.name.localeCompare(y.name));
}

type Changed = { resource: string; name: string; before: { primary: boolean; status: string }; after: { primary: boolean; status: string } };

/**
 * Set which actions count, one action at a time — Google won't let some kinds be changed through the API
 * (e.g. Universal Analytics goals, system-defined app installs), and one refusal mustn't block the rest.
 * Returns what changed (to log, and to undo) and what Google refused.
 */
export async function setConversionGoals(ctx: SyncContext, customerId: string, want: Record<string, boolean>): Promise<{ changed: Changed[]; refused: { name: string; reason: string }[] }> {
  const { adsErrorText } = await import("./google");
  const rows = await listConversions(ctx, customerId);
  const changed: Changed[] = [];
  const refused: { name: string; reason: string }[] = [];
  for (const r of rows) {
    if (!(r.resource in want)) continue;
    const primary = !!want[r.resource];
    const status = primary && r.status === "HIDDEN" ? "ENABLED" : r.status;
    if (primary === r.primary && status === r.status) continue;
    const update: Record<string, unknown> = { resourceName: r.resource, primaryForGoal: primary };
    const mask = ["primary_for_goal"];
    if (status !== r.status) { update.status = status; mask.push("status"); }
    try {
      await adsMutate(ctx, customerId, "conversionActions", [{ update, updateMask: mask.join(",") }]);
      changed.push({ resource: r.resource, name: r.name, before: { primary: r.primary, status: r.status }, after: { primary, status } });
    } catch (e) { refused.push({ name: r.name, reason: adsErrorText(e) }); }
  }
  return { changed, refused };
}
