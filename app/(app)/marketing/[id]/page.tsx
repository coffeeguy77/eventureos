import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { addDaysISO, money, relative, todayISO } from "@/lib/format";
import { allPages } from "@/lib/supabase/all-pages";
import { MK_ACCOUNT_COLUMNS, type MkAccount } from "@/lib/marketing/sync";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AccountForm } from "@/components/marketing/account-form";
import { ActButton, AuditButton, BuildReport } from "@/components/marketing/controls";

export const dynamic = "force-dynamic";

type Day = { source: string; day: string; dim: string; dim_name: string | null; impressions: number; clicks: number; cost: number; conversions: number; conv_value: number; sessions: number; position: number | null };
type Change = { id: string; kind: string; label: string; reason: string; status: string; error: string | null; created_at: string; before: Record<string, unknown>; after: Record<string, unknown> };
const STATUS: Record<string, { label: string; tone: "green" | "amber" | "neutral" | "red" | "slate" }> = {
  applied: { label: "Made", tone: "green" }, proposed: { label: "Waiting for approval", tone: "amber" }, blocked: { label: "Not allowed", tone: "slate" },
  failed: { label: "Failed", tone: "red" }, undone: { label: "Undone", tone: "neutral" }, rejected: { label: "Turned down", tone: "neutral" },
};

