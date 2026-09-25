import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi } from "@/components/records/kpi";
import { fmtDateTime, money, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";

export const metadata = { title: "Overview" };

const TZ = "Australia/Sydney";
const PROVIDER_LABEL: Record<string, string> = { gmail: "Gmail", google_calendar: "Google Calendar", xero: "Xero" };
const STATUS_TONE: Record<string, Tone> = { connected: "green", syncing: "blue", error: "red", disconnected: "slate", not_connected: "neutral" };
const STATUS_LABEL: Record<string, string> = { connected: "Connected", syncing: "Syncing", error: "Error", disconnected: "Disconnected", not_connected: "Not connected" };

type Stats = {
  organisations: number; active_organisations: number; users: number; events: number; emails_processed: number;
  quotes: number; mrr: number; integrations: Record<string, number>;
};
type Health = {
  db_reachable: boolean; checked_at: string; server_version: string;
  cron: { available: boolean; job?: { schedule: string; active: boolean } | null; last_run?: { status: string; start_time: string; end_time: string | null; return_message: string | null } | null; last_24h?: { runs: number; failed: number } | null };
  automation_runs_24h: { total: number; errors: number }; integration_errors: number; sync_failures_24h: number; active_support_sessions: number;
};

const nf = new Intl.NumberFormat("en-AU");

export default async function AdminOverview() {
  const supabase = await createClient();
  const started = Date.now();
  const [statsRes, healthRes] = await Promise.all([supabase.rpc("admin_platform_stats"), supabase.rpc("admin_system_health")]);
  const latency = Date.now() - started;
  if (statsRes.error) throw new Error(`Could not load platform stats: ${statsRes.error.message}`);
  const stats = statsRes.data as Stats;
  const health = healthRes.error ? null : (healthRes.data as Health);

  // "gmail:connected" → { gmail: { connected: 3 } }
  const byProvider: Record<string, Record<string, number>> = {};
  for (const [k, n] of Object.entries(stats.integrations ?? {})) {
    const [provider, status] = k.split(":");
    (byProvider[provider] ??= {})[status] = n;
  }

  const cron = health?.cron;
  const lastRun = cron?.last_run;
  const cronOk = !!cron?.available && !!cron.job?.active && lastRun?.status === "succeeded";

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Every organisation on EventureOS." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total organisations" value={nf.format(stats.organisations)} href="/admin/organisations" />
        <Kpi label="Active organisations" value={nf.format(stats.active_organisations)} sub="Activity in the last 30 days" />
        <Kpi label="Users" value={nf.format(stats.users)} />
        <Kpi label="MRR" value={money(stats.mrr, "AUD", { cents: false })} sub="Active paid plans at list price" />
        <Kpi label="Events managed" value={nf.format(stats.events)} />
        <Kpi label="Emails processed" value={nf.format(stats.emails_processed)} />
        <Kpi label="Quotes generated" value={nf.format(stats.quotes)} sub="Published quote versions" />
        <Kpi label="Support sessions active" value={health ? nf.format(health.active_support_sessions) : "—"} href="/admin/audit" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Integration health" subtitle="Connections across all organisations." />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[420px] text-[13px]">
              <tbody className="divide-y divide-line">
                {Object.keys(byProvider).length === 0 && (
                  <tr><td className="px-5 py-6 text-center text-ink-muted">No integrations yet.</td></tr>
                )}
                {Object.entries(byProvider).sort().map(([provider, statuses]) => (
                  <tr key={provider}>
                    <td className="px-5 py-3 font-medium text-ink">{PROVIDER_LABEL[provider] ?? provider}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)).map(([status, n]) => (
                          <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"} dot>
                            <span className="tabular">{n}</span> {STATUS_LABEL[status] ?? status}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="System health" subtitle={health ? `Checked ${fmtDateTime(health.checked_at, TZ, "time")} (Sydney)` : undefined} />
          <ul className="divide-y divide-line border-t border-line text-[13px]">
            <HealthRow label="Database" ok={!!health?.db_reachable}
              detail={health ? `Reachable · ${latency} ms round trip · Postgres ${health.server_version}` : `Health check failed: ${healthRes.error?.message}`} />
            <HealthRow
              label="Automation scheduler (pg_cron)"
              ok={cronOk}
              warn={!!cron?.available && !!cron.job?.active && !lastRun}
              detail={
                !cron?.available ? "pg_cron isn't visible from the database — scheduled automations may not be running."
                  : !cron.job ? "The 'eventureos-automations' job isn't scheduled."
                  : !cron.job.active ? "The 'eventureos-automations' job is paused."
                  : !lastRun ? `Scheduled ${cron.job.schedule} — no runs recorded yet.`
                  : `Last run ${relative(lastRun.start_time)} · ${lastRun.status}${lastRun.status !== "succeeded" && lastRun.return_message ? ` — ${lastRun.return_message}` : ""} · ${cron.last_24h?.runs ?? 0} runs / ${cron.last_24h?.failed ?? 0} failed in 24h`
              }
            />
            {health && (
              <>
                <HealthRow label="Automation runs (24h)" ok={health.automation_runs_24h.errors === 0}
                  detail={`${health.automation_runs_24h.total} runs · ${health.automation_runs_24h.errors} errors`} />
                <HealthRow label="Integrations" ok={health.integration_errors === 0 && health.sync_failures_24h === 0}
                  detail={`${health.integration_errors} in error state · ${health.sync_failures_24h} failed syncs in 24h`} />
              </>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}

function HealthRow({ label, ok, warn, detail }: { label: string; ok: boolean; warn?: boolean; detail: string }) {
  const tone: Tone = ok ? "green" : warn ? "amber" : "red";
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <div className="font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-muted">{detail}</div>
      </div>
      <Badge tone={tone} dot>{ok ? "Healthy" : warn ? "Check" : "Problem"}</Badge>
    </li>
  );
}
