import Link from "next/link";
import { ChevronRight, Plug, Plus, Search, Wrench } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, money, relative } from "@/lib/format";
import { PLATFORM_LABEL, SITE_STATUS, monthly, planCategory, PLAN_LABEL, type PlanCategory } from "@/lib/nerdherd/core";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { detectHost, HOST_LABEL } from "@/lib/nerdherd/host-detect";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "live", label: "Live", hint: "Live and in-progress sites" },
  { key: "plan", label: "On maintenance plan", hint: "Sites with a monthly maintenance plan — each run opens a maintenance job" },
  { key: "nomaint", label: "No maintenance plan", hint: "Live sites without a maintenance plan — easy upsell" },
  { key: "ops", label: "Command ops", hint: "Sites connected through the Web Culture Connector — updates, caches, sign-in" },
  { key: "noclient", label: "No client", hint: "Sites not linked to a client yet" },
  { key: "suspended", label: "Suspended", hint: "Hosting suspended for non-payment" },
  { key: "notours", label: "Not hosted with us", hint: "Sites you look after on someone else's hosting" },
  { key: "all", label: "All", hint: "Every website" },
] as const;
type View = (typeof VIEWS)[number]["key"];

type Row = {
  id: string; domain: string; platform: string; status: string; customer_id: string | null;
  customers: { name: string } | null;
  hosting_accounts: { suspended: boolean; billing_status: string | null; hosting_servers: { name: string } | null } | null;
};
type Conn = { plugins?: { file: string; name?: string }[] | null; website_id: string; connector_version: string | null; wp_version: string | null; wp_update: string | null; updates_core: number; updates_plugins: number; updates_themes: number; last_checked_at: string | null; last_error: string | null; last_run_ok: boolean | null; locked?: boolean | null };
type P = { website_id: string | null; customer_id: string; category: string; creates_ticket: boolean; name: string; status: string; total: number; every: number; unit: "week" | "month"; next_date: string | null };

