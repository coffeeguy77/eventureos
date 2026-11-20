import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { ANTHROPIC_URL, anthropicHeaders } from "@/lib/ai/claude";
import { orgAiKey } from "@/lib/ai/key";
import { gscQuery } from "./google";
import { marketingModel } from "./optimiser";
import type { MkAccount } from "./sync";

/**
 * A client's monthly report: Google Ads (with the month before and the same month last year), GA4 by channel,
 * Search Console (with top searches), and what the AI changed — plus plain-English commentary written by Claude.
 * Saved in mk_reports (one per account per month) and shown to the client at /marketing-report/<token>.
 */
export interface Totals { impressions: number; clicks: number; cost: number; conversions: number; conv_value: number; sessions: number; users: number; position: number | null; days: number }
export interface ReportData {
  client: string; currency: string; period: { start: string; end: string; label: string };
  ads: { now: Totals; prev: Totals; lastYear: Totals; campaigns: { name: string; cost: number; clicks: number; conversions: number; conv_value: number }[]; daily: { day: string; cost: number; conversions: number; clicks: number }[] } | null;
  ga4: { now: Totals; prev: Totals; lastYear: Totals; channels: { name: string; sessions: number; conversions: number }[] } | null;
  gsc: { now: Totals; prev: Totals; lastYear: Totals; queries: { query: string; clicks: number; impressions: number; position: number }[] } | null;
  changes: { label: string; kind: string; reason: string; at: string; status: string }[];
  /** the starting-point audit's 30-day figures, to show improvement since we took over */
  start?: { date: string; score: number; cost: number; conversions: number; cpa: number | null; ctr: number | null; clicks: number } | null;
}

const zero = (): Totals => ({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conv_value: 0, sessions: 0, users: 0, position: null, days: 0 });
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
export function monthRange(year: number, month0: number) {
  const s = new Date(Date.UTC(year, month0, 1)), e = new Date(Date.UTC(year, month0 + 1, 0));
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
}
const shift = (iso: string, months: number) => { const d = new Date(`${iso}T12:00:00Z`); return monthRange(d.getUTCFullYear(), d.getUTCMonth() + months); };

type Row = { source: string; day: string; dim: string; dim_name: string | null; impressions: number; clicks: number; cost: number; conversions: number; conv_value: number; sessions: number; users: number; position: number | null };

