import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import { adsHeadersPublic, adsVersion } from "./google";
import { apiJSON } from "@/lib/integrations/runtime";

/**
 * Create a Google Search campaign — always PAUSED, so nothing is spent until someone switches it on in Google Ads.
 * One atomic googleAds:mutate (all or nothing): budget, campaign (search only, manual CPC so the optimiser can tune
 * keyword bids), English, a radius around a point, negatives, one ad group, keywords and a responsive search ad.
 * https://developers.google.com/google-ads/api/rest/reference/rest/v26/customers.googleAds/mutate
 */
export interface CampaignSpec {
  name: string; dailyBudget: number; finalUrl: string; defaultCpc: number;
  centre: { lat: number; lng: number; label: string }; radiusKm: number;
  keywords: { text: string; match: "EXACT" | "PHRASE" | "BROAD" }[];
  negatives: string[];
  headlines: string[]; descriptions: string[]; path1?: string; path2?: string;
}

export function checkSpec(s: CampaignSpec): string | null {
  if (!s.name.trim()) return "Give the campaign a name.";
  if (!(s.dailyBudget >= 1)) return "Set a daily budget.";
  if (!/^https:\/\/[^\s]+$/.test(s.finalUrl)) return "The landing page must be a full https:// address.";
  if (!(s.defaultCpc >= 0.1)) return "Set a starting bid of at least $0.10.";
  if (!(s.radiusKm >= 1 && s.radiusKm <= 500)) return "Radius must be between 1 and 500 km.";
  if (!s.keywords.length) return "Add at least one keyword.";
  if (s.keywords.some((k) => !k.text.trim() || k.text.length > 80)) return "A keyword is empty or too long.";
  if (s.headlines.length < 3 || s.headlines.length > 15) return "A responsive search ad needs 3 to 15 headlines.";
  if (s.headlines.some((h) => h.length > 30)) return `Headline too long (30 characters max): “${s.headlines.find((h) => h.length > 30)}”.`;
  if (s.descriptions.length < 2 || s.descriptions.length > 4) return "It needs 2 to 4 descriptions.";
  if (s.descriptions.some((d) => d.length > 90)) return `Description too long (90 characters max): “${s.descriptions.find((d) => d.length > 90)}”.`;
  if ((s.path1 ?? "").length > 15 || (s.path2 ?? "").length > 15) return "Display paths are 15 characters max.";
  return null;
}

const micros = (n: number) => String(Math.round(n * 100) * 10000);

export async function createSearchCampaign(ctx: SyncContext, customerId: string, s: CampaignSpec): Promise<{ campaign: string; budget: string }> {
  const c = `customers/${customerId}`;
  const budget = `${c}/campaignBudgets/-1`, campaign = `${c}/campaigns/-2`, adGroup = `${c}/adGroups/-3`;
  const ops: Record<string, unknown>[] = [
    { campaignBudgetOperation: { create: { resourceName: budget, name: `${s.name} budget ${Date.now()}`, amountMicros: micros(s.dailyBudget), deliveryMethod: "STANDARD", explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: campaign, name: s.name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget, manualCpc: {},
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE", negativeGeoTargetType: "PRESENCE" },
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    } } },
    { campaignCriterionOperation: { create: { campaign, language: { languageConstant: "languageConstants/1000" } } } }, // English
    { campaignCriterionOperation: { create: { campaign, proximity: { geoPoint: { latitudeInMicroDegrees: Math.round(s.centre.lat * 1e6), longitudeInMicroDegrees: Math.round(s.centre.lng * 1e6) }, radius: s.radiusKm, radiusUnits: "KILOMETERS" } } } },
    ...s.negatives.filter((n) => n.trim()).map((n) => ({ campaignCriterionOperation: { create: { campaign, negative: true, keyword: { text: n.trim(), matchType: "PHRASE" } } } })),
    { adGroupOperation: { create: { resourceName: adGroup, name: s.name.split("|").pop()?.trim() || "Main", campaign, status: "ENABLED", type: "SEARCH_STANDARD", cpcBidMicros: micros(s.defaultCpc) } } },
    ...s.keywords.map((k) => ({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword: { text: k.text.trim(), matchType: k.match } } } })),
    { adGroupAdOperation: { create: { adGroup, status: "ENABLED", ad: { finalUrls: [s.finalUrl], responsiveSearchAd: {
      headlines: s.headlines.map((text) => ({ text })), descriptions: s.descriptions.map((text) => ({ text })),
      ...(s.path1 ? { path1: s.path1 } : {}), ...(s.path2 ? { path2: s.path2 } : {}),
    } } } } },
  ];
  const r = await apiJSON<{ mutateOperationResponses?: Record<string, { resourceName?: string }>[] }>(ctx, `https://googleads.googleapis.com/${adsVersion()}/customers/${customerId}/googleAds:mutate`, {
    method: "POST", headers: await adsHeadersFor(ctx, customerId), body: JSON.stringify({ mutateOperations: ops }),
  }, "Google Ads");
  const res = r.mutateOperationResponses ?? [];
  const pick = (k: string) => res.map((x) => x[k]?.resourceName).find(Boolean) ?? "";
  return { campaign: pick("campaignResult"), budget: pick("campaignBudgetResult") };
}

