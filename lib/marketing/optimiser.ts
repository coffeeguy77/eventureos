import "server-only";
import { addDaysISO, todayISO } from "@/lib/format";
import { errMessage, type SyncContext } from "@/lib/integrations/runtime";
import { askStructured, marketingModel } from "./ai";
import { adsErrorText, adsMutate, adsReady, adsSearch } from "./google";
import { applyAutomatically, decide, type ActionKind, type Decided, type Limits, type Proposal, type Snapshot } from "./guard";
import type { MkAccount } from "./sync";

/**
 * The daily AI review of one client's Google Ads:
 *  1. read the account (campaigns + budgets, keywords, search terms, negatives — last 30 days)
 *  2. ask Claude for changes, in a fixed vocabulary, with a reason for each
 *  3. guard.ts decides which are allowed (hard limits the AI can't override)
 *  4. auto mode (with a monthly cap): apply them in Google Ads; otherwise list them for a person to approve
 * Every change is written to mk_changes with what it was before, so it can be undone.
 */
export { marketingModel };
const micros = (v: unknown) => Math.round((Number(v ?? 0) / 1e6) * 100) / 100;
const toMicros = (v: number) => String(Math.round(v * 100) * 10000); // whole cents, as Google requires

interface SearchTerm { term: string; campaign: string; campaignName: string; adGroupName: string; clicks: number; cost: number; conversions: number }
export interface Review { snap: Snapshot; terms: SearchTerm[]; totals: { cost: number; conversions: number; convValue: number; clicks: number; impressions: number } }

