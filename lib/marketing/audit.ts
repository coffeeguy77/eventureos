import "server-only";
import { addDaysISO, todayISO } from "@/lib/format";
import type { SyncContext } from "@/lib/integrations/runtime";
import { ANTHROPIC_URL, anthropicHeaders, parseJSONObject } from "@/lib/ai/claude";
import { orgAiKey } from "@/lib/ai/key";
import { adsReady, adsSearch } from "./google";
import { marketingModel, readAccount } from "./optimiser";
import type { MkAccount } from "./sync";

/**
 * The starting-point audit: a full look at a client's Google Ads (and their GA4 / Search Console figures), written up by
 * Claude with a score, what's good, what's wasting money and what to fix — and the baseline numbers every later
 * monthly report compares against ("since we took over"). Saved in mk_reports with data.kind = "audit".
 */
export interface Baseline { days: number; cost: number; conversions: number; convValue: number; clicks: number; impressions: number; cpa: number | null; ctr: number | null; wasted: number; sessions: number; gscClicks: number; gscPosition: number | null; qualityScore: number | null }
export interface AuditSection { title: string; rating: "good" | "ok" | "poor"; findings: string[]; actions: string[] }
export interface AuditData {
  kind: "audit"; client: string; currency: string; date: string; score: number; headline: string; summary: string;
  sections: AuditSection[]; baseline: Baseline; landingPages: { url: string; status: string }[];
}

async function pageText(url: string): Promise<{ status: string; text: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "EventureOS marketing audit" }, redirect: "follow" });
    if (!res.ok) return { status: `HTTP ${res.status}`, text: "" };
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
    return { status: "ok", text: `TITLE: ${title}\n${text}`.slice(0, 5000) };
  } catch (e) { return { status: e instanceof Error ? e.message.slice(0, 80) : "unreachable", text: "" }; }
}

