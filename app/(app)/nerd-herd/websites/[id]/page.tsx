import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { PLAN_LABEL, PLATFORM_LABEL, SITE_STATUS, TICKET_STATUS, planCategory, type TicketStatus } from "@/lib/nerdherd/core";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { WebsiteForm } from "@/components/nerdherd/website-form";

export const dynamic = "force-dynamic";

type Site = {
  id: string; domain: string; name: string | null; platform: string; status: string; customer_id: string | null; admin_url: string | null; launched_on: string | null; notes: string | null; hosting_account_id: string | null;
  customers: { id: string; name: string } | null;
  hosting_accounts: { id: string; domain: string; username: string | null; plan: string | null; suspended: boolean; billing_status: string | null; amount_due: number | null; disk_used_mb: number | null; disk_limit_mb: number | null; hosting_servers: { name: string } | null } | null;
};

export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase.from("websites")
    .select("*, customers(id, name), hosting_accounts(id, domain, username, plan, suspended, billing_status, amount_due, disk_used_mb, disk_limit_mb, hosting_servers(name))")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Couldn't load the website: ${error.message}`);
  if (!data) notFound();
  const w = data as unknown as Site;
  const [{ data: plans }, { data: tickets }, { data: clients }, { data: hosting }] = await Promise.all([
    supabase.from("recurring_invoices").select("id, name, category, creates_ticket, status, total, every, unit, next_date").eq("organisation_id", org.id).eq("website_id", id).order("next_date"),
    supabase.from("support_tickets").select("id, number, subject, status, kind, created_at, resolved_at").eq("organisation_id", org.id).eq("website_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(5000),
    supabase.from("hosting_accounts").select("id, domain").eq("organisation_id", org.id).order("domain").limit(5000),
  ]);
  type T = { id: string; number: number; subject: string; status: TicketStatus; kind: string; created_at: string; resolved_at: string | null };
  const tlist = (tickets ?? []) as T[];
  const maint = tlist.filter((t) => t.kind === "maintenance");
  const h = w.hosting_accounts;

  return (
    <div className="space-y-5">
      <Link href="/nerd-herd/websites" className="inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Websites</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[1.125rem] font-semibold text-ink">{w.domain}</h2>
          <p className="text-[0.8125rem] text-ink-muted">
            {w.customers ? <Link href={`/clients/${w.customers.id}?tab=web`} className="font-medium text-brand-600 hover:underline">{w.customers.name}</Link> : "No client"}
            {" · "}{PLATFORM_LABEL[w.platform] ?? w.platform}
            {" · "}<a href={`https://${w.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">Visit <ExternalLink className="h-3 w-3" /></a>
            {w.admin_url && <>{" · "}<a href={w.admin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">Admin <ExternalLink className="h-3 w-3" /></a></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {h?.suspended && <Badge tone="red">Suspended</Badge>}
          <Badge tone={SITE_STATUS[w.status]?.tone ?? "neutral"}>{SITE_STATUS[w.status]?.label ?? w.status}</Badge>
          <ButtonLink href={`/nerd-herd/tickets/new?client=${w.customer_id ?? ""}&site=${w.id}`} size="sm" variant="primary"><Plus className="h-3.5 w-3.5" />Ticket</ButtonLink>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Plans on this site" subtitle="Hosting, maintenance, Ads — the recurring invoices tied to it" />
            {(plans ?? []).length ? (
              <div className="divide-y divide-line border-t border-line">
                {((plans ?? []) as { id: string; name: string; category: string; creates_ticket: boolean; status: string; total: number; every: number; unit: Unit; next_date: string }[]).map((p) => (
                  <Link key={p.id} href={`/hosting/recurring/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                    <span className="min-w-0"><span className="block truncate text-[0.8438rem] font-medium text-ink">{p.name}</span>
                      <span className="block text-[0.7188rem] text-ink-muted">{PLAN_LABEL[planCategory(p)]} · {money(p.total, org.currency)} {describeSchedule(p.every, p.unit).toLowerCase()}{p.status === "active" ? ` · next ${fmtDate(p.next_date)}` : ""}</span></span>
                    <Badge tone={p.status === "active" ? "green" : p.status === "paused" ? "amber" : "neutral"}>{p.status === "active" ? "Active" : p.status === "paused" ? "Paused" : "Ended"}</Badge>
                  </Link>
                ))}
              </div>
            ) : <div className="border-t border-line"><EmptyState title="No plans on this site" action={<Link href="/nerd-herd/plans" className="text-[0.8125rem] font-medium text-brand-600 underline">Attach a plan</Link>}>Link a client's hosting or maintenance plan to this site from Plans.</EmptyState></div>}
          </Card>
          <Card>
            <CardHeader title="Maintenance history" subtitle={`${maint.filter((t) => t.status === "resolved").length} done`} />
            {maint.length ? (
              <div className="divide-y divide-line border-t border-line">
                {maint.map((t) => (
                  <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                    <span className="min-w-0 truncate text-[0.8125rem] text-ink">{t.subject}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[0.75rem] text-ink-muted">{t.resolved_at ? fmtDateTime(t.resolved_at, org.timezone, "date") : null}<Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge></span>
                  </Link>
                ))}
              </div>
            ) : <div className="border-t border-line"><EmptyState title="No maintenance recorded yet" /></div>}
          </Card>
          <Card>
            <CardHeader title="Other tickets" />
            {tlist.filter((t) => t.kind !== "maintenance").length ? (
              <div className="divide-y divide-line border-t border-line">
                {tlist.filter((t) => t.kind !== "maintenance").map((t) => (
                  <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                    <span className="min-w-0 truncate text-[0.8125rem] text-ink"><span className="text-ink-faint">#{t.number}</span> {t.subject}</span>
                    <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                  </Link>
                ))}
              </div>
            ) : <div className="border-t border-line"><EmptyState title="No tickets for this site" /></div>}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Hosting" action={h ? <Link href={`/hosting/${h.id}`} className="text-[0.75rem] font-medium text-brand-600">Open</Link> : undefined} />
            <dl className="space-y-3 border-t border-line px-5 py-4">
              {h ? <>
                <Field label="Server">{h.hosting_servers?.name ?? "—"}{h.username ? ` · ${h.username}` : ""}</Field>
                <Field label="Plan">{h.plan ?? "—"}</Field>
                <Field label="Billing">{h.billing_status ?? "—"}{Number(h.amount_due) > 0 ? ` · ${money(h.amount_due, org.currency)} owing` : ""}</Field>
                {h.disk_used_mb != null && <Field label="Disk">{Math.round(Number(h.disk_used_mb))} MB{h.disk_limit_mb ? ` of ${Math.round(Number(h.disk_limit_mb))} MB` : ""}</Field>}
              </> : <p className="text-[0.8125rem] text-ink-muted">Not hosted on your servers.</p>}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <div className="border-t border-line px-5 py-4">
              <WebsiteForm id={w.id} initial={{ domain: w.domain, name: w.name, customer_id: w.customer_id, platform: w.platform, status: w.status, admin_url: w.admin_url, launched_on: w.launched_on, notes: w.notes, hosting_account_id: w.hosting_account_id }}
                clients={(clients ?? []) as { id: string; name: string }[]} hosting={(hosting ?? []) as { id: string; domain: string }[]} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
