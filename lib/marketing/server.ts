import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runReport, ga4Configured } from "./ga4";
import { METRIC_FIELDS, parseTotals, parseChannels, parseDaily, buildReport, type MarketingReport } from "./core";

export interface MarketingConnection {
  id: string;
  organisation_id: string;
  customer_id: string | null;
  label: string;
  provider: string;
  ga4_property_id: string;
  currency: string;
  status: string;
}

const CONN_SELECT = "id, organisation_id, customer_id, label, provider, ga4_property_id, currency, status";

export async function listConnections(supabase: SupabaseClient, orgId: string): Promise<MarketingConnection[]> {
  const { data, error } = await supabase
    .from("marketing_connections")
    .select(CONN_SELECT)
    .eq("organisation_id", orgId)
    .eq("status", "active")
    .order("label");
  if (error) throw new Error(`Couldn't load the marketing clients: ${error.message}`);
  return (data ?? []) as MarketingConnection[];
}

export async function getConnection(supabase: SupabaseClient, orgId: string, id: string): Promise<MarketingConnection | null> {
  const { data, error } = await supabase.from("marketing_connections").select(CONN_SELECT).eq("organisation_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load that client: ${error.message}`);
  return (data as MarketingConnection | null) ?? null;
}

/** Equal-length current and previous windows as GA4 relative dates. */
function windows(days: number) {
  return {
    current: { startDate: `${days - 1}daysAgo`, endDate: "today" },
    previous: { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo` },
  };
}

export type ReportResult =
  | { ok: true; report: MarketingReport }
  | { ok: false; reason: "no-credentials" | "no-access"; message?: undefined }
  | { ok: false; reason: "error"; message: string };

/** Pull one client's GA4 figures. Returns an honest result rather than throwing, so the page can explain what's missing. */
export async function loadReport(propertyId: string, days: number): Promise<ReportResult> {
  if (!ga4Configured()) return { ok: false, reason: "no-credentials" };
  const w = windows(days);
  try {
    const [curTotals, prevTotals, channels, daily] = await Promise.all([
      runReport(propertyId, { dateRanges: [w.current], metrics: METRIC_FIELDS }),
      runReport(propertyId, { dateRanges: [w.previous], metrics: METRIC_FIELDS }),
      runReport(propertyId, { dateRanges: [w.current], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: METRIC_FIELDS, limit: 25 }),
      runReport(propertyId, { dateRanges: [w.current], dimensions: [{ name: "date" }], metrics: METRIC_FIELDS, orderBys: [{ dimension: { dimensionName: "date" } }], limit: 400 }),
    ]);
    const report = buildReport({
      days,
      current: parseTotals(curTotals),
      previous: parseTotals(prevTotals),
      channels: parseChannels(channels),
      daily: parseDaily(daily),
    });
    return { ok: true, report };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NOT_CONFIGURED") return { ok: false, reason: "no-credentials" };
    if (msg === "NO_ACCESS") return { ok: false, reason: "no-access" };
    return { ok: false, reason: "error", message: msg };
  }
}
