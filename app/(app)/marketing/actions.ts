"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import type { MkAccount } from "@/lib/marketing/sync";

type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const ID = /^[0-9a-f-]{36}$/i;

async function office() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can manage Marketing.");
  return ctx;
}
async function gctx(orgId: string, userId: string) {
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  return buildContext(createServiceClient(), "service", orgId, "google_marketing", userId);
}
async function account(orgId: string, id: string): Promise<MkAccount> {
  if (!ID.test(id)) throw new Error("That client link isn't valid.");
  const { MK_ACCOUNT_COLUMNS } = await import("@/lib/marketing/sync");
  const { data } = await createServiceClient().from("mk_accounts").select(MK_ACCOUNT_COLUMNS).eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That client isn't in Marketing.");
  return data as MkAccount;
}

export interface GoogleOptions { ads: { id: string; name: string; currency: string | null; manager: boolean; testAccount: boolean }[]; ga4: { property: string; name: string; account: string }[]; gsc: { site: string; permission: string }[]; problems: string[] }

/** What the connected Google login can reach, for the pickers. */
export async function googleOptions(): Promise<R<GoogleOptions>> {
  try {
    const { org, user } = await office();
    const ctx = await gctx(org.id, user.id);
    const g = await import("@/lib/marketing/google");
    const problems: string[] = [];
    const [ads, ga4, gsc] = await Promise.all([
      g.adsReady() ? g.listAdsCustomers(ctx).catch((e) => { problems.push(`Google Ads: ${g.adsErrorText(e)}`); return []; }) : (problems.push("Google Ads: the developer token isn't set yet (GOOGLE_ADS_DEVELOPER_TOKEN in Vercel)."), Promise.resolve([])),
      g.listGa4Properties(ctx).catch((e) => { problems.push(`Analytics: ${err(e)}`); return []; }),
      g.listGscSites(ctx).catch((e) => { problems.push(`Search Console: ${err(e)}`); return []; }),
    ]);
    return { ok: true, data: { ads: ads.filter((a) => !a.manager), ga4, gsc, problems } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface AccountInput {
  name: string; customer_id: string | null; ads_customer_id: string | null; ga4_property: string | null; gsc_site: string | null;
  mode: "auto" | "suggest" | "off"; monthly_cap: number | null; target_cpa: number | null; goals: string | null; max_changes: number; report_to: string; active: boolean;
}

export async function saveAccount(id: string | null, f: AccountInput): Promise<R> {
  try {
    const { supabase, org } = await office();
    const name = f.name.trim().slice(0, 120);
    if (!name) return { ok: false, error: "Give the client a name." };
    const ads = (f.ads_customer_id ?? "").replace(/\D/g, "") || null;
    if (ads && ads.length !== 10) return { ok: false, error: "A Google Ads account number has 10 digits." };
    const ga4 = f.ga4_property?.trim() || null;
    if (ga4 && !/^properties\/\d+$/.test(ga4)) return { ok: false, error: "Choose the GA4 property from the list." };
    const cap = f.monthly_cap != null && Number(f.monthly_cap) > 0 ? Math.round(Number(f.monthly_cap) * 100) / 100 : null;
    const emails = f.report_to.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, error: "One of the report email addresses doesn't look right." };
    if (f.customer_id && !ID.test(f.customer_id)) return { ok: false, error: "Choose the client from the list." };
    const row = {
      organisation_id: org.id, name, customer_id: f.customer_id || null, ads_customer_id: ads, ga4_property: ga4, gsc_site: f.gsc_site?.trim() || null,
      mode: ["auto", "suggest", "off"].includes(f.mode) ? f.mode : "suggest", monthly_cap: cap,
      target_cpa: f.target_cpa != null && Number(f.target_cpa) > 0 ? Math.round(Number(f.target_cpa) * 100) / 100 : null,
      goals: f.goals?.trim().slice(0, 2000) || null, max_changes: Math.min(50, Math.max(1, Math.round(Number(f.max_changes) || 10))), report_to: emails, active: !!f.active, updated_at: new Date().toISOString(),
    };
    if (id) {
      if (!ID.test(id)) return { ok: false, error: "That client link isn't valid." };
      const { error } = await supabase.from("mk_accounts").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath(`/marketing/${id}`);
      return { ok: true, data: id };
    }
    const { data, error } = await supabase.from("mk_accounts").insert(row).select("id").single();
    if (error) return { ok: false, error: /mk_accounts/.test(error.message) ? "Run the Marketing database update (0114) in Supabase first." : error.message };
    revalidatePath("/marketing");
    return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function syncNow(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const a = await account(org.id, id);
    const { syncAccount } = await import("@/lib/marketing/sync");
    const msg = await syncAccount(await gctx(org.id, user.id), a);
    revalidatePath(`/marketing/${id}`);
    return { ok: true, data: msg };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function runNow(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const a = await account(org.id, id);
    const { runAccount } = await import("@/lib/marketing/optimiser");
    const msg = await runAccount(await gctx(org.id, user.id), a, user.id);
    revalidatePath(`/marketing/${id}`);
    return { ok: true, data: msg };
  } catch (e) { return { ok: false, error: err(e) }; }
}

type ChangeRow = { id: string; account_id: string; kind: string; target: string; before: Record<string, unknown>; after: Record<string, unknown>; status: string };
async function change(orgId: string, id: string): Promise<ChangeRow> {
  if (!ID.test(id)) throw new Error("That change link isn't valid.");
  const { data } = await createServiceClient().from("mk_changes").select("id, account_id, kind, target, before, after, status").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That change isn't there any more.");
  return data as ChangeRow;
}

/** Approve a suggested change: make it in Google Ads now. */
export async function approveChange(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const c = await change(org.id, id);
    if (c.status !== "proposed") return { ok: false, error: "Only suggested changes can be approved." };
    const a = await account(org.id, c.account_id);
    if (!a.ads_customer_id) return { ok: false, error: "No Google Ads account is linked." };
    const { applyChange } = await import("@/lib/marketing/optimiser");
    const { adsErrorText } = await import("@/lib/marketing/google");
    const p = { kind: c.kind as "set_budget", target: c.target, value: Number(c.after.daily ?? c.after.cpc), text: c.after.text as string | undefined, match: c.after.match as "EXACT" | undefined, reason: "" };
    const db = createServiceClient();
    try {
      const after = await applyChange(await gctx(org.id, user.id), a.ads_customer_id, { p, after: c.after });
      await db.from("mk_changes").update({ status: "applied", after, applied_at: new Date().toISOString(), decided_by: user.id }).eq("id", id);
    } catch (e) {
      await db.from("mk_changes").update({ status: "failed", error: adsErrorText(e), decided_by: user.id }).eq("id", id);
      return { ok: false, error: adsErrorText(e) };
    }
    revalidatePath(`/marketing/${c.account_id}`);
    return { ok: true, data: "Done in Google Ads." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function rejectChange(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const c = await change(org.id, id);
    if (c.status !== "proposed") return { ok: false, error: "Only suggested changes can be turned down." };
    await createServiceClient().from("mk_changes").update({ status: "rejected", decided_by: user.id }).eq("id", id);
    revalidatePath(`/marketing/${c.account_id}`);
    return { ok: true, data: "Turned down — the AI won't suggest it again soon." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Put a change the AI made back the way it was, in Google Ads. */
export async function undoChangeAction(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const c = await change(org.id, id);
    if (c.status !== "applied") return { ok: false, error: "Only changes that were made can be undone." };
    const a = await account(org.id, c.account_id);
    if (!a.ads_customer_id) return { ok: false, error: "No Google Ads account is linked." };
    const { undoChange } = await import("@/lib/marketing/optimiser");
    const { adsErrorText } = await import("@/lib/marketing/google");
    try { await undoChange(await gctx(org.id, user.id), a.ads_customer_id, c); }
    catch (e) { return { ok: false, error: adsErrorText(e) }; }
    await createServiceClient().from("mk_changes").update({ status: "undone", undone_at: new Date().toISOString(), decided_by: user.id }).eq("id", id);
    revalidatePath(`/marketing/${c.account_id}`);
    return { ok: true, data: "Put back in Google Ads." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Build (or rebuild) a month's report. month = "YYYY-MM". */
export async function buildReport(id: string, month: string): Promise<R> {
  try {
    const { org, user } = await office();
    if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Choose a month." };
    const a = await account(org.id, id);
    const { makeReport, monthRange } = await import("@/lib/marketing/report");
    const [y, m] = month.split("-").map(Number);
    const { start, end } = monthRange(y, m - 1);
    let ctx = null;
    try { ctx = await gctx(org.id, user.id); } catch { /* report from stored figures only */ }
    const rid = await makeReport(createServiceClient(), ctx, a, org.name, start, end);
    revalidatePath(`/marketing/${id}`);
    return { ok: true, data: rid };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveCommentary(reportId: string, text: string): Promise<R> {
  try {
    const { supabase, org } = await office();
    if (!ID.test(reportId)) return { ok: false, error: "That report link isn't valid." };
    const { error } = await supabase.from("mk_reports").update({ commentary: text.slice(0, 8000), updated_at: new Date().toISOString() }).eq("id", reportId).eq("organisation_id", org.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: "Saved." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function markSent(reportId: string): Promise<R> {
  try {
    const { supabase, org } = await office();
    if (!ID.test(reportId)) return { ok: false, error: "That report link isn't valid." };
    const { error } = await supabase.from("mk_reports").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", reportId).eq("organisation_id", org.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: "Marked as sent." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Keyword Planner ideas with Google's monthly searches and top-of-page bid ranges. */
export async function keywordIdeasAction(id: string, seeds: string[], url: string | null): Promise<R<import("@/lib/marketing/campaign").Idea[]>> {
  try {
    const { org, user } = await office();
    const a = await account(org.id, id);
    if (!a.ads_customer_id) return { ok: false, error: "No Google Ads account is linked." };
    const list = seeds.map((x) => x.trim()).filter(Boolean).slice(0, 20);
    if (!list.length) return { ok: false, error: "Type a few words people would search." };
    const { keywordIdeas } = await import("@/lib/marketing/campaign");
    const { adsErrorText } = await import("@/lib/marketing/google");
    try { return { ok: true, data: await keywordIdeas(await gctx(org.id, user.id), a.ads_customer_id, list, url && /^https:\/\//.test(url) ? url : undefined) }; }
    catch (e) { return { ok: false, error: adsErrorText(e) }; }
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Make a search campaign in Google Ads, PAUSED — logged as a change (Undo removes it). */
export async function createCampaignAction(id: string, spec: import("@/lib/marketing/campaign").CampaignSpec): Promise<R> {
  try {
    const { org, user } = await office();
    const a = await account(org.id, id);
    if (!a.ads_customer_id) return { ok: false, error: "No Google Ads account is linked." };
    const { checkSpec, createSearchCampaign } = await import("@/lib/marketing/campaign");
    const problem = checkSpec(spec);
    if (problem) return { ok: false, error: problem };
    if (a.monthly_cap && spec.dailyBudget * 30.4 > Number(a.monthly_cap) + 5) return { ok: false, error: `$${spec.dailyBudget}/day is about $${Math.round(spec.dailyBudget * 30.4)} a month — over this client's $${a.monthly_cap} cap.` };
    const { adsErrorText } = await import("@/lib/marketing/google");
    let made: { campaign: string; budget: string };
    try { made = await createSearchCampaign(await gctx(org.id, user.id), a.ads_customer_id, spec); }
    catch (e) { return { ok: false, error: adsErrorText(e) }; }
    await createServiceClient().from("mk_changes").insert({
      organisation_id: org.id, account_id: id, kind: "create_campaign", target: made.campaign || spec.name, label: `New campaign “${spec.name}” (paused)`,
      before: {}, after: { resource: made.campaign, budget: made.budget, daily: spec.dailyBudget, keywords: spec.keywords.length, url: spec.finalUrl },
      reason: `Created paused: $${spec.dailyBudget}/day, ${spec.keywords.length} keywords, ${spec.radiusKm} km around ${spec.centre.label}. Switch it on in Google Ads when you're happy with it.`,
      status: "applied", by_ai: false, decided_by: user.id, applied_at: new Date().toISOString(),
    });
    revalidatePath(`/marketing/${id}`);
    return { ok: true, data: `Created “${spec.name}” — paused. Open Google Ads to check it and switch it on.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** The starting-point audit (or a fresh one): Claude reviews the whole account; later reports compare with it. */
export async function runAuditAction(id: string): Promise<R> {
  try {
    const { org, user } = await office();
    const a = await account(org.id, id);
    const { runAudit } = await import("@/lib/marketing/audit");
    const { adsErrorText } = await import("@/lib/marketing/google");
    try { const rid = await runAudit(await gctx(org.id, user.id), a); revalidatePath(`/marketing/${id}`); return { ok: true, data: rid }; }
    catch (e) { return { ok: false, error: adsErrorText(e) }; }
  } catch (e) { return { ok: false, error: err(e) }; }
}
