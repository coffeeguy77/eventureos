import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { envStatus, getProvider, isLiveProvider, missingEnv, appBaseUrl, redirectUri } from "@/lib/integrations/registry";
import { scopesFor } from "@/lib/integrations/oauth";
import { DEFAULT_SYNC_KINDS, type GoogleCalendar } from "@/lib/integrations/google-calendar";
import { listCreditNotes, xeroDate, type XeroCreditNote } from "@/lib/integrations/xero";
import { buildContext } from "@/lib/integrations/sync-runner";
import { DEFAULT_BLOCK, DEFAULT_KEYWORDS } from "@/lib/integrations/email-filter";
import { INVOICE_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, money, relative } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";
import { CalendarSettingsForm, CopyBlock, DisconnectButton, EmailCleanupPanel, GmailSettingsForm, ImportForm, SyncNowButton, XeroSettingsForm } from "../controls";
import { Code, Mark, STATUS, SYNC_STATUS } from "../ui";
import { headers } from "next/headers";

export const metadata = { title: "Integration settings" };

export default async function ProviderSettingsPage({ params, searchParams }: { params: Promise<{ provider: string }>; searchParams: Promise<{ connected?: string }> }) {
  const { provider } = await params;
  const sp = await searchParams;
  if (!isLiveProvider(provider)) notFound();
  const p = getProvider(provider)!;
  const { supabase, org, role, user } = await requireOrg();
  const manager = canManage(role);
  const missing = missingEnv(provider);
  const env = envStatus();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "www.eventureos.com.au"}`;

  const { data: row } = await supabase.from("integrations")
    .select("id, status, account_label, external_account_id, scopes, settings, connected_at, last_sync_at, last_sync_status, last_error")
    .eq("organisation_id", org.id).eq("provider", provider).maybeSingle();
  const connected = !!row && ["connected", "syncing", "error"].includes(row.status);
  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const status = STATUS[row?.status ?? "not_connected"] ?? STATUS.not_connected;
  const sync = row?.last_sync_status ? SYNC_STATUS[row.last_sync_status] : null;

  const { data: logs } = row
    ? await supabase.from("integration_sync_logs").select("id, entity, status, records_processed, message, started_at").eq("integration_id", row.id).order("started_at", { ascending: false }).limit(12)
    : { data: [] };

  return (
    <div>
      <PageHeader
        eyebrow={<><Link href="/settings/integrations" className="hover:text-ink">Integrations</Link> <span>/</span> {p.name}</>}
        title={<span className="flex items-center gap-3"><Mark p={p} small />{p.name}</span>}
        subtitle={p.description}
        actions={connected && manager ? (
          <div className="flex flex-wrap items-center gap-2">
            <SyncNowButton provider={provider} variant="primary" />
            <DisconnectButton provider={provider} name={p.name} />
          </div>
        ) : undefined}
      />

      {sp.connected && connected && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{p.name} connected as <strong>{row!.account_label}</strong>.{" "}
            {provider === "gmail" && "Press Sync now to bring in the last 14 days, or import historical enquiries below."}
            {provider === "google_calendar" && "Now choose which EventureOS calendars sync to which Google calendar."}
            {provider === "xero" && "Press Sync now to fetch contacts for match review — nothing merges until you confirm."}
          </span>
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {!connected && (
            <Card>
              <CardHeader title="Not connected" />
              <div className="px-5 pb-5 text-[13px] text-ink-muted">
                {missing.length ? (
                  <p>Connecting is disabled until {missing.map((m, i) => <span key={m}>{i > 0 && ", "}<Code>{m}</Code></span>)} {missing.length === 1 ? "is" : "are"} set. See the setup notes on the right.</p>
                ) : manager ? (
                  <a href={`/api/integrations/${provider}/connect`} className={buttonClass("primary", "md")}>Connect {p.name}</a>
                ) : <p>Ask an owner, admin or manager to connect {p.name}.</p>}
              </div>
            </Card>
          )}

          {connected && provider === "gmail" && <GmailSection orgId={org.id} settings={settings} aiConfigured={env.ai} manager={manager} />}
          {connected && provider === "google_calendar" && <CalendarSection orgId={org.id} settings={settings} manager={manager} />}
          {connected && provider === "xero" && <XeroSection orgId={org.id} currency={org.currency} tz={org.timezone} settings={settings} manager={manager} userId={user.id} orgSettings={org.settings} />}

          <Card>
            <CardHeader title="Sync history" />
            {(logs ?? []).length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No syncs yet.</p> : (
              <ul className="divide-y divide-line border-t border-line">
                {(logs ?? []).map((l) => {
                  const s = SYNC_STATUS[l.status as string] ?? { label: l.status as string, tone: "neutral" as const };
                  return (
                    <li key={l.id as string} className="flex items-start gap-3 px-5 py-3">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">{(l.message as string | null) ?? l.entity}</p>
                      <span className="shrink-0 text-[11.5px] text-ink-faint" title={fmtDateTime(l.started_at as string, org.timezone)}>{relative(l.started_at as string)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Connection" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 pb-5 text-[13px]">
              <dt className="text-ink-faint">Status</dt><dd><Badge tone={status.tone} dot>{status.label}</Badge></dd>
              <dt className="text-ink-faint">Account</dt><dd className="truncate">{connected ? row!.account_label : "—"}</dd>
              <dt className="text-ink-faint">Connected</dt><dd>{connected && row!.connected_at ? fmtDateTime(row!.connected_at, org.timezone, "date") : "—"}</dd>
              <dt className="text-ink-faint">Last sync</dt><dd>{connected && row!.last_sync_at ? relative(row!.last_sync_at) : "—"}</dd>
              <dt className="text-ink-faint">Sync status</dt><dd>{sync ? <Badge tone={sync.tone}>{sync.label}</Badge> : "—"}</dd>
              {connected && row!.last_error && <><dt className="text-ink-faint">Problem</dt><dd className="text-rose-700">{row!.last_error}</dd></>}
              <dt className="text-ink-faint">Background</dt><dd>{env.serviceRole && env.cronSecret ? "Every 15 minutes" : <span className="text-ink-muted">Manual only (needs <Code>CRON_SECRET</Code> + <Code>SUPABASE_SERVICE_ROLE_KEY</Code>)</span>}</dd>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Setup notes" subtitle="For whoever manages the EventureOS deployment" />
            <div className="space-y-3 px-5 pb-5 text-[12.5px] text-ink-muted">
              <p>Environment variables: {[...p.requiredEnv, "OAUTH_STATE_SECRET"].map((m, i) => <span key={m}>{i > 0 && ", "}<Code>{m}</Code></span>)}.</p>
              <div>
                <p className="mb-1">Authorised redirect URI:</p>
                <CopyBlock label="Copy redirect URI" text={redirectUri(provider, appBaseUrl(origin))} />
              </div>
              <div>
                <p className="mb-1">Scopes requested:</p>
                <ul className="list-disc pl-4">{scopesFor(provider).map((s) => <li key={s}><Code>{s}</Code></li>)}</ul>
              </div>
              {p.docsUrl && <a href={p.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">Provider documentation <ArrowUpRight className="h-3.5 w-3.5" /></a>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


async function GmailSection({ orgId, settings, aiConfigured, manager }: { orgId: string; settings: Record<string, unknown>; aiConfigured: boolean; manager: boolean }) {
  const { supabase } = await requireOrg();
  const { count: pending } = await supabase.from("import_candidates").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("source", "gmail").eq("status", "pending");
  const imported = Number(settings.import_scanned ?? 0);
  return (
    <>
      <Card>
        <CardHeader title="Email filters" subtitle="Choose which emails EventureOS imports. Emails that don't match stay in Gmail and are never copied here." />
        {manager ? (
          <GmailSettingsForm aiConfigured={aiConfigured} values={{
            filter_mode: settings.filter_mode === "all" ? "all" : "matching",
            filter_keywords: (settings.filter_keywords as string[] | undefined) ?? DEFAULT_KEYWORDS,
            website_subject_patterns: (settings.website_subject_patterns as string[] | undefined) ?? [],
            website_form_senders: (settings.website_form_senders as string[] | undefined) ?? [],
            filter_allow_senders: (settings.filter_allow_senders as string[] | undefined) ?? [],
            filter_block_senders: (settings.filter_block_senders as string[] | undefined) ?? DEFAULT_BLOCK,
            ai_enabled: settings.ai_enabled !== false,
            initial_days: Number(settings.initial_days ?? 14),
          }} />
        ) : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Managers can change these settings.</p>}
      </Card>
      {manager && (
        <Card>
          <CardHeader title="Tidy up imported email" subtitle="Re-check everything already imported against your filters and remove what doesn't match." />
          <EmailCleanupPanel />
        </Card>
      )}
      <Card>
        <CardHeader title="Import historical event enquiries" subtitle="Scan past Gmail conversations for customers and enquiries. Everything found goes to Import review — nothing is created until you confirm." />
        {imported > 0 && (
          <p className="px-5 pb-3 text-[12.5px] text-ink-muted">
            {imported} conversation{imported === 1 ? "" : "s"} scanned{settings.import_last_run_at ? ` · last run ${relative(settings.import_last_run_at as string)}` : ""}.{" "}
            {pending ? <Link href="/settings/integrations/review" className="font-medium text-brand-600 hover:text-brand-700">{pending} waiting for review →</Link> : "Nothing waiting for review."}
          </p>
        )}
        {manager ? <ImportForm months={Number(settings.import_months ?? 12)} inProgress={!!settings.import_page_token} /> : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Managers can run the import.</p>}
      </Card>
      <Card>
        <CardHeader title="Website form (optional)" subtitle="Skip email parsing entirely: post your website's enquiry form straight into EventureOS." action={<ButtonLink href="/settings/website-form" size="sm" variant="secondary">Set up website form</ButtonLink>} />
      </Card>
    </>
  );
}

async function CalendarSection({ orgId, settings, manager }: { orgId: string; settings: Record<string, unknown>; manager: boolean }) {
  const { supabase } = await requireOrg();
  const [{ data: conns }, { data: counts }] = await Promise.all([
    supabase.from("calendar_connections").select("id, name, colour, provider, external_calendar_id, sync_enabled").eq("organisation_id", orgId).order("created_at"),
    supabase.from("calendar_events").select("calendar_connection_id, sync_status").eq("organisation_id", orgId).gte("ends_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);
  const cnt = new Map<string, number>();
  const bad = new Map<string, number>();
  for (const c of counts ?? []) {
    cnt.set(c.calendar_connection_id as string, (cnt.get(c.calendar_connection_id as string) ?? 0) + 1);
    if (c.sync_status === "error") bad.set(c.calendar_connection_id as string, (bad.get(c.calendar_connection_id as string) ?? 0) + 1);
  }
  const rows = (conns ?? []).map((c) => ({
    id: c.id as string, name: c.name as string, colour: c.colour as string,
    external_calendar_id: c.provider === "google" ? (c.external_calendar_id as string | null) : null, sync_enabled: !!c.sync_enabled && c.provider === "google",
    entries: cnt.get(c.id as string) ?? 0,
  }));
  const calendars = ((settings.calendars as GoogleCalendar[] | undefined) ?? []);
  const errors = [...bad.values()].reduce((a, b) => a + b, 0);
  return (
    <Card>
      <CardHeader title="Which calendars sync" subtitle="Choose a Google calendar for each EventureOS calendar (resource). Entries are created and updated in Google — never duplicated." />
      {errors > 0 && <p className="mx-5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-100">{errors} entr{errors === 1 ? "y" : "ies"} failed to sync last time — see Sync history.</p>}
      {calendars.length === 0 && <p className="mx-5 mb-3 text-[12.5px] text-ink-muted">No Google calendars loaded yet — press Sync now to fetch the list.</p>}
      {manager
        ? <CalendarSettingsForm rows={rows} calendars={calendars} kinds={((settings.sync_kinds as string[] | undefined)?.length ? settings.sync_kinds as string[] : DEFAULT_SYNC_KINDS)} pullBusy={!!settings.pull_busy} />
        : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Managers can change calendar sync.</p>}
    </Card>
  );
}

async function XeroSection({ orgId, currency, tz, settings, manager, userId, orgSettings }: { orgId: string; currency: string; tz: string; settings: Record<string, unknown>; manager: boolean; userId: string; orgSettings: Record<string, unknown> }) {
  const { supabase } = await requireOrg();
  const [{ data: invoices }, { count: pending }, { count: linked }] = await Promise.all([
    supabase.from("invoices").select("id, number, status, total, amount_paid, balance, due_date, xero_synced_at, event_id, customer:customers(id, name)")
      .eq("organisation_id", orgId).not("xero_invoice_id", "is", null).order("issue_date", { ascending: false }).limit(15),
    supabase.from("import_candidates").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("source", "xero").eq("status", "pending"),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).not("xero_contact_id", "is", null),
  ]);
  let credit: XeroCreditNote[] = [];
  let creditError: string | null = null;
  try {
    const ctx = await buildContext(supabase, "user", orgId, "xero", userId);
    credit = (await listCreditNotes(ctx)).slice(0, 10);
  } catch (e) { creditError = e instanceof Error ? e.message : "unavailable"; }
  type Inv = { id: string; number: string; status: InvoiceStatus; total: number; amount_paid: number; balance: number; due_date: string | null; xero_synced_at: string | null; event_id: string | null; customer: { id: string; name: string } | null };
  return (
    <>
      <Card>
        <CardHeader title="Match review" subtitle={`${linked ?? 0} customer${linked === 1 ? "" : "s"} linked to Xero contacts.`}
          action={<ButtonLink href="/settings/integrations/review" size="sm" variant={pending ? "primary" : "secondary"}>{pending ? `Review ${pending} match${pending === 1 ? "" : "es"}` : "Open review"}</ButtonLink>} />
        <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Xero contacts are matched to customers by email, company, phone and name. Possible duplicates wait for you to choose Merge or Keep separate — nothing is merged automatically. Invoice history comes across as soon as a customer is linked.</p>
      </Card>
      <Card>
        <CardHeader title="Invoicing" subtitle="Xero stays authoritative for amounts and payment status." />
        {manager ? (
          <XeroSettingsForm tenants={(settings.tenants as { tenantId: string; tenantName: string | null }[] | undefined) ?? []} values={{
            push_invoices: (settings.push_invoices as string | undefined) ?? "off",
            sales_account_code: (settings.sales_account_code as string | undefined) ?? "200",
            tax_type: (settings.tax_type as string | undefined) ?? "OUTPUT",
            tenant_id: (settings.tenant_id as string | undefined) ?? null,
            quote_acceptance_action: (orgSettings.quote_acceptance_action as string | undefined) ?? "deposit_invoice",
            deposit_percent: Number(orgSettings.deposit_percent ?? 30),
          }} />
        ) : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Managers can change invoicing settings.</p>}
      </Card>
      <Card>
        <CardHeader title="Xero invoice history" subtitle="Synced from Xero — no need to open Xero." />
        {(invoices ?? []).length === 0 ? <EmptyState title="No Xero invoices yet">Link customers in match review, then sync.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead><tr className="border-y border-line bg-zinc-50/60 text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="px-5 py-2 text-right font-medium">Balance</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {((invoices ?? []) as unknown as Inv[]).map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-2.5">{i.event_id ? <Link href={`/events/${i.event_id}?tab=invoice`} className="text-ink hover:text-brand-700">{i.number}</Link> : i.number}<p className="text-[11.5px] text-ink-faint">{i.due_date ? `Due ${fmtDate(i.due_date)}` : ""}</p></td>
                    <td className="px-3 py-2.5">{i.customer ? <Link href={`/clients/${i.customer.id}`} className="hover:text-brand-700">{i.customer.name}</Link> : "—"}</td>
                    <td className="px-3 py-2.5"><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge></td>
                    <td className="tabular px-3 py-2.5 text-right">{money(i.total, currency)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{money(i.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Credit notes" subtitle="Read-only, straight from Xero." />
        {creditError ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Couldn&apos;t load credit notes from Xero: {creditError}</p>
          : credit.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No sales credit notes.</p> : (
            <ul className="divide-y divide-line border-t border-line">
              {credit.map((c) => (
                <li key={c.CreditNoteID} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span>{c.CreditNoteNumber ?? "Credit note"} · {c.Contact?.Name ?? "—"} <span className="text-ink-faint">{fmtDate(xeroDate(c.Date, c.DateString))}</span></span>
                  <span className="tabular">{money(c.Total ?? 0, currency)} <span className="text-[11.5px] text-ink-faint">({c.Status?.toLowerCase()}{c.RemainingCredit ? `, ${money(c.RemainingCredit, currency)} unapplied` : ""})</span></span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  );
}
