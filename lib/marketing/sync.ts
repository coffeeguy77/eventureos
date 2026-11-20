import "server-only";
import { addDaysISO, todayISO } from "@/lib/format";
import { errMessage, type SyncContext } from "@/lib/integrations/runtime";
import { adsErrorText, adsReady, adsSearch, ga4Report, gscQuery } from "./google";

/**
 * Bring each client's daily figures into mk_daily: Google Ads by campaign, GA4 sessions/users/key events by channel,
 * Search Console clicks/impressions/position. First time: the last 13 months (for year-on-year in reports);
 * after that the last 35 days, because conversions and Search Console figures are revised for a while.
 */
export interface MkAccount {
  id: string; organisation_id: string; customer_id: string | null; name: string; ads_customer_id: string | null; ads_currency: string | null;
  ga4_property: string | null; gsc_site: string | null; mode: "auto" | "suggest" | "off"; monthly_cap: number | null; target_cpa: number | null;
  goals: string | null; max_changes: number; report_to: string[]; active: boolean; last_synced_at: string | null; last_run_at: string | null; last_error: string | null;
}
export const MK_ACCOUNT_COLUMNS = "id, organisation_id, customer_id, name, ads_customer_id, ads_currency, ga4_property, gsc_site, mode, monthly_cap, target_cpa, goals, max_changes, report_to, active, last_synced_at, last_run_at, last_error";

type DailyRow = { account_id: string; organisation_id: string; source: "ads" | "ga4" | "gsc"; day: string; dim: string; dim_name: string | null; impressions: number; clicks: number; cost: number; conversions: number; conv_value: number; sessions: number; users: number; position: number | null };
const blank = (a: MkAccount, source: DailyRow["source"], day: string, dim = "", dim_name: string | null = null): DailyRow =>
  ({ account_id: a.id, organisation_id: a.organisation_id, source, day, dim, dim_name, impressions: 0, clicks: 0, cost: 0, conversions: 0, conv_value: 0, sessions: 0, users: 0, position: null });
const r2 = (n: number) => Math.round(n * 100) / 100;

async function save(ctx: SyncContext, rows: DailyRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.db.from("mk_daily").upsert(rows.slice(i, i + 500), { onConflict: "account_id,source,day,dim" });
    if (error) throw new Error(`Couldn't save figures: ${error.message}`);
  }
}