export async function readAccount(ctx: SyncContext, a: MkAccount): Promise<Review> {
  const id = a.ads_customer_id!;
  type C = { campaign?: { resourceName?: string; id?: string; name?: string; status?: string; biddingStrategyType?: string }; campaignBudget?: { resourceName?: string; amountMicros?: string; explicitlyShared?: boolean } };
  const camps = await adsSearch<C>(ctx, id, "SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'");
  const manualCpc = new Set(camps.filter((c) => /MANUAL_CPC|ENHANCED_CPC/.test(c.campaign?.biddingStrategyType ?? "")).map((c) => c.campaign?.resourceName));
  type CM = { campaign?: { resourceName?: string }; metrics?: { costMicros?: string; conversions?: number; conversionsValue?: number; clicks?: string; impressions?: string } };
  const campMetrics = await adsSearch<CM>(ctx, id, "SELECT campaign.resource_name, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS");
  type K = { adGroupCriterion?: { resourceName?: string; status?: string; keyword?: { text?: string; matchType?: string }; cpcBidMicros?: string; effectiveCpcBidMicros?: string }; adGroup?: { resourceName?: string; name?: string }; campaign?: { resourceName?: string; name?: string } };
  const kws = await adsSearch<K>(ctx, id, "SELECT ad_group_criterion.resource_name, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, ad_group_criterion.effective_cpc_bid_micros, ad_group.resource_name, ad_group.name, campaign.resource_name, campaign.name FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED' AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'");
  type KM = { adGroupCriterion?: { resourceName?: string }; metrics?: { costMicros?: string; conversions?: number; clicks?: string } };
  const kwMetrics = await adsSearch<KM>(ctx, id, "SELECT ad_group_criterion.resource_name, metrics.cost_micros, metrics.conversions, metrics.clicks FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'");
  type N = { campaignCriterion?: { keyword?: { text?: string; matchType?: string } }; campaign?: { resourceName?: string } };
  const negs = await adsSearch<N>(ctx, id, "SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign.resource_name FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'");
  type S = { searchTermView?: { searchTerm?: string }; campaign?: { resourceName?: string; name?: string }; adGroup?: { name?: string }; metrics?: { costMicros?: string; conversions?: number; clicks?: string } };
  const terms = await adsSearch<S>(ctx, id, "SELECT search_term_view.search_term, campaign.resource_name, campaign.name, ad_group.name, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC LIMIT 200");
  type T = { metrics?: { costMicros?: string } };
  const month = await adsSearch<T>(ctx, id, "SELECT metrics.cost_micros FROM customer WHERE segments.date DURING THIS_MONTH");

  const cm = new Map<string, { cost: number; conversions: number; value: number; clicks: number; impressions: number }>();
  for (const x of campMetrics) { const k = x.campaign?.resourceName; if (!k) continue; const m = x.metrics ?? {}; const o = cm.get(k) ?? { cost: 0, conversions: 0, value: 0, clicks: 0, impressions: 0 }; o.cost += micros(m.costMicros); o.conversions += Number(m.conversions ?? 0); o.value += Number(m.conversionsValue ?? 0); o.clicks += Number(m.clicks ?? 0); o.impressions += Number(m.impressions ?? 0); cm.set(k, o); }
  const km = new Map<string, { cost: number; conversions: number; clicks: number }>();
  for (const x of kwMetrics) { const k = x.adGroupCriterion?.resourceName; if (!k) continue; const m = x.metrics ?? {}; const o = km.get(k) ?? { cost: 0, conversions: 0, clicks: 0 }; o.cost += micros(m.costMicros); o.conversions += Number(m.conversions ?? 0); o.clicks += Number(m.clicks ?? 0); km.set(k, o); }

  const snap: Snapshot = {
    campaigns: camps.filter((c) => c.campaign?.resourceName && c.campaignBudget?.resourceName).map((c) => ({
      resource: c.campaign!.resourceName!, id: c.campaign!.id ?? "", name: c.campaign!.name ?? "", status: c.campaign!.status ?? "",
      budget: c.campaignBudget!.resourceName!, dailyBudget: micros(c.campaignBudget!.amountMicros), shared: !!c.campaignBudget!.explicitlyShared,
    })),
    keywords: kws.filter((k) => k.adGroupCriterion?.resourceName && k.adGroupCriterion.keyword?.text).map((k) => {
      const m = km.get(k.adGroupCriterion!.resourceName!) ?? { cost: 0, conversions: 0, clicks: 0 };
      const manual = manualCpc.has(k.campaign?.resourceName);
      const bid = micros(k.adGroupCriterion!.cpcBidMicros ?? k.adGroupCriterion!.effectiveCpcBidMicros);
      return {
        resource: k.adGroupCriterion!.resourceName!, text: k.adGroupCriterion!.keyword!.text!, match: k.adGroupCriterion!.keyword!.matchType ?? "BROAD", status: k.adGroupCriterion!.status ?? "",
        adGroup: k.adGroup?.resourceName ?? "", adGroupName: k.adGroup?.name ?? "", campaign: k.campaign?.resourceName ?? "", campaignName: k.campaign?.name ?? "",
        cpc: manual && bid > 0 ? bid : null, conversions: Math.round(m.conversions * 100) / 100, cost: Math.round(m.cost * 100) / 100, clicks: m.clicks,
      };
    }),
    negatives: negs.filter((n) => n.campaign?.resourceName && n.campaignCriterion?.keyword?.text).map((n) => ({ campaign: n.campaign!.resourceName!, text: n.campaignCriterion!.keyword!.text!, match: n.campaignCriterion!.keyword!.matchType ?? "EXACT" })),
    monthSpend: Math.round(month.reduce((s, x) => s + micros(x.metrics?.costMicros), 0) * 100) / 100,
  };
  const totals = [...cm.values()].reduce((t, o) => ({ cost: t.cost + o.cost, conversions: t.conversions + o.conversions, convValue: t.convValue + o.value, clicks: t.clicks + o.clicks, impressions: t.impressions + o.impressions }), { cost: 0, conversions: 0, convValue: 0, clicks: 0, impressions: 0 });
  // campaign figures go on the snapshot's campaigns for the AI to read
  (snap as Snapshot & { campaignStats?: unknown }).campaignStats = Object.fromEntries(cm);
  return {
    snap, totals,
    terms: terms.map((t) => ({ term: t.searchTermView?.searchTerm ?? "", campaign: t.campaign?.resourceName ?? "", campaignName: t.campaign?.name ?? "", adGroupName: t.adGroup?.name ?? "", clicks: Number(t.metrics?.clicks ?? 0), cost: micros(t.metrics?.costMicros), conversions: Number(t.metrics?.conversions ?? 0) })).filter((t) => t.term),
  };
}

const SYSTEM = `You manage Google Ads accounts for a small Australian web agency's clients. Your job: get each client more conversions for the money, within their monthly cap.
You may ONLY propose these changes (anything else is ignored):
- pause_keyword: target = keyword resource; for keywords spending with no conversions over 30 days, clearly irrelevant, or duplicating a better keyword. Never pause a keyword with conversions.
- add_negative: target = campaign resource; text = the search term words to exclude; match = EXACT or PHRASE. For search terms that spend money but are irrelevant (jobs, free, DIY, wrong location, wrong product).
- set_keyword_bid: target = keyword resource; value = new max CPC. Only keywords with a cpc (manual bidding). At most ±25%.
- set_budget: target = campaign budget resource; value = new DAILY budget. At most ±20%. Move money towards campaigns with the best cost per conversion; reduce budgets on campaigns that spend without converting. Total daily budgets × 30.4 must stay within the monthly cap.
Be conservative: with little data (under ~30 clicks or no conversions anywhere) prefer negatives and pausing obvious waste over budget changes. Don't change the same thing back and forth: see recent changes. It's fine to propose nothing.
Submit a summary (2-4 plain sentences for the agency on how the account is going and what you're changing) and the actions (each with a one-sentence reason a client could read).`;

