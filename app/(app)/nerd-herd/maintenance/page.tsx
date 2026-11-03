import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { addDaysISO, fmtDate, money, relative, todayISO } from "@/lib/format";
import { planCategory, readChecklist } from "@/lib/nerdherd/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type T = {
  id: string; number: number; subject: string; status: string; due_date: string | null; checklist: unknown; resolved_at: string | null;
  customers: { id: string; name: string } | null; websites: { domain: string } | null;
  invoices: { id: string; number: string | null; status: string; balance: number | null; due_date: string | null } | null;
};

/** Maintenance: billed first, done once paid. What's waiting on payment, what's ready, what's coming up. */
export default async function MaintenancePage() {
  const { supabase, org } = await requireOrg();
  const today = todayISO(org.timezone);
  const since = addDaysISO(today, -45);
  const [{ data, error }, { data: upcoming }, { data: wp }] = await Promise.all([
    supabase.from("support_tickets").select("id, number, subject, status, due_date, checklist, resolved_at, customers(id, name), websites(domain), invoices!support_tickets_invoice_id_fkey(id, number, status, balance, due_date)")
      .eq("organisation_id", org.id).eq("kind", "maintenance").or(`status.not.in.(resolved,closed),resolved_at.gte.${since}`).order("created_at", { ascending: false }).limit(1000),
    supabase.from("recurring_invoices").select("id, name, status, next_date, total, creates_ticket, customers(name), websites(domain)").eq("organisation_id", org.id).eq("creates_ticket", true).neq("status", "ended").order("next_date").limit(500),
    supabase.from("website_connectors").select("website_id, wp_version, wp_update, updates_core, updates_plugins, updates_themes, last_checked_at, last_error, last_run_ok, websites(domain, customers(name))")
      .eq("organisation_id", org.id).limit(1000).then((r) => r, () => ({ data: [] })),
  ]);
  if (error) throw new Error(`Couldn't load maintenance: ${error.message}`);
  const all = (data ?? []) as unknown as T[];
  const col = (title: string, hint: string, rows: T[], tone: "amber" | "blue" | "brand" | "green") => (
    <Card className="overflow-hidden">
      <CardHeader title={`${title} (${rows.length})`} subtitle={hint} />
      {rows.length ? (
        <div className="divide-y divide-line border-t border-line">
          {rows.map((t) => {
            const cl = readChecklist(t.checklist);
            const done = cl.filter((x) => x.done).length;
            return (
              <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="block px-4 py-2.5 hover:bg-canvas">
                <p className="truncate text-[0.8125rem] font-medium text-ink">{t.customers?.name ?? "No client"}{t.websites ? <span className="font-normal text-ink-muted"> · {t.websites.domain}</span> : null}</p>
                <p className="truncate text-[0.7188rem] text-ink-muted">#{t.number} {t.subject}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {t.invoices && t.status === "awaiting_payment" && <Badge tone={t.invoices.status === "overdue" ? "red" : "amber"}>{t.invoices.number} · {money(t.invoices.balance ?? 0, org.currency)} {t.invoices.status === "overdue" ? "overdue" : "unpaid"}</Badge>}
                  {cl.length > 0 && t.status !== "awaiting_payment" && <Badge tone={tone}>{done}/{cl.length} checks</Badge>}
                  {t.resolved_at && <span className="text-[0.6875rem] text-ink-faint">done {fmtDate(t.resolved_at)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      ) : <div className="border-t border-line"><EmptyState title="Nothing here" /></div>}
    </Card>
  );
  type U = { id: string; name: string; status: string; next_date: string; total: number; customers: { name: string } | null; websites: { domain: string } | null };
  const soon = ((upcoming ?? []) as unknown as U[]).filter((u) => u.next_date <= addDaysISO(today, 45));

  type W = { website_id: string; wp_version: string | null; wp_update: string | null; updates_core: number; updates_plugins: number; updates_themes: number; last_checked_at: string | null; last_error: string | null; last_run_ok: boolean | null; websites: { domain: string; customers: { name: string } | null } | null };
  const sites = ((wp ?? []) as unknown as W[]).map((w) => ({ ...w, total: w.updates_core + w.updates_plugins + w.updates_themes }))
    .sort((a, b) => Number(!!b.last_error) - Number(!!a.last_error) || b.total - a.total || (a.websites?.domain ?? "").localeCompare(b.websites?.domain ?? ""));
  const waiting = sites.reduce((n, w) => n + w.total, 0);
  // same rule as Websites → On maintenance plan
  const { data: allPlans } = await supabase.from("recurring_invoices").select("website_id, category, creates_ticket, name").eq("organisation_id", org.id).neq("status", "ended").not("website_id", "is", null).limit(5000);
  const planSites = new Set(((allPlans ?? []) as { website_id: string; category: string | null; creates_ticket: boolean; name: string }[]).filter((p) => planCategory(p) === "maintenance").map((p) => p.website_id)).size;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/nerd-herd/websites?v=plan" className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line transition hover:ring-2"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Sites on a maintenance plan</p><p className="mt-1 text-[1.75rem] font-bold leading-none text-ink">{planSites}</p><p className="mt-1 text-[0.75rem] text-brand-600">See them in Websites →</p></Link>
        <Link href="/nerd-herd/websites?v=ops" className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line transition hover:ring-2"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Connected for command ops</p><p className="mt-1 text-[1.75rem] font-bold leading-none text-ink">{sites.length}</p><p className="mt-1 text-[0.75rem] text-brand-600">{waiting} update{waiting === 1 ? "" : "s"} waiting →</p></Link>
        <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Jobs waiting on payment</p><p className="mt-1 text-[1.75rem] font-bold leading-none text-amber-600">{all.filter((t) => t.status === "awaiting_payment").length}</p><p className="mt-1 text-[0.75rem] text-ink-muted">Work starts once paid</p></div>
      </div>
      <p className="text-[0.8125rem] text-ink-muted">This page is the <strong className="text-ink">maintenance jobs</strong> your plans create — one per billing run. To see <em>which sites</em> are on a plan, use <Link href="/nerd-herd/websites?v=plan" className="font-medium text-brand-600">Websites → On maintenance plan</Link>.</p>
      <Card className="overflow-hidden">
        <CardHeader title="WordPress command ops" action={<Link href="/nerd-herd/websites?v=ops" className="text-[0.75rem] font-medium text-brand-600">All connected sites</Link>} subtitle={sites.length ? `${sites.length} connected site${sites.length === 1 ? "" : "s"} · ${waiting} update${waiting === 1 ? "" : "s"} waiting` : "Connect a WordPress site from its page in Websites"} />
        {sites.length ? (
          <div className="divide-y divide-line border-t border-line">
            {sites.map((w) => (
              <Link key={w.website_id} href={`/nerd-herd/websites/${w.website_id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] font-medium text-ink">{w.websites?.domain ?? "—"}{w.websites?.customers ? <span className="font-normal text-ink-muted"> · {w.websites.customers.name}</span> : null}</span>
                  <span className="block text-[0.7188rem] text-ink-muted">WordPress {w.wp_version ?? "—"}{w.wp_update ? ` → ${w.wp_update}` : ""} · checked {relative(w.last_checked_at)}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {w.last_error && <Badge tone="red">Can't reach</Badge>}
                  {w.last_run_ok === false && <Badge tone="red">Last update had a problem</Badge>}
                  <Badge tone={w.total ? "amber" : "green"}>{w.total ? `${w.total} update${w.total === 1 ? "" : "s"}` : "Up to date"}</Badge>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </Card>
      <p className="text-[0.8125rem] text-ink-muted">When a maintenance plan&apos;s invoice is raised, its job appears under <strong className="text-ink">Awaiting payment</strong>. The moment the invoice is paid (by card, or in Xero) it moves to <strong className="text-ink">Ready to do</strong> and the team is notified.</p>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        {col("Awaiting payment", "Billed — waiting for the money", all.filter((t) => t.status === "awaiting_payment"), "amber")}
        {col("Ready to do", "Paid — do the checks", all.filter((t) => ["open", "new", "scheduled"].includes(t.status)), "blue")}
        {col("In progress", "Checks under way", all.filter((t) => ["in_progress", "waiting_customer"].includes(t.status)), "brand")}
        {col("Done", "Last 45 days", all.filter((t) => t.status === "resolved"), "green")}
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Coming up" subtitle="Maintenance plans due in the next 45 days — each raises its invoice and opens a job on the day" action={<Link href="/nerd-herd/plans" className="text-[0.75rem] font-medium text-brand-600">All plans</Link>} />
        {soon.length ? (
          <div className="divide-y divide-line border-t border-line">
            {soon.map((u) => (
              <Link key={u.id} href={`/hosting/recurring/${u.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                <span className="min-w-0 truncate text-[0.8125rem] text-ink">{u.customers?.name ?? "—"}{u.websites ? <span className="text-ink-muted"> · {u.websites.domain}</span> : null}</span>
                <span className="flex shrink-0 items-center gap-2 text-[0.75rem] text-ink-muted">{fmtDate(u.next_date)} · {money(u.total, org.currency)}{u.status !== "active" && <Badge tone="amber">Paused — won't run</Badge>}</span>
              </Link>
            ))}
          </div>
        ) : <div className="border-t border-line"><EmptyState title="No maintenance plans due soon">Turn on “Opens a maintenance job” for a plan in Plans.</EmptyState></div>}
      </Card>
    </div>
  );
}
