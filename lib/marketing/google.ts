import "server-only";
import { ApiError, apiJSON, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Google APIs for the Marketing add-on, all through the business's "google_marketing" connection.
 *
 * Google Ads API (REST) — https://developers.google.com/google-ads/api/rest/overview
 *   GET  https://googleads.googleapis.com/{v}/customers:listAccessibleCustomers
 *   POST https://googleads.googleapis.com/{v}/customers/{id}/googleAds:search      { query, pageToken }
 *   POST https://googleads.googleapis.com/{v}/customers/{id}/{service}:mutate      { operations: [...] }
 *   headers: developer-token (GOOGLE_ADS_DEVELOPER_TOKEN), login-customer-id (the manager account, when the client is under one)
 *   Version: GOOGLE_ADS_API_VERSION, default v26 (Oct 2026 — https://developers.google.com/google-ads/api/docs/release-notes).
 *   REST JSON uses camelCase field names; int64 values (micros) come back as strings.
 * GA4 Data API — POST https://analyticsdata.googleapis.com/v1beta/{property}:runReport
 * GA4 Admin API — GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries
 * Search Console — GET https://www.googleapis.com/webmasters/v3/sites
 *                  POST https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query
 */

export const adsVersion = () => process.env.GOOGLE_ADS_API_VERSION?.trim() || "v26";
export const adsReady = () => !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
const ADS = () => `https://googleads.googleapis.com/${adsVersion()}`;

export class AdsNotReady extends Error {
  constructor() { super("Google Ads isn't switched on yet: GOOGLE_ADS_DEVELOPER_TOKEN isn't set in Vercel (Google Ads manager account → Admin → API Center)."); }
}

function adsHeaders(loginCustomerId?: string | null): Record<string, string> {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!token) throw new AdsNotReady();
  // null → the manager account from the environment; "" → no login-customer-id at all
  const login = (loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "");
  return { "developer-token": token, "content-type": "application/json", ...(login ? { "login-customer-id": login } : {}) };
}

/** Turn a Google Ads error body into one readable sentence. */
export function adsErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    try {
      const j = JSON.parse(e.body) as { error?: { message?: string; details?: { errors?: { message?: string }[] }[] } };
      const inner = j.error?.details?.flatMap((d) => d.errors ?? []).map((x) => x.message).filter(Boolean)[0];
      return (inner ?? j.error?.message ?? e.message).slice(0, 400);
    } catch { return e.message.slice(0, 400); }
  }
  return e instanceof Error ? e.message.slice(0, 400) : String(e);
}

export async function googleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google didn't say which account this is (${res.status}).`);
  const j = (await res.json()) as { email?: string };
  if (!j.email) throw new Error("Google didn't return the account's email address.");
  return j.email;
}

// ---------------------------------------------------------------- Google Ads

export interface AdsCustomer { id: string; name: string; currency: string | null; manager: boolean; testAccount: boolean }

/** Every Ads account this login can reach: its own, and (through a manager account) the clients linked under it. */
export async function listAdsCustomers(ctx: SyncContext): Promise<AdsCustomer[]> {
  const r = await apiJSON<{ resourceNames?: string[] }>(ctx, `${ADS()}/customers:listAccessibleCustomers`, { headers: adsHeaders(null) }, "Google Ads");
  const ids = (r.resourceNames ?? []).map((n) => n.split("/")[1]).filter(Boolean);
  const out = new Map<string, AdsCustomer>();
  for (const id of ids.slice(0, 25)) {
    try {
      // the account itself, and every account under it if it's a manager
      const rows = await adsSearch<{ customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; testAccount?: boolean; status?: string } }>(ctx, id,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.test_account, customer_client.status FROM customer_client WHERE customer_client.level <= 1", id);
      for (const x of rows) {
        const c = x.customerClient;
        if (!c?.id || (c.status && c.status !== "ENABLED")) continue;
        out.set(c.id, { id: c.id, name: c.descriptiveName || c.id, currency: c.currencyCode ?? null, manager: !!c.manager, testAccount: !!c.testAccount });
      }
    } catch { out.set(id, out.get(id) ?? { id, name: id, currency: null, manager: false, testAccount: false }); }
  }
  return [...out.values()].sort((a, b) => Number(a.manager) - Number(b.manager) || a.name.localeCompare(b.name));
}

/**
 * Which account to send as login-customer-id for a client: the account itself when this login reaches it directly,
 * otherwise the manager account (GOOGLE_ADS_LOGIN_CUSTOMER_ID). Worked out once per client and remembered.
 */