async function askAi(orgId: string, a: MkAccount, r: Review, recent: { kind: string; label: string; status: string; created_at: string }[]): Promise<{ summary: string; actions: Proposal[] }> {
  const stats = (r.snap as Snapshot & { campaignStats?: Record<string, { cost: number; conversions: number; value: number; clicks: number; impressions: number }> }).campaignStats ?? {};
  const input = {
    client: a.name, goals: a.goals ?? "(none given — aim for the most conversions at a sensible cost)", currency: a.ads_currency ?? "AUD",
    monthly_cap: a.monthly_cap, target_cost_per_conversion: a.target_cpa, spend_this_month: r.snap.monthSpend, last_30_days: r.totals,
    campaigns: r.snap.campaigns.map((c) => ({ resource: c.resource, name: c.name, status: c.status, budget_resource: c.budget, daily_budget: c.dailyBudget, shared_budget: c.shared, last_30_days: stats[c.resource] ?? null })),
    keywords: r.snap.keywords.filter((k) => k.status === "ENABLED").sort((x, y) => y.cost - x.cost).slice(0, 150).map((k) => ({ resource: k.resource, text: k.text, match: k.match, campaign: k.campaignName, ad_group: k.adGroupName, cpc: k.cpc, cost: k.cost, clicks: k.clicks, conversions: k.conversions })),
    search_terms_with_spend: r.terms.slice(0, 150).map((t) => ({ term: t.term, campaign_resource: t.campaign, campaign: t.campaignName, cost: t.cost, clicks: t.clicks, conversions: t.conversions })),
    existing_negatives: r.snap.negatives.slice(0, 300).map((n) => `${n.text} [${n.match}]`),
    recent_changes: recent.slice(0, 40),
  };
  const obj = await askStructured<{ summary?: string; actions?: unknown[] }>(orgId, SYSTEM, input, {
    type: "object", required: ["summary", "actions"],
    properties: {
      summary: { type: "string" },
      actions: { type: "array", items: { type: "object", required: ["kind", "target", "reason"], properties: {
        kind: { type: "string", enum: ["pause_keyword", "add_negative", "set_keyword_bid", "set_budget"] }, target: { type: "string" },
        value: { type: "number" }, text: { type: "string" }, match: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] }, reason: { type: "string" } } } },
    },
  }, { maxTokens: 4000, timeoutMs: 120_000 });
  const kinds: ActionKind[] = ["pause_keyword", "add_negative", "set_keyword_bid", "set_budget"];
  const actions = (Array.isArray(obj.actions) ? obj.actions : []).flatMap((x): Proposal[] => {
    const o = x as Record<string, unknown>;
    if (!kinds.includes(o.kind as ActionKind) || typeof o.target !== "string") return [];
    return [{ kind: o.kind as ActionKind, target: o.target, value: typeof o.value === "number" ? o.value : Number(o.value) || undefined, text: typeof o.text === "string" ? o.text : undefined, match: o.match === "PHRASE" || o.match === "BROAD" ? o.match : "EXACT", reason: String(o.reason ?? "").slice(0, 400) || "No reason given" }];
  });
  return { summary: String(obj.summary ?? "").slice(0, 1500), actions };
}

/** Make one change in Google Ads. Returns what's needed to undo it. */
export async function applyChange(ctx: SyncContext, customerId: string, d: Pick<Decided, "p" | "after">): Promise<Record<string, unknown>> {
  const p = d.p;
  if (p.kind === "set_budget") { await adsMutate(ctx, customerId, "campaignBudgets", [{ update: { resourceName: p.target, amountMicros: toMicros(p.value!) }, updateMask: "amount_micros" }]); return d.after; }
  if (p.kind === "set_keyword_bid") { await adsMutate(ctx, customerId, "adGroupCriteria", [{ update: { resourceName: p.target, cpcBidMicros: toMicros(p.value!) }, updateMask: "cpc_bid_micros" }]); return d.after; }
  if (p.kind === "pause_keyword") { await adsMutate(ctx, customerId, "adGroupCriteria", [{ update: { resourceName: p.target, status: "PAUSED" }, updateMask: "status" }]); return d.after; }
  const r = await adsMutate(ctx, customerId, "campaignCriteria", [{ create: { campaign: p.target, negative: true, keyword: { text: p.text, matchType: p.match ?? "EXACT" } } }]);
  return { ...d.after, resource: r.results?.[0]?.resourceName ?? null };
}