export default async function MarketingClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: acct } = await supabase.from("mk_accounts").select(MK_ACCOUNT_COLUMNS).eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!acct) notFound();
  const a = acct as MkAccount;
  const cur = a.ads_currency ?? org.currency;
  const today = todayISO(org.timezone);
  const from = addDaysISO(today, -60);
  const [{ data: days }, { data: changes }, { data: runs }, { data: reports }, { data: clients }] = await Promise.all([
    allPages<Day>((x, y) => supabase.from("mk_daily").select("source, day, dim, dim_name, impressions, clicks, cost, conversions, conv_value, sessions, position").eq("account_id", id).gte("day", from).order("day").order("source").order("dim").range(x, y)),
    supabase.from("mk_changes").select("id, kind, label, reason, status, error, created_at, before, after").eq("account_id", id).order("created_at", { ascending: false }).limit(80),
    supabase.from("mk_runs").select("started_at, status, summary, error, changes").eq("account_id", id).order("started_at", { ascending: false }).limit(5),
    supabase.from("mk_reports").select("id, period_start, status, sent_at, kind:data->>kind, score:data->>score").eq("account_id", id).order("period_start", { ascending: false }).limit(36),
    allPages<{ id: string; name: string }>((x, y) => supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").order("id").range(x, y)),
  ]);
  const split = addDaysISO(today, -30);
  const sum = (src: string, inNow: boolean) => (days as Day[]).filter((d) => d.source === src && d.dim === "" && (inNow ? d.day >= split : d.day < split))
    .reduce((t, d) => ({ cost: t.cost + Number(d.cost), conv: t.conv + Number(d.conversions), value: t.value + Number(d.conv_value), clicks: t.clicks + Number(d.clicks), impr: t.impr + Number(d.impressions), sessions: t.sessions + Number(d.sessions), pos: d.position ?? t.pos }), { cost: 0, conv: 0, value: 0, clicks: 0, impr: 0, sessions: 0, pos: null as number | null });
  const adsNow = sum("ads", true), adsPrev = sum("ads", false), gaNow = sum("ga4", true), gaPrev = sum("ga4", false), scNow = sum("gsc", true), scPrev = sum("gsc", false);
  const camps = new Map<string, { name: string; cost: number; conv: number; clicks: number }>();
  for (const d of days as Day[]) if (d.source === "ads" && d.dim !== "" && d.day >= split) { const c = camps.get(d.dim) ?? { name: d.dim_name ?? d.dim, cost: 0, conv: 0, clicks: 0 }; c.cost += Number(d.cost); c.conv += Number(d.conversions); c.clicks += Number(d.clicks); camps.set(d.dim, c); }
  const pct = (n: number, p: number) => (p ? `${n >= p ? "▲" : "▼"} ${Math.abs(((n - p) / p) * 100).toFixed(0)}% on the 30 days before` : "");
  const list = (changes ?? []) as Change[];
  const waiting = list.filter((c) => c.status === "proposed");
  type Rep = { id: string; period_start: string; status: string; sent_at: string | null; kind: string | null; score: string | null };
  const allReports = (reports ?? []) as Rep[];
  const audits = allReports.filter((r) => r.kind === "audit");
  const monthly = allReports.filter((r) => r.kind !== "audit");
  const lastRun = (runs ?? [])[0] as { started_at: string; status: string; summary: string | null; error: string | null; changes: number } | undefined;
  const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i - 1); const v = d.toISOString().slice(0, 7); return { value: v, label: d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) }; });
  const kpi = (label: string, value: string, sub: string) => (
    <div className="rounded-xl border border-line bg-surface px-4 py-3"><p className="text-[0.75rem] text-ink-muted">{label}</p><p className="mt-0.5 text-[1.25rem] font-semibold tabular-nums text-ink">{value}</p><p className="text-[0.7188rem] text-ink-faint">{sub}</p></div>
  );

  return (
    <div>
      <PageHeader eyebrow={<Link href="/marketing" className="hover:text-ink">Marketing</Link>} title={a.name}
        subtitle={<>{a.mode === "auto" ? (a.monthly_cap ? `AI makes changes itself · cap ${money(a.monthly_cap, cur, { cents: false })} a month` : "AI automatic — set a monthly cap so it can make changes") : a.mode === "suggest" ? "AI suggests, you approve" : "Reports only"}{a.last_synced_at ? ` · figures ${relative(a.last_synced_at)}` : ""}</>}
        actions={<><Link href={`/marketing/${id}/campaign`} className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-3 text-[0.8125rem] font-medium text-ink hover:bg-zinc-50 sm:h-9">New campaign</Link><ActButton id={id} act="sync" label="Bring in figures" busy="Bringing in…" /><ActButton id={id} act="run" label="Run AI review now" busy="Reviewing… (up to 2 min)" variant="primary" /></>} />
      {a.last_error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-100">{a.last_error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi("Ads spend, 30 days", money(adsNow.cost, cur, { cents: false }), pct(adsNow.cost, adsPrev.cost))}
        {kpi("Conversions", String(Math.round(adsNow.conv * 10) / 10), pct(adsNow.conv, adsPrev.conv))}
        {kpi("Per conversion", adsNow.conv ? money(adsNow.cost / adsNow.conv, cur) : "—", a.target_cpa ? `target ${money(a.target_cpa, cur)}` : "")}
        {kpi("Clicks", adsNow.clicks.toLocaleString("en-AU"), pct(adsNow.clicks, adsPrev.clicks))}
        {a.ga4_property && kpi("Website visits", gaNow.sessions.toLocaleString("en-AU"), pct(gaNow.sessions, gaPrev.sessions))}
        {a.ga4_property && kpi("Key events (GA4)", String(Math.round(gaNow.conv)), pct(gaNow.conv, gaPrev.conv))}
        {a.gsc_site && kpi("Google search clicks", scNow.clicks.toLocaleString("en-AU"), pct(scNow.clicks, scPrev.clicks))}
        {a.gsc_site && kpi("Search position", scNow.pos != null ? Number(scNow.pos).toFixed(1) : "—", "latest day")}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="AI review" subtitle={lastRun ? `Last ${relative(lastRun.started_at)}` : "Runs every morning at about 6am"} />
            <div className="px-5 pb-5 text-[0.8438rem] text-ink">
              {lastRun ? (lastRun.status === "error" ? <p className="text-rose-700">{lastRun.error}</p> : <p className="whitespace-pre-line">{lastRun.summary}</p>) : <p className="text-ink-muted">No review yet.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Changes" subtitle={waiting.length ? `${waiting.length} waiting for approval` : "Everything the AI made or suggested, and why"} />
            {list.length === 0 ? <EmptyState title="No changes yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {list.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="min-w-0 flex-1 text-[0.8125rem] font-medium text-ink">{c.label}</p>
                      <Badge tone={STATUS[c.status]?.tone ?? "neutral"}>{STATUS[c.status]?.label ?? c.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-[0.75rem] text-ink-muted">
                      {c.kind === "set_budget" ? `${money(Number(c.before.daily), cur)} → ${money(Number(c.after.daily), cur)} a day · ` : c.kind === "set_keyword_bid" ? `${money(Number(c.before.cpc), cur)} → ${money(Number(c.after.cpc), cur)} max per click · ` : ""}
                      {c.reason}
                    </p>
                    {c.error && <p className="mt-0.5 text-[0.75rem] text-rose-700">{c.error}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.7188rem] text-ink-faint">{relative(c.created_at)}
                      {c.status === "proposed" && <><ActButton id={c.id} act="approve" label="Approve" busy="Making it…" variant="primary" /><ActButton id={c.id} act="reject" label="Turn down" busy="…" variant="ghost" /></>}
                      {c.status === "applied" && <ActButton id={c.id} act="undo" label="Undo" busy="Putting it back…" variant="ghost" confirm="Put this back in Google Ads?" />}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Campaigns" subtitle="Last 30 days" />
            {camps.size === 0 ? <p className="px-5 pb-5 text-[0.8125rem] text-ink-muted">{a.ads_customer_id ? "No Google Ads figures yet — press Bring in figures." : "No Google Ads account linked."}</p> : (
              <ul className="divide-y divide-line border-t border-line">
                {[...camps.values()].sort((x, y) => y.cost - x.cost).map((c) => (
                  <li key={c.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[0.8125rem]">
                    <span className="min-w-0 flex-1 basis-40 text-ink">{c.name}</span>
                    <span className="tabular-nums text-ink">{money(c.cost, cur, { cents: false })}</span>
                    <span className="w-20 text-right tabular-nums text-ink-muted">{Math.round(c.conv * 10) / 10} conv.</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Account audit" subtitle="Where the account stood when we took over — reports measure improvement against it" />
            <div className="px-5 pb-3">{audits.length ? null : <p className="mb-2 text-[0.8125rem] text-ink-muted">No audit yet — one runs automatically the first morning, or run it now.</p>}<AuditButton id={id} label={audits.length ? "Run a fresh audit" : "Run the audit now"} /></div>
            {audits.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {audits.map((r) => (
                  <li key={r.id}><Link href={`/marketing/${id}/reports/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50/70">
                    <span className="text-ink">Audit {new Date(`${r.period_start}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}{r === audits[audits.length - 1] ? " (starting point)" : ""}</span>
                    <Badge tone="brand">{r.score}/100</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Monthly reports" subtitle="Drafted automatically early each month" />
            <div className="px-5 pb-3"><BuildReport id={id} months={months} /></div>
            {monthly.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {monthly.map((r) => (
                  <li key={r.id}><Link href={`/marketing/${id}/reports/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50/70">
                    <span className="text-ink">{new Date(`${r.period_start}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                    <Badge tone={r.status === "sent" ? "green" : "amber"}>{r.status === "sent" ? "Sent" : "Draft"}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Settings" />
            <AccountForm id={id} clients={clients} currency={cur}
              initial={{ name: a.name, customer_id: a.customer_id, ads_customer_id: a.ads_customer_id, ga4_property: a.ga4_property, gsc_site: a.gsc_site, mode: a.mode, monthly_cap: a.monthly_cap, target_cpa: a.target_cpa, goals: a.goals, max_changes: a.max_changes, report_to: a.report_to.join(", "), active: a.active }} />
          </Card>
        </div>
      </div>
    </div>
  );
}