/** Every client website: what plans it's on, whether it's connected for command ops, and its hosting. */
export default async function WebsitesPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view: View = VIEWS.find((x) => x.key === sp.v)?.key ?? "live";
  const [{ data, error }, { data: plans }, { data: conns }] = await Promise.all([
    supabase.from("websites").select("id, domain, platform, status, customer_id, customers(name), hosting_accounts(suspended, billing_status, hosting_servers(name))").eq("organisation_id", org.id).order("domain").limit(5000),
    supabase.from("recurring_invoices").select("website_id, customer_id, category, creates_ticket, name, status, total, every, unit, next_date").eq("organisation_id", org.id).neq("status", "ended").limit(5000),
    supabase.from("website_connectors").select("*").eq("organisation_id", org.id).limit(2000).then((r) => r, () => ({ data: [] })),
  ]);
  if (error) throw new Error(`Couldn't load websites: ${error.message}`);
  const all = (data ?? []) as unknown as Row[];
  const bySite = new Map<string, P[]>();
  for (const p of (plans ?? []) as P[]) if (p.website_id) bySite.set(p.website_id, [...(bySite.get(p.website_id) ?? []), p]);
  const cats = (id: string) => new Set((bySite.get(id) ?? []).map((p) => planCategory(p)));
  const conn = new Map(((conns ?? []) as Conn[]).map((c) => [c.website_id, c]));

  const pick: Record<View, (r: Row) => boolean> = {
    live: (r) => r.status === "live" || r.status === "building",
    plan: (r) => cats(r.id).has("maintenance"),
    nomaint: (r) => r.status === "live" && !cats(r.id).has("maintenance"),
    ops: (r) => conn.has(r.id),
    noclient: (r) => !r.customer_id,
    suspended: (r) => !!r.hosting_accounts?.suspended,
    notours: (r) => !r.hosting_accounts && r.status !== "archived",
    all: () => true,
  };
  const count = Object.fromEntries(VIEWS.map((v) => [v.key, all.filter(pick[v.key]).length])) as Record<View, number>;
  let rows = all.filter(pick[view]);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.domain, r.customers?.name].filter(Boolean).join(" ").toLowerCase().includes(q));
  const v = VIEWS.find((x) => x.key === view)!;
  const href = (k: string) => `/nerd-herd/websites?v=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;

  // summary for the ops and plan views
  const opsList = rows.map((r) => conn.get(r.id)).filter((c): c is Conn => !!c);
  const waiting = opsList.reduce((n, c) => n + c.updates_core + c.updates_plugins + c.updates_themes, 0);
  const planMonthly = view === "plan" ? rows.reduce((a, r) => a + (bySite.get(r.id) ?? []).filter((p) => planCategory(p) === "maintenance").reduce((b, p) => b + monthly(Number(p.total), p.every, p.unit), 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex min-w-0 flex-1 gap-2" role="search">
          <input type="hidden" name="v" value={view} />
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search domains and clients" aria-label="Search websites" className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.875rem] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>
          <button type="submit" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 text-[0.8125rem] font-semibold text-surface hover:opacity-90"><Search className="h-4 w-4" />Search</button>
          {sp.q && <Link href={`/nerd-herd/websites?v=${view}`} className="inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-[0.8125rem] font-medium text-ink-muted ring-1 ring-line hover:text-ink">Clear</Link>}
        </form>
        <ButtonLink href="/nerd-herd/websites/new" variant="primary" className="h-10"><Plus className="h-4 w-4" />Add website</ButtonLink>
      </div>

      {/* filters: py so the outlines aren't clipped by the scroller */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
        {VIEWS.map((x) => (
          <Link key={x.key} href={href(x.key)} aria-current={x.key === view ? "page" : undefined} title={x.hint}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7812rem] font-medium transition-colors",
              x.key === view ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-muted hover:border-ink/40 hover:text-ink")}>
            {x.key === "ops" && <Plug className="h-3.5 w-3.5" />}{x.key === "plan" && <Wrench className="h-3.5 w-3.5" />}
            {x.label}<span className={cn("rounded-full px-1.5 text-[0.6875rem] tabular", x.key === view ? "bg-surface/20" : "bg-ink/10")}>{count[x.key]}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.8125rem] text-ink-muted"><span className="font-semibold text-ink">{rows.length} website{rows.length === 1 ? "" : "s"}</span> · {v.hint}{q ? ` · matching “${sp.q}”` : ""}</p>
        {view === "ops" && opsList.length > 0 && <p className="text-[0.8125rem] text-ink-muted">{waiting} update{waiting === 1 ? "" : "s"} waiting across these sites</p>}
        {view === "plan" && planMonthly > 0 && <p className="text-[0.8125rem] text-ink-muted">{money(planMonthly, org.currency)} a month in maintenance plans · jobs in <Link href="/nerd-herd/maintenance" className="font-medium text-brand-600">Maintenance</Link></p>}
      </div>

      {!rows.length ? <Card><EmptyState title={view === "ops" ? "No sites connected yet" : "No websites here"}>{view === "ops" ? "Open a WordPress site and connect the Web Culture Connector under WordPress command ops." : undefined}</EmptyState></Card> : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const ps = bySite.get(r.id) ?? [];
            const perMonth = ps.reduce((a, p) => a + monthly(Number(p.total), p.every, p.unit), 0);
            const c = conn.get(r.id);
            const upd = c ? c.updates_core + c.updates_plugins + c.updates_themes : 0;
            const maint = ps.filter((p) => planCategory(p) === "maintenance");
            const nextRun = maint.map((p) => p.next_date).filter(Boolean).sort()[0] ?? null;
            return (
              <Link key={r.id} href={`/nerd-herd/websites/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">{r.domain}</p>
                  <p className="truncate text-[0.75rem] text-ink-muted">{!r.customer_id && <span className="mr-1 rounded bg-ink/10 px-1 text-ink-faint">no client</span>}{[r.customers?.name, PLATFORM_LABEL[r.platform] ?? r.platform, r.hosting_accounts ? r.hosting_accounts.hosting_servers?.name : c && detectHost(c.plugins) ? `${HOST_LABEL[detectHost(c.plugins)!]} (not linked)` : "not hosted with us"].filter(Boolean).join(" · ")}</p>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {[...new Set(ps.map((p) => planCategory(p)))].map((k: PlanCategory) => <span key={k} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300">{PLAN_LABEL[k]}</span>)}
                    {r.status === "live" && !cats(r.id).has("maintenance") && view !== "ops" && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">no maintenance plan</span>}
                    {!r.hosting_accounts && c && detectHost(c.plugins) && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:text-sky-300">on {HOST_LABEL[detectHost(c.plugins)!]} — not linked</span>}
                    {c && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300"><Plug className="h-3 w-3" />Connected{c.connector_version ? ` ${c.connector_version}` : ""}</span>}
                  </span>
                  {view === "ops" && c && <span className="mt-1 block text-[0.7188rem] text-ink-muted">WordPress {c.wp_version ?? "—"}{c.wp_update ? ` → ${c.wp_update}` : ""} · checked {c.last_checked_at ? relative(c.last_checked_at) : "never"}</span>}
                  {view === "plan" && <span className="mt-1 block text-[0.7188rem] text-ink-muted">{maint.map((p) => p.name).join(", ")}{nextRun ? ` · next run ${fmtDate(nextRun)}` : ""}{maint.some((p) => p.status !== "active") ? " · paused" : ""}</span>}
                </div>
                {view === "ops" && c ? (
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {c.last_error ? <Badge tone="red">Can&apos;t reach</Badge> : <Badge tone={upd ? "amber" : "green"}>{upd ? `${upd} update${upd === 1 ? "" : "s"}` : "Up to date"}</Badge>}
                    {c.locked && <Badge tone="red">Locked</Badge>}
                  </span>
                ) : perMonth > 0 ? <span className="hidden text-right text-[0.75rem] tabular text-ink-muted sm:block">{money(perMonth, org.currency)}<span className="block text-[0.6875rem] text-ink-faint">a month</span></span> : null}
                {r.hosting_accounts?.suspended && <Badge tone="red">Suspended</Badge>}
                {view !== "ops" && <Badge tone={SITE_STATUS[r.status]?.tone ?? "neutral"}>{SITE_STATUS[r.status]?.label ?? r.status}</Badge>}
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