/** Put a change back the way it was. */
export async function undoChange(ctx: SyncContext, customerId: string, c: { kind: string; target: string; before: Record<string, unknown>; after: Record<string, unknown> }) {
  if (c.kind === "set_budget") return adsMutate(ctx, customerId, "campaignBudgets", [{ update: { resourceName: c.target, amountMicros: toMicros(Number(c.before.daily)) }, updateMask: "amount_micros" }]);
  if (c.kind === "set_keyword_bid") return adsMutate(ctx, customerId, "adGroupCriteria", [{ update: { resourceName: c.target, cpcBidMicros: toMicros(Number(c.before.cpc)) }, updateMask: "cpc_bid_micros" }]);
  if (c.kind === "pause_keyword") return adsMutate(ctx, customerId, "adGroupCriteria", [{ update: { resourceName: c.target, status: "ENABLED" }, updateMask: "status" }]);
  if (c.kind === "add_negative" && typeof c.after.resource === "string") return adsMutate(ctx, customerId, "campaignCriteria", [{ remove: c.after.resource }]);
  // a campaign made here (created paused): undo removes it
  if (c.kind === "create_campaign" && typeof c.after.resource === "string") return adsMutate(ctx, customerId, "campaigns", [{ remove: c.after.resource }]);
  throw new Error("This change can't be undone automatically — change it back in Google Ads.");
}

/** The AI review for one client. Never throws; the outcome is on the run row. */
export async function runAccount(ctx: SyncContext, a: MkAccount, requestedBy: string | null = null): Promise<string> {
  if (a.mode === "off") return `${a.name}: AI is off`;
  if (!a.ads_customer_id) return `${a.name}: no Google Ads account linked`;
  if (!adsReady()) return `${a.name}: Google Ads developer token not set`;
  const { data: run, error } = await ctx.db.from("mk_runs").insert({ organisation_id: a.organisation_id, account_id: a.id, requested_by: requestedBy }).select("id").single();
  if (error) return `${a.name}: ${error.message}`;
  try {
    const review = await readAccount(ctx, a);
    const since = addDaysISO(todayISO(ctx.org.timezone), -21);
    const { data: recent } = await ctx.db.from("mk_changes").select("kind, label, status, created_at").eq("account_id", a.id).gte("created_at", since).in("status", ["applied", "undone", "rejected"]).order("created_at", { ascending: false }).limit(40);
    const ai = await askAi(a.organisation_id, a, review, (recent ?? []) as { kind: string; label: string; status: string; created_at: string }[]);
    const lim: Limits = { monthlyCap: a.monthly_cap, maxChanges: a.max_changes, mode: a.mode };
    const decided = decide(ai.actions, review.snap, lim);
    const auto = applyAutomatically(lim);
    let applied = 0;
    for (const d of decided) {
      const row: Record<string, unknown> = { organisation_id: a.organisation_id, account_id: a.id, run_id: run.id, kind: d.p.kind, target: d.p.target, label: d.label.slice(0, 300), before: d.before, after: d.after, reason: d.ok ? d.p.reason : `${d.p.reason} — not made: ${d.why}`, by_ai: true };
      if (!d.ok) row.status = "blocked";
      else if (!auto) row.status = "proposed";
      else {
        try { row.after = await applyChange(ctx, a.ads_customer_id, d); row.status = "applied"; row.applied_at = new Date().toISOString(); applied++; }
        catch (e) { row.status = "failed"; row.error = adsErrorText(e); }
      }
      await ctx.db.from("mk_changes").insert(row);
    }
    const proposed = decided.filter((d) => d.ok).length;
    const note = auto ? `${applied} change${applied === 1 ? "" : "s"} made` : `${proposed} change${proposed === 1 ? "" : "s"} waiting for approval${a.mode === "auto" && a.monthly_cap == null ? " (set a monthly cap to let it apply them)" : ""}`;
    await ctx.db.from("mk_runs").update({ status: "done", finished_at: new Date().toISOString(), summary: ai.summary || note, changes: auto ? applied : proposed }).eq("id", run.id);
    await ctx.db.from("mk_accounts").update({ last_run_at: new Date().toISOString() }).eq("id", a.id);
    return `${a.name}: ${note}`;
  } catch (e) {
    const msg = adsErrorText(e) || errMessage(e);
    await ctx.db.from("mk_runs").update({ status: "error", finished_at: new Date().toISOString(), error: msg.slice(0, 1000) }).eq("id", run.id);
    return `${a.name}: ${msg}`;
  }
}
