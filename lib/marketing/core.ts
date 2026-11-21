/**
 * Marketing report shaping — turns raw GA4 Data API responses into the numbers the dashboard shows.
 * Pure (no network, no database) so it can be reasoned about and tested on its own.
 *
 * GA4 Data API field names used (confirmed against Google's Data API schema):
 *   metrics:    sessions, totalUsers, ecommercePurchases, purchaseRevenue
 *   dimensions: sessionDefaultChannelGroup, date
 */
import type { Ga4Report, Ga4Row } from "./ga4";

/** The metrics we always request, in this order. Parsers read metric values by this index. */
export const METRICS = ["sessions", "totalUsers", "ecommercePurchases", "purchaseRevenue"] as const;
export const METRIC_FIELDS = METRICS.map((name) => ({ name }));

export interface Totals {
  sessions: number;
  users: number;
  purchases: number;
  revenue: number;
  /** purchases ÷ sessions, as a fraction (0–1) */
  convRate: number;
  /** revenue ÷ purchases */
  aov: number;
}

export interface ChannelRow {
  channel: string;
  sessions: number;
  purchases: number;
  revenue: number;
  /** share of sessions, as a fraction (0–1) */
  share: number;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  sessions: number;
  purchases: number;
  revenue: number;
}

export interface MarketingReport {
  days: number;
  current: Totals;
  previous: Totals;
  /** change vs previous period, as a fraction (e.g. 0.12 = +12%); null when the previous value was 0 */
  deltas: Record<keyof Totals, number | null>;
  channels: ChannelRow[];
  daily: DailyPoint[];
  /** the channels GA4 counts as Google Ads traffic, pulled out for the headline */
  googleAds: ChannelRow | null;
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** The Google Ads channels in GA4's default channel grouping. */
const GOOGLE_ADS_CHANNELS = new Set(["Paid Search", "Paid Shopping", "Paid Social", "Display", "Paid Video", "Cross-network"]);

function totalsFromMetricValues(values: { value: string }[] | undefined): Totals {
  const v = values ?? [];
  const sessions = num(v[0]?.value);
  const users = num(v[1]?.value);
  const purchases = num(v[2]?.value);
  const revenue = num(v[3]?.value);
  return {
    sessions,
    users,
    purchases,
    revenue,
    convRate: sessions ? purchases / sessions : 0,
    aov: purchases ? revenue / purchases : 0,
  };
}

/** Totals from a no-dimension report (one row, or GA4's total). */
export function parseTotals(report: Ga4Report): Totals {
  const row = report.rows[0];
  return totalsFromMetricValues(row?.metricValues);
}

/** One row per sessionDefaultChannelGroup, biggest first by sessions. */
export function parseChannels(report: Ga4Report): ChannelRow[] {
  const rows = report.rows.map((r: Ga4Row) => {
    const t = totalsFromMetricValues(r.metricValues);
    return { channel: r.dimensionValues[0]?.value || "(other)", sessions: t.sessions, purchases: t.purchases, revenue: t.revenue, share: 0 };
  });
  const totalSessions = rows.reduce((a, r) => a + r.sessions, 0) || 1;
  for (const r of rows) r.share = r.sessions / totalSessions;
  return rows.sort((a, b) => b.sessions - a.sessions);
}

/** Daily points oldest-first; GA4 returns the date as YYYYMMDD. */
export function parseDaily(report: Ga4Report): DailyPoint[] {
  return report.rows
    .map((r: Ga4Row) => {
      const d = r.dimensionValues[0]?.value || "";
      const t = totalsFromMetricValues(r.metricValues);
      return { day: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d, sessions: t.sessions, purchases: t.purchases, revenue: t.revenue };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

/** Combine the four GA4 reports (current totals, previous totals, channels, daily) into the dashboard report. */
export function buildReport(args: {
  days: number;
  current: Totals;
  previous: Totals;
  channels: ChannelRow[];
  daily: DailyPoint[];
}): MarketingReport {
  const { days, current, previous, channels, daily } = args;
  const keys = ["sessions", "users", "purchases", "revenue", "convRate", "aov"] as const;
  const deltas = {} as Record<keyof Totals, number | null>;
  for (const k of keys) deltas[k] = delta(current[k], previous[k]);

  // Fold all Google-Ads channels into one headline row
  const adsParts = channels.filter((c) => GOOGLE_ADS_CHANNELS.has(c.channel));
  const googleAds = adsParts.length
    ? adsParts.reduce<ChannelRow>(
        (acc, c) => ({ channel: "Google Ads", sessions: acc.sessions + c.sessions, purchases: acc.purchases + c.purchases, revenue: acc.revenue + c.revenue, share: acc.share + c.share }),
        { channel: "Google Ads", sessions: 0, purchases: 0, revenue: 0, share: 0 }
      )
    : null;

  return { days, current, previous, deltas, channels, daily, googleAds };
}