export async function syncAccount(ctx: SyncContext, a: MkAccount): Promise<string> {
  const today = todayISO(ctx.org.timezone);
  const from = a.last_synced_at ? addDaysISO(today, -35) : addDaysISO(today, -400);
  const to = addDaysISO(today, -1);
  const parts: string[] = [], problems: string[] = [];

  if (a.ads_customer_id && adsReady()) {
    try {
      type R = { campaign?: { id?: string; name?: string }; segments?: { date?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number; conversionsValue?: number }; customer?: { currencyCode?: string } };
      const res = await adsSearch<R>(ctx, a.ads_customer_id,
        `SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, customer.currency_code FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`);
      const totals = new Map<string, DailyRow>();
      const rows: DailyRow[] = [];
      for (const x of res) {
        const day = x.segments?.date; const id = x.campaign?.id;
        if (!day || !id) continue;
        const m = x.metrics ?? {};
        const row = { ...blank(a, "ads", day, id, x.campaign?.name ?? id), impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), cost: r2(Number(m.costMicros ?? 0) / 1e6), conversions: r2(Number(m.conversions ?? 0)), conv_value: r2(Number(m.conversionsValue ?? 0)) };
        if (!row.impressions && !row.clicks && !row.cost && !row.conversions) continue;
        rows.push(row);
        const t = totals.get(day) ?? blank(a, "ads", day);
        t.impressions += row.impressions; t.clicks += row.clicks; t.cost = r2(t.cost + row.cost); t.conversions = r2(t.conversions + row.conversions); t.conv_value = r2(t.conv_value + row.conv_value);
        totals.set(day, t);
      }
      const currency = res.find((x) => x.customer?.currencyCode)?.customer?.currencyCode;
      if (currency && currency !== a.ads_currency) await ctx.db.from("mk_accounts").update({ ads_currency: currency }).eq("id", a.id);
      await save(ctx, [...rows, ...totals.values()]);
      parts.push(`Ads ${totals.size} days`);
    } catch (e) { problems.push(`Google Ads: ${adsErrorText(e)}`); }
  }

  if (a.ga4_property) {
    try {
      const res = await ga4Report(ctx, a.ga4_property, { startDate: from, endDate: to, dimensions: ["date", "sessionDefaultChannelGroup"], metrics: ["sessions", "totalUsers", "keyEvents"] });
      const totals = new Map<string, DailyRow>();
      const rows: DailyRow[] = [];
      for (const x of res) {
        const d = x.dims[0]; const ch = x.dims[1] || "(other)";
        if (!/^\d{8}$/.test(d)) continue;
        const day = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        const row = { ...blank(a, "ga4", day, ch.slice(0, 80), ch), sessions: x.metrics[0], users: x.metrics[1], conversions: r2(x.metrics[2]) };
        rows.push(row);
        const t = totals.get(day) ?? blank(a, "ga4", day);
        // users can't be added across channels (the same person can come by two) — the total row's users is the largest channel's, refined below
        t.sessions += row.sessions; t.conversions = r2(t.conversions + row.conversions);
        totals.set(day, t);
      }
      const users = await ga4Report(ctx, a.ga4_property, { startDate: from, endDate: to, dimensions: ["date"], metrics: ["totalUsers"] });
      for (const u of users) { const d = u.dims[0]; const day = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; const t = totals.get(day); if (t) t.users = u.metrics[0]; }
      await save(ctx, [...rows, ...totals.values()]);
      parts.push(`GA4 ${totals.size} days`);
    } catch (e) { problems.push(`Analytics: ${errMessage(e)}`); }
  }

  if (a.gsc_site) {
    try {
      const res = await gscQuery(ctx, a.gsc_site, { startDate: from, endDate: to, dimensions: ["date"] });
      const rows = res.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.keys[0] ?? "")).map((x) => ({ ...blank(a, "gsc", x.keys[0]), clicks: x.clicks, impressions: x.impressions, position: r2(x.position) }));
      await save(ctx, rows);
      parts.push(`Search Console ${rows.length} days`);
    } catch (e) { problems.push(`Search Console: ${errMessage(e)}`); }
  }

  await ctx.db.from("mk_accounts").update({ last_synced_at: new Date().toISOString(), last_error: problems.length ? problems.join(" · ").slice(0, 1000) : null, updated_at: new Date().toISOString() }).eq("id", a.id);
  return `${a.name}: ${parts.join(", ") || "nothing linked yet"}${problems.length ? ` — ${problems.join(" · ")}` : ""}`;
}

/** "Sync now" on the connection, and the daily run. */
export async function syncAllAccounts(ctx: SyncContext): Promise<{ message: string }> {
  const { data, error } = await ctx.db.from("mk_accounts").select(MK_ACCOUNT_COLUMNS).eq("organisation_id", ctx.org.id).eq("active", true).order("name");
  if (error) throw new Error(error.message.includes("mk_accounts") ? "The Marketing database update (0114) hasn't been run yet." : error.message);
  const out: string[] = [];
  for (const a of (data ?? []) as MkAccount[]) out.push(await syncAccount(ctx, a));
  await ctx.db.from("integrations").update({ status: "connected", last_sync_at: new Date().toISOString(), last_sync_status: "success", last_error: null }).eq("id", ctx.integration.id);
  return { message: out.length ? out.join("\n") : "Connected. Add a client in Marketing to start bringing in figures." };
}