const routes = new Map<string, string | null>();
async function loginFor(ctx: SyncContext, customerId: string): Promise<string | null> {
  const key = `${ctx.integration.id}:${customerId}`;
  if (routes.has(key)) return routes.get(key)!;
  const tryLogin = async (login: string | null) => {
    try {
      await apiJSON(ctx, `${ADS()}/customers/${customerId}/googleAds:search`, { method: "POST", headers: adsHeaders(login ?? ""), body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }) }, "Google Ads");
      return true;
    } catch (e) { if (e instanceof AdsNotReady) throw e; return false; }
  };
  const mcc = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "") || null;
  const chosen = (await tryLogin(customerId)) ? customerId : mcc && (await tryLogin(mcc)) ? mcc : customerId;
  routes.set(key, chosen);
  return chosen;
}

/** GAQL search, every page. loginCustomerId: the account the client is reached through (worked out when not given). */
export async function adsSearch<T>(ctx: SyncContext, customerId: string, query: string, loginCustomerId?: string | null): Promise<T[]> {
  if (loginCustomerId === undefined) loginCustomerId = await loginFor(ctx, customerId);
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 50; i++) {
    const r = await apiJSON<{ results?: T[]; nextPageToken?: string }>(ctx, `${ADS()}/customers/${customerId}/googleAds:search`, {
      method: "POST", headers: adsHeaders(loginCustomerId), body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
    }, "Google Ads");
    out.push(...(r.results ?? []));
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out;
}

/** Headers for a raw Ads call to one client (developer token + the login route that reaches it). */
export async function adsHeadersPublic(ctx: SyncContext, customerId: string): Promise<Record<string, string>> {
  return adsHeaders(await loginFor(ctx, customerId));
}

/** One mutate call. service e.g. "campaignBudgets", "adGroupCriteria", "campaignCriteria", "adGroups". */
export async function adsMutate(ctx: SyncContext, customerId: string, service: string, operations: unknown[], validateOnly = false): Promise<{ results?: { resourceName?: string }[] }> {
  return apiJSON(ctx, `${ADS()}/customers/${customerId}/${service}:mutate`, {
    method: "POST", headers: adsHeaders(await loginFor(ctx, customerId)), body: JSON.stringify({ operations, ...(validateOnly ? { validateOnly: true } : {}) }),
  }, "Google Ads");
}

// ---------------------------------------------------------------- GA4

export interface Ga4Property { property: string; name: string; account: string }

export async function listGa4Properties(ctx: SyncContext): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await apiJSON<{ accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[]; nextPageToken?: string }>(ctx,
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {}, "Google Analytics");
    for (const a of r.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) out.push({ property: p.property, name: p.displayName ?? p.property, account: a.displayName ?? "" });
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface Ga4Row { dims: string[]; metrics: number[] }

export async function ga4Report(ctx: SyncContext, property: string, body: { startDate: string; endDate: string; dimensions: string[]; metrics: string[]; limit?: number; orderByMetric?: string }): Promise<Ga4Row[]> {
  const r = await apiJSON<{ rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] }>(ctx, `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: body.startDate, endDate: body.endDate }],
      dimensions: body.dimensions.map((name) => ({ name })), metrics: body.metrics.map((name) => ({ name })),
      limit: String(body.limit ?? 10000),
      ...(body.orderByMetric ? { orderBys: [{ metric: { metricName: body.orderByMetric }, desc: true }] } : {}),
    }),
  }, "Google Analytics");
  return (r.rows ?? []).map((x) => ({ dims: (x.dimensionValues ?? []).map((d) => d.value ?? ""), metrics: (x.metricValues ?? []).map((m) => Number(m.value ?? 0) || 0) }));
}

// ---------------------------------------------------------------- Search Console

export async function listGscSites(ctx: SyncContext): Promise<{ site: string; permission: string }[]> {
  const r = await apiJSON<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(ctx, "https://www.googleapis.com/webmasters/v3/sites", {}, "Search Console");
  return (r.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => ({ site: s.siteUrl, permission: s.permissionLevel })).sort((a, b) => a.site.localeCompare(b.site));
}

export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

export async function gscQuery(ctx: SyncContext, site: string, body: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number }): Promise<GscRow[]> {
  const r = await apiJSON<{ rows?: GscRow[] }>(ctx, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, rowLimit: body.rowLimit ?? 25000, dataState: "final" }),
  }, "Search Console");
  return r.rows ?? [];
}
