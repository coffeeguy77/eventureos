import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { billingReference, readHosting, STATUS_TONE, stripMarker } from "@/lib/hosting/core";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteDoctor } from "@/components/hosting/site-doctor";
import { AccountDetails, DeleteWebsite, NoticeComposer, SuspendControls } from "@/components/hosting/account-tools";

export const dynamic = "force-dynamic";

export default async function HostingAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: a } = await supabase.from("hosting_accounts").select("*, hosting_servers(name, kind, host), customers(id, name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!a) notFound();
  const [{ data: inv }, { data: events }, { data: clients }] = await Promise.all([
    a.invoice_id ? supabase.from("invoices").select("id, number, reference, status, total, amount_paid, due_date, issue_date").eq("id", a.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("hosting_events").select("id, action, ok, dry_run, detail, created_at").eq("account_id", a.id).order("created_at", { ascending: false }).limit(40),
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(3000),
  ]);
  const s = readHosting(org.settings);
  const server = a.hosting_servers as { name: string; kind: string; host: string | null } | null;
  const cust = a.customers as { id: string; name: string } | null;
  const st = (a.billing_status as string) ?? "No Match";
  return (
    <div className="space-y-5">
      <div>
        <Link href="/hosting" className="text-[0.75rem] text-ink-muted hover:underline">← All accounts</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-[1.125rem] font-semibold text-ink">{a.domain}</h2>
          <Badge tone={STATUS_TONE[st] ?? "neutral"}>{st}</Badge>
          {a.suspended && <Badge tone="red">{a.suspended_by_app ? "Suspended by EventureOS" : "Suspended outside EventureOS"}</Badge>}
          {!a.on_server && <Badge tone="slate">No longer on the server</Badge>}
        </div>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">{[server?.name, a.username ? `cPanel ${a.username}` : null, a.plan, a.server_email, a.disk_used_mb != null ? `${Math.round(Number(a.disk_used_mb))} MB used${a.disk_limit_mb ? ` of ${Math.round(Number(a.disk_limit_mb))} MB` : ""}` : null].filter(Boolean).join(" · ")}</p>
        {a.suspended && a.suspend_reason && <p className="mt-1 text-[0.75rem] text-ink-muted">Reason: {stripMarker(a.suspend_reason as string)}</p>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Website & email check" subtitle="Is it still pointing at our server, does email work, when do the domain and SSL run out" />
            <div className="border-t border-line px-5 py-4"><SiteDoctor domain={a.domain as string} /></div>
          </Card>
          <Card>
            <CardHeader title="Invoice" subtitle={a.match_reason as string ?? undefined} />
            <div className="border-t border-line px-5 py-4 text-[0.8125rem]">
              {inv ? <div className="flex flex-wrap items-center justify-between gap-3">
                <div><Link href={`/invoices/${inv.id}`} className="font-medium text-brand-600 underline">{inv.number}</Link> <span className="text-ink-muted">· {inv.reference ?? "no reference"}</span>
                  <p className="text-ink-muted">Issued {fmtDate(inv.issue_date as string)} · due {inv.due_date ? fmtDate(inv.due_date as string) : "—"} · {inv.status}</p></div>
                <div className="text-right"><p className="text-[1rem] font-semibold tabular-nums">{money(Math.max(0, Number(inv.total) - Number(inv.amount_paid ?? 0)), org.currency)}</p><p className="text-[0.75rem] text-ink-muted">owing of {money(Number(inv.total), org.currency)}</p></div>
              </div> : <p className="text-ink-muted">No invoice matched. Invoices are matched when their reference contains <span className="font-mono">{(a.billing_reference as string) || billingReference(a.domain as string)}</span>, or by linking a client below.</p>}
              {(a.days_overdue ?? 0) > 0 && <p className="mt-2 font-medium text-rose-700">{a.days_overdue} days overdue</p>}
              {a.last_notice_at && <p className="mt-1 text-ink-muted">Last notice: {String(a.last_notice_type).replace(/_/g, " ")} · {fmtDateTime(a.last_notice_at as string, org.timezone)}</p>}
            </div>
          </Card>
          <AccountDetails id={a.id as string} defaultRef={billingReference(a.domain as string)} clients={(clients ?? []) as { id: string; name: string }[]} initial={{
            contact_email: a.contact_email, cc_emails: ((a.cc_emails as string[]) ?? []).join(", "), billing_reference: a.billing_reference, customer_id: cust?.id ?? null, customer_name: cust?.name ?? null,
            vip: a.vip, disputed: a.disputed, manual_override: a.manual_override, extension_until: a.extension_until, auto_check: a.auto_check, auto_unsuspend: a.auto_unsuspend, notes: a.notes,
          }} />
          {server?.kind === "siteground" && (
            <Card>
              <CardHeader title="SiteGround plugin key" subtitle="Install the Web Culture status plugin on this WordPress site (Servers page) and paste this key into Settings → Web Culture status." />
              <div className="border-t border-line px-5 py-4"><p className="select-all break-all rounded-lg bg-canvas px-3 py-2 font-mono text-[0.8125rem]">{a.site_key}</p></div>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <SuspendControls id={a.id as string} suspended={!!a.suspended} byApp={!!a.suspended_by_app} kind={server?.kind ?? "whm"} dryRun={s.dryRun} domain={a.domain as string} />
          <NoticeComposer id={a.id as string} templates={s.templates.map((t) => ({ key: t.key, name: t.name }))} />
          <DeleteWebsite id={a.id as string} domain={a.domain as string} kind={server?.kind ?? "whm"} onServer={!!a.on_server} dryRun={s.dryRun} />
          <Card>
            <CardHeader title="History" />
            <ul className="divide-y divide-line border-t border-line">
              {(events ?? []).length ? (events ?? []).map((e) => (
                <li key={e.id as string} className="px-5 py-2.5 text-[0.75rem]">
                  <p className={e.ok ? "text-ink" : "text-rose-700"}>{e.dry_run && <span className="mr-1 rounded bg-amber-100 px-1 text-amber-900">dry run</span>}{e.detail ?? e.action}</p>
                  <p className="text-ink-faint">{fmtDateTime(e.created_at as string, org.timezone)}</p>
                </li>
              )) : <li className="px-5 py-3 text-[0.75rem] text-ink-muted">Nothing yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