const adsHeadersFor = (ctx: SyncContext, customerId: string) => adsHeadersPublic(ctx, customerId);

/** Google's id for a place (e.g. "Australian Capital Territory"), looked up rather than typed in. */
async function geoId(ctx: SyncContext, customerId: string, name: string): Promise<string> {
  const r = await apiJSON<{ geoTargetConstantSuggestions?: { geoTargetConstant?: { resourceName?: string; name?: string; targetType?: string } }[] }>(ctx,
    `https://googleads.googleapis.com/${adsVersion()}/geoTargetConstants:suggest`, {
      method: "POST", headers: await adsHeadersFor(ctx, customerId), body: JSON.stringify({ locale: "en", countryCode: "AU", locationNames: { names: [name] } }),
    }, "Google Ads");
  const hit = (r.geoTargetConstantSuggestions ?? []).map((x) => x.geoTargetConstant).find((g) => g?.resourceName && g.name?.toLowerCase() === name.toLowerCase())
    ?? r.geoTargetConstantSuggestions?.[0]?.geoTargetConstant;
  if (!hit?.resourceName) throw new Error(`Google doesn't know the place “${name}”.`);
  return hit.resourceName;
}

export interface Idea { text: string; monthly: number | null; competition: string | null; low: number | null; high: number | null }

/** Keyword Planner ideas for seed words around a point (searches from Australia, English). */
export async function keywordIdeas(ctx: SyncContext, customerId: string, seeds: string[], url?: string): Promise<Idea[]> {
  type R = { results?: { text?: string; keywordIdeaMetrics?: { avgMonthlySearches?: string; competition?: string; lowTopOfPageBidMicros?: string; highTopOfPageBidMicros?: string } }[]; nextPageToken?: string };
  const body: Record<string, unknown> = {
    language: "languageConstants/1000", geoTargetConstants: [await geoId(ctx, customerId, "Australian Capital Territory")],
    keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false, pageSize: 200,
    ...(url ? { keywordAndUrlSeed: { keywords: seeds.slice(0, 20), url } } : { keywordSeed: { keywords: seeds.slice(0, 20) } }),
  };
  const r = await apiJSON<R>(ctx, `https://googleads.googleapis.com/${adsVersion()}/customers/${customerId}:generateKeywordIdeas`, {
    method: "POST", headers: await adsHeadersFor(ctx, customerId), body: JSON.stringify(body),
  }, "Google Ads");
  const m = (v?: string) => (v ? Math.round(Number(v) / 1e4) / 100 : null);
  return (r.results ?? []).filter((x) => x.text).map((x) => ({
    text: x.text!, monthly: x.keywordIdeaMetrics?.avgMonthlySearches != null ? Number(x.keywordIdeaMetrics.avgMonthlySearches) : null,
    competition: x.keywordIdeaMetrics?.competition ?? null, low: m(x.keywordIdeaMetrics?.lowTopOfPageBidMicros), high: m(x.keywordIdeaMetrics?.highTopOfPageBidMicros),
  })).sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0));
}
