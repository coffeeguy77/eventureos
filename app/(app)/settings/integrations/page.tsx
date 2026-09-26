import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { envStatus, LIVE_PROVIDERS, missingEnv, PROVIDERS, type ProviderDef } from "@/lib/integrations/registry";
import { fmtDateTime, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { DisconnectButton, SyncNowButton } from "./controls";
import { Code, Mark, STATUS, SYNC_STATUS } from "./ui";

export const metadata = { title: "Integrations" };

interface IntegrationRow {
  id: string; provider: string; status: string; account_label: string | null; last_sync_at: string | null;
  last_sync_status: string | null; last_error: string | null; connected_at: string | null;
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const manager = canManage(role);
  const env = envStatus();

  const [intRes, pendingRes, logsRes, suggestRes] = await Promise.all([
    supabase.from("integrations").select("id, provider, status, account_label, last_sync_at, last_sync_status, last_error, connected_at").eq("organisation_id", org.id),
    supabase.from("import_candidates").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "pending"),
    supabase.from("integration_sync_logs").select("id, entity, direction, status, records_processed, message, started_at, finished_at, integration:integrations(provider)")
      .eq("organisation_id", org.id).order("started_at", { ascending: false }).limit(8),
    supabase.from("email_threads").select("id", { count: "exact", head: true }).eq("organisation_id", org.id)
      .in("classification", ["event_enquiry", "needs_review"]).is("enquiry_id", null).is("event_id", null).neq("state", "closed").is("suggestion_dismissed_at", null),
  ]);
  if (intRes.error) throw new Error(`Could not load integrations: ${intRes.error.message}`);
  const rows = new Map(((intRes.data ?? []) as IntegrationRow[]).map((r) => [r.provider, r]));
  const pending = pendingRes.count ?? 0;
  const suggestions = suggestRes.count ?? 0;
  const logs = (logsRes.data ?? []) as unknown as { id: string; entity: string | null; direction: string; status: string; records_processed: number; message: string | null; started_at: string; finished_at: string | null; integration: { provider: string } | null }[];
  const soon = PROVIDERS.filter((p) => p.availability === "coming_soon");

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect the tools you already use. EventureOS syncs with them — Gmail, Google Calendar and Xero stay your source of truth."
        actions={
          <ButtonLink href="/settings/integrations/review" variant={pending + suggestions ? "primary" : "secondary"}>
            Review{pending + suggestions ? ` (${pending + suggestions})` : ""} <ArrowUpRight className="h-4 w-4" />
          </ButtonLink>
        }
      />

      {sp.error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800 ring-1 ring-inset ring-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0 break-words">{sp.error}</span>
        </div>
      )}
      {sp.connected && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>Connected.</span>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {LIVE_PROVIDERS.map((p) => (
          <ProviderCard key={p.id} p={p} row={rows.get(p.id) ?? null} missing={missingEnv(p.id)} manager={manager} tz={org.timezone} />
        ))}
      </div>

      <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Recent sync activity" subtitle="Every sync is logged — nothing happens silently." />
          {logs.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No syncs yet. They&apos;ll appear here once an integration is connected.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {logs.map((l) => {
                const s = SYNC_STATUS[l.status] ?? { label: l.status, tone: "neutral" as Tone };
                const prov = PROVIDERS.find((x) => x.id === l.integration?.provider);
                return (
                  <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-5">
                    <Badge tone={s.tone}>{prov?.name ?? "Sync"}</Badge>
                    <p className="order-last min-w-0 basis-full break-words text-[12.5px] text-ink-muted sm:order-none sm:flex-1 sm:basis-auto">{l.message ?? `${l.entity ?? "Sync"} ${l.status}`}</p>
                    <span className="ml-auto shrink-0 text-[11.5px] text-ink-faint sm:ml-0" title={fmtDateTime(l.started_at, org.timezone)}>{relative(l.started_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Automation & background sync" />
          <ul className="space-y-3 px-4 pb-5 text-[12.5px] sm:px-5">
            <SetupLine ok={env.ai} title={env.ai ? `AI classification on (${env.aiModel ?? "claude-haiku-4-5-20251001"})` : "AI classification off — rules engine in use"}
              detail={env.ai ? "New emails are classified by Claude, with the rules engine as a fallback." : <>Add <Code>ANTHROPIC_API_KEY</Code> (optional <Code>AI_MODEL</Code>) to let Claude classify emails and extract event details. The built-in rules already handle website forms, replies, quotes, suppliers and spam.</>} />
            <SetupLine ok={env.serviceRole && env.cronSecret} title={env.serviceRole && env.cronSecret ? "Background sync every 15 minutes" : "Background sync is off"}
              detail={env.serviceRole && env.cronSecret ? "Gmail, Google Calendar and Xero sync automatically." : <>Add {!env.cronSecret && <><Code>CRON_SECRET</Code>{!env.serviceRole && " and "}</>}{!env.serviceRole && <Code>SUPABASE_SERVICE_ROLE_KEY</Code>} to sync automatically. Until then use <strong>Sync now</strong>.</>} />
            <SetupLine ok={env.stateSecret} title={env.stateSecret ? "Secure connection signing ready" : "Connecting is disabled"}
              detail={env.stateSecret ? "OAuth sign-in responses are verified." : <>Add <Code>OAUTH_STATE_SECRET</Code> (or <Code>CRON_SECRET</Code>) — a long random string used to verify sign-in responses.</>} />
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-[13.5px] font-semibold text-ink">Coming soon</h2>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {soon.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-white/60 px-4 py-3">
            <Mark p={p} small />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-ink">{p.name} <span className="text-[11px] font-normal text-ink-faint">{p.category}</span></p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{p.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupLine({ ok, title, detail }: { ok: boolean; title: string; detail: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      <div className="min-w-0"><p className="font-medium text-ink">{title}</p><p className="mt-0.5 text-ink-muted">{detail}</p></div>
    </li>
  );
}

function ProviderCard({ p, row, missing, manager, tz }: { p: ProviderDef; row: IntegrationRow | null; missing: string[]; manager: boolean; tz: string }) {
  const status = STATUS[row?.status ?? "not_connected"] ?? STATUS.not_connected;
  const connected = !!row && ["connected", "syncing", "error"].includes(row.status);
  const sync = row?.last_sync_status ? SYNC_STATUS[row.last_sync_status] : null;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-4 pt-5 sm:px-5">
        <Mark p={p} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
            <Badge tone={status.tone} dot>{status.label}</Badge>
          </div>
          <p className="text-[12px] text-ink-faint">{p.category}</p>
        </div>
      </div>
      <p className="px-4 pt-3 text-[12.5px] leading-relaxed text-ink-muted sm:px-5">{p.description}</p>
      <dl className="mx-4 mt-4 sm:mx-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-zinc-50/80 px-3 py-2.5 text-[12.5px]">
        <dt className="text-ink-faint">Account</dt><dd className="min-w-0 truncate text-ink">{connected ? row!.account_label ?? "—" : "—"}</dd>
        <dt className="text-ink-faint">Last sync</dt><dd className="text-ink" title={row?.last_sync_at ? fmtDateTime(row.last_sync_at, tz) : undefined}>{connected && row!.last_sync_at ? relative(row!.last_sync_at) : connected ? "Not yet" : "—"}</dd>
        <dt className="text-ink-faint">Sync status</dt>
        <dd className="min-w-0">{connected ? (sync ? <Badge tone={sync.tone}>{sync.label}</Badge> : <span className="text-ink-muted">Waiting for first sync</span>) : <span className="text-ink-muted">—</span>}</dd>
      </dl>
      {connected && row!.last_error && (
        <p className="mx-4 mt-2 break-words rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800 sm:mx-5 ring-1 ring-inset ring-rose-100">{row!.last_error}</p>
      )}
      <ul className="flex flex-wrap gap-1.5 px-4 pt-3 sm:px-5">
        {p.capabilities.map((c) => <li key={c} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-ink-muted">{c}</li>)}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-2 px-4 pb-5 pt-4 sm:px-5">
        {connected ? (
          <>
            <ButtonLink href={`/settings/integrations/${p.id}`} size="sm" variant="secondary" className="h-10 sm:h-8">Settings</ButtonLink>
            {manager && <SyncNowButton provider={p.id} />}
            {manager && <DisconnectButton provider={p.id} name={p.name} />}
            {row!.status === "error" && manager && !missing.length && (
              <a href={`/api/integrations/${p.id}/connect`} className={buttonClass("ghost", "sm", "h-10 sm:h-8")}>Reconnect</a>
            )}
          </>
        ) : missing.length ? (
          <div className="w-full">
            <button disabled className={buttonClass("primary", "sm", "h-10 w-full sm:h-8 sm:w-auto")}>Connect {p.name}</button>
            <p className="mt-2 text-[12px] text-ink-muted">
              Not set up yet. Add {missing.map((m, i) => <span key={m}>{i > 0 && (i === missing.length - 1 ? " and " : ", ")}<Code>{m}</Code></span>)} to the environment variables (Vercel → Settings → Environment Variables), then redeploy.
            </p>
          </div>
        ) : manager ? (
          <a href={`/api/integrations/${p.id}/connect`} className={buttonClass("primary", "sm", "h-10 w-full sm:h-8 sm:w-auto")}>Connect {p.name}</a>
        ) : (
          <p className="text-[12px] text-ink-muted">Ask an owner, admin or manager to connect {p.name}.</p>
        )}
      </div>
    </Card>
  );
}