async function rows(db: SupabaseClient, accountId: string, from: string, to: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await db.from("mk_daily").select("source, day, dim, dim_name, impressions, clicks, cost, conversions, conv_value, sessions, users, position")
      .eq("account_id", accountId).gte("day", from).lte("day", to).order("day").order("source").order("dim").range(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function total(rs: Row[], source: string): Totals {
  const t = zero();
  let posSum = 0, posW = 0;
  for (const r of rs) {
    if (r.source !== source || r.dim !== "") continue;
    t.days++; t.impressions += Number(r.impressions); t.clicks += Number(r.clicks); t.cost += Number(r.cost); t.conversions += Number(r.conversions); t.conv_value += Number(r.conv_value);
    t.sessions += Number(r.sessions); t.users += Number(r.users);
    if (r.position != null) { posSum += Number(r.position) * Math.max(1, Number(r.impressions)); posW += Math.max(1, Number(r.impressions)); }
  }
  t.position = posW ? Math.round((posSum / posW) * 10) / 10 : null;
  t.cost = Math.round(t.cost * 100) / 100; t.conversions = Math.round(t.conversions * 100) / 100; t.conv_value = Math.round(t.conv_value * 100) / 100;
  return t;
}

export async function buildReportData(db: SupabaseClient, ctx: SyncContext | null, a: MkAccount, start: string, end: string): Promise<ReportData> {
  const prev = shift(start, -1), ly = shift(start, -12);
  const [now, before, lastYear] = await Promise.all([rows(db, a.id, start, end), rows(db, a.id, prev.start, prev.end), rows(db, a.id, ly.start, ly.end)]);
  const has = (s: string) => now.some((r) => r.source === s) || before.some((r) => r.source === s);
  const byDim = (s: string) => {
    const m = new Map<string, { name: string; cost: number; clicks: number; conversions: number; conv_value: number; sessions: number }>();
    for (const r of now) {
      if (r.source !== s || r.dim === "") continue;
      const o = m.get(r.dim) ?? { name: r.dim_name ?? r.dim, cost: 0, clicks: 0, conversions: 0, conv_value: 0, sessions: 0 };
      o.cost += Number(r.cost); o.clicks += Number(r.clicks); o.conversions += Number(r.conversions); o.conv_value += Number(r.conv_value); o.sessions += Number(r.sessions);
      m.set(r.dim, o);
    }
    return [...m.values()];
  };
  let queries: { query: string; clicks: number; impressions: number; position: number }[] = [];
  if (ctx && a.gsc_site) {
    try {
      const q = await gscQuery(ctx, a.gsc_site, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 15 });
      queries = q.map((x) => ({ query: x.keys[0] ?? "", clicks: x.clicks, impressions: x.impressions, position: Math.round(x.position * 10) / 10 }));
    } catch { /* report still builds without top searches */ }
  }
  const { data: ch } = await db.from("mk_changes").select("label, kind, reason, created_at, status").eq("account_id", a.id).in("status", ["applied", "undone"])
    .gte("created_at", `${start}T00:00:00Z`).lte("created_at", `${end}T23:59:59Z`).order("created_at");
  const { data: aud } = await db.from("mk_reports").select("data").eq("account_id", a.id).eq("data->>kind", "audit").order("period_start").limit(1).maybeSingle();
  const ab = (aud?.data as { date?: string; score?: number; baseline?: { cost: number; conversions: number; cpa: number | null; ctr: number | null; clicks: number } } | undefined);
  const startFig = ab?.baseline && ab.date && ab.date <= end ? { date: ab.date, score: Number(ab.score ?? 0), cost: ab.baseline.cost, conversions: ab.baseline.conversions, cpa: ab.baseline.cpa, ctr: ab.baseline.ctr, clicks: ab.baseline.clicks } : null;
  return {
    start: startFig,
    client: a.name, currency: a.ads_currency ?? "AUD", period: { start, end, label: monthName(start) },
    ads: has("ads") ? {
      now: total(now, "ads"), prev: total(before, "ads"), lastYear: total(lastYear, "ads"),
      campaigns: byDim("ads").map((c) => ({ name: c.name, cost: Math.round(c.cost * 100) / 100, clicks: c.clicks, conversions: Math.round(c.conversions * 100) / 100, conv_value: Math.round(c.conv_value * 100) / 100 })).sort((x, y) => y.cost - x.cost),
      daily: now.filter((r) => r.source === "ads" && r.dim === "").map((r) => ({ day: r.day, cost: Number(r.cost), conversions: Number(r.conversions), clicks: Number(r.clicks) })),
    } : null,
    ga4: has("ga4") ? { now: total(now, "ga4"), prev: total(before, "ga4"), lastYear: total(lastYear, "ga4"), channels: byDim("ga4").map((c) => ({ name: c.name, sessions: c.sessions, conversions: Math.round(c.conversions * 100) / 100 })).sort((x, y) => y.sessions - x.sessions) } : null,
    gsc: has("gsc") ? { now: total(now, "gsc"), prev: total(before, "gsc"), lastYear: total(lastYear, "gsc"), queries } : null,
    changes: ((ch ?? []) as { label: string; kind: string; reason: string; created_at: string; status: string }[]).map((c) => ({ label: c.label, kind: c.kind, reason: c.reason, at: c.created_at, status: c.status })),
  };
}

export async function writeCommentary(orgId: string, agency: string, a: MkAccount, d: ReportData): Promise<string | null> {
  const key = await orgAiKey(orgId);
  if (!key) return null;
  const system = `You write the commentary for ${agency}'s monthly digital marketing report to a small-business client in Australia. Plain, warm, specific, Australian English. 3 short paragraphs, then up to 3 bullet points of what's next. Use the numbers given; compare with last month and the same month last year where there is data; never invent figures; say plainly if something got worse and what is being done. Mention the changes made to their Google Ads in a sentence (not a list). No headings, no sign-off.`;
  try {
    const res = await fetch(ANTHROPIC_URL, { method: "POST", headers: anthropicHeaders(key), signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: marketingModel(), max_tokens: 1200, temperature: 0.3, system, messages: [{ role: "user", content: JSON.stringify({ goals: a.goals, report: { ...d, ads: d.ads ? { ...d.ads, daily: undefined } : null } }) }] }) });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    return j.content?.find((c) => c.type === "text")?.text?.trim() ?? null;
  } catch { return null; }
}

/** Build (or rebuild) the report for one month. */
export async function makeReport(db: SupabaseClient, ctx: SyncContext | null, a: MkAccount, agency: string, start: string, end: string): Promise<string> {
  const data = await buildReportData(db, ctx, a, start, end);
  const commentary = await writeCommentary(a.organisation_id, agency, a, data);
  const { data: row, error } = await db.from("mk_reports").upsert({ organisation_id: a.organisation_id, account_id: a.id, period_start: start, period_end: end, data, commentary, updated_at: new Date().toISOString() }, { onConflict: "account_id,period_start" }).select("id").single();
  if (error) throw new Error(error.message);
  return row.id as string;
}