export async function runAudit(ctx: SyncContext, a: MkAccount): Promise<string> {
  if (!a.ads_customer_id || !adsReady()) throw new Error("Link a Google Ads account first.");
  const id = a.ads_customer_id;
  const review = await readAccount(ctx, a);
  type CA = { conversionAction?: { name?: string; status?: string; category?: string; primaryForGoal?: boolean; type?: string } };
  const convs = await adsSearch<CA>(ctx, id, "SELECT conversion_action.name, conversion_action.status, conversion_action.category, conversion_action.primary_for_goal, conversion_action.type FROM conversion_action WHERE conversion_action.status != 'REMOVED'");
  type AD = { adGroupAd?: { status?: string; adStrength?: string; ad?: { finalUrls?: string[]; type?: string; responsiveSearchAd?: { headlines?: { text?: string }[]; descriptions?: { text?: string }[] } } }; adGroup?: { name?: string }; campaign?: { name?: string; status?: string } };
  const ads = await adsSearch<AD>(ctx, id, "SELECT ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.ad.final_urls, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group.name, campaign.name, campaign.status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND campaign.status != 'REMOVED'");
  type QS = { adGroupCriterion?: { resourceName?: string; qualityInfo?: { qualityScore?: number; creativeQualityScore?: string; postClickQualityScore?: string; searchPredictedCtr?: string } } };
  const qs = await adsSearch<QS>(ctx, id, "SELECT ad_group_criterion.resource_name, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED' AND campaign.status = 'ENABLED'");
  type ST = { campaign?: { name?: string; advertisingChannelType?: string; status?: string; biddingStrategyType?: string }; campaignBudget?: { amountMicros?: string } };
  const camps = await adsSearch<ST>(ctx, id, "SELECT campaign.name, campaign.advertising_channel_type, campaign.status, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'");

  const qMap = new Map(qs.map((q) => [q.adGroupCriterion?.resourceName, q.adGroupCriterion?.qualityInfo]));
  const qVals = qs.map((q) => q.adGroupCriterion?.qualityInfo?.qualityScore).filter((x): x is number => typeof x === "number");
  const wasted = review.terms.filter((t) => t.conversions === 0).reduce((s, t) => s + t.cost, 0);
  const urls = [...new Set(ads.flatMap((x) => x.adGroupAd?.ad?.finalUrls ?? []))].slice(0, 4);
  const pages = await Promise.all(urls.map(async (u) => ({ url: u, ...(await pageText(u)) })));

  // GA4 / Search Console: last 30 days from what's been brought in
  const today = todayISO(ctx.org.timezone), since = addDaysISO(today, -30);
  const { data: daily } = await ctx.db.from("mk_daily").select("source, sessions, clicks, position").eq("account_id", a.id).eq("dim", "").gte("day", since);
  const d = (daily ?? []) as { source: string; sessions: number; clicks: number; position: number | null }[];
  const gscPos = d.filter((x) => x.source === "gsc" && x.position != null).map((x) => Number(x.position));
  const t = review.totals;
  const baseline: Baseline = {
    days: 30, cost: Math.round(t.cost * 100) / 100, conversions: Math.round(t.conversions * 100) / 100, convValue: Math.round(t.convValue * 100) / 100,
    clicks: t.clicks, impressions: t.impressions, cpa: t.conversions > 0 ? Math.round((t.cost / t.conversions) * 100) / 100 : null,
    ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : null, wasted: Math.round(wasted * 100) / 100,
    sessions: d.filter((x) => x.source === "ga4").reduce((s, x) => s + Number(x.sessions), 0),
    gscClicks: d.filter((x) => x.source === "gsc").reduce((s, x) => s + Number(x.clicks), 0),
    gscPosition: gscPos.length ? Math.round((gscPos.reduce((s, x) => s + x, 0) / gscPos.length) * 10) / 10 : null,
    qualityScore: qVals.length ? Math.round((qVals.reduce((s, x) => s + x, 0) / qVals.length) * 10) / 10 : null,
  };

  const input = {
    client: a.name, goals: a.goals, monthly_cap: a.monthly_cap, currency: a.ads_currency ?? "AUD", last_30_days: baseline, spend_this_month: review.snap.monthSpend,
    campaigns: camps.map((c) => ({ name: c.campaign?.name, type: c.campaign?.advertisingChannelType, status: c.campaign?.status, bidding: c.campaign?.biddingStrategyType, daily_budget: Number(c.campaignBudget?.amountMicros ?? 0) / 1e6 })),
    conversion_actions: convs.map((c) => ({ name: c.conversionAction?.name, status: c.conversionAction?.status, category: c.conversionAction?.category, primary: c.conversionAction?.primaryForGoal, type: c.conversionAction?.type })),
    keywords: review.snap.keywords.sort((x, y) => y.cost - x.cost).slice(0, 80).map((k) => ({ text: k.text, match: k.match, status: k.status, campaign: k.campaignName, cost: k.cost, clicks: k.clicks, conversions: k.conversions, cpc: k.cpc, quality: qMap.get(k.resource) ?? null })),
    search_terms: review.terms.slice(0, 80).map((s) => ({ term: s.term, campaign: s.campaignName, cost: s.cost, clicks: s.clicks, conversions: s.conversions })),
    negatives: review.snap.negatives.length,
    ads: ads.slice(0, 30).map((x) => ({ campaign: x.campaign?.name, ad_group: x.adGroup?.name, status: x.adGroupAd?.status, strength: x.adGroupAd?.adStrength, type: x.adGroupAd?.ad?.type, headlines: (x.adGroupAd?.ad?.responsiveSearchAd?.headlines ?? []).map((h) => h.text), descriptions: (x.adGroupAd?.ad?.responsiveSearchAd?.descriptions ?? []).map((h) => h.text), urls: x.adGroupAd?.ad?.finalUrls })),
    landing_pages: pages.map((p) => ({ url: p.url, status: p.status, text: p.text })),
  };
  const system = `You are a senior Google Ads auditor for a small Australian agency. Audit this account as it stands today — this is the starting point the agency's AI manager will be measured against.
Be specific and blunt, use the figures given, never invent numbers. Check: account and campaign structure; conversion tracking (are the right actions primary? any at all?); bidding vs data volume; budgets vs the monthly cap; keywords and match types; search terms wasting money; negatives; ads (strength, relevance, headline count); landing pages (relevance to the ads and keywords, anything wrong or off-topic on the page, calls to action); Quality Score; location/brand issues you can infer. Australian English.
Reply with ONLY JSON: {"score": 0-100, "headline": "one sentence verdict", "summary": "one short paragraph for the business owner", "sections": [{"title": "...", "rating": "good|ok|poor", "findings": ["..."], "actions": ["what we'll do or what they need to do"]}]}. 5–8 sections.`;
  const key = await orgAiKey(a.organisation_id);
  if (!key) throw new Error("No Claude API key.");
  const res = await fetch(ANTHROPIC_URL, { method: "POST", headers: anthropicHeaders(key), signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ model: marketingModel(), max_tokens: 5000, temperature: 0, system, messages: [{ role: "user", content: JSON.stringify(input) }] }) });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  const o = parseJSONObject(j.content?.find((c) => c.type === "text")?.text ?? "");
  const sections = (Array.isArray(o.sections) ? o.sections : []).map((x) => { const s = x as Record<string, unknown>; return {
    title: String(s.title ?? ""), rating: (["good", "ok", "poor"].includes(String(s.rating)) ? s.rating : "ok") as AuditSection["rating"],
    findings: (Array.isArray(s.findings) ? s.findings : []).map(String).slice(0, 12), actions: (Array.isArray(s.actions) ? s.actions : []).map(String).slice(0, 8),
  }; }).filter((s) => s.title);
  const data: AuditData = {
    kind: "audit", client: a.name, currency: a.ads_currency ?? "AUD", date: today, score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
    headline: String(o.headline ?? "").slice(0, 300), summary: String(o.summary ?? "").slice(0, 2000), sections, baseline,
    landingPages: pages.map((p) => ({ url: p.url, status: p.status })),
  };
  const { data: row, error } = await ctx.db.from("mk_reports").upsert({ organisation_id: a.organisation_id, account_id: a.id, period_start: today, period_end: today, data, commentary: data.summary, updated_at: new Date().toISOString() }, { onConflict: "account_id,period_start" }).select("id").single();
  if (error) throw new Error(error.message);
  return row.id as string;
}
