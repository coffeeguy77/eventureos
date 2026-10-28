import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { money } from "@/lib/format";
import { PLATFORM_LABEL, SITE_STATUS, monthly, planCategory, PLAN_LABEL, type PlanCategory } from "@/lib/nerdherd/core";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "live", label: "Live" }, { key: "nomaint", label: "No maintenance plan" }, { key: "noclient", label: "No client" },
  { key: "suspended", label: "Suspended" }, { key: "notours", label: "Not hosted with us" }, { key: "all", label: "All" },
] as const;

type Row = {
  id: string; domain: string; platform: string; status: string; customer_id: string | null;
  customers: { name: string } | null;
  hosting_accounts: { suspended: boolean; billing_status: string | null; hosting_servers: { name: string } | null } | null;
};

/** Every client website, with its hosting and the plans attached to it. */
export default async function WebsitesPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v)?.key ?? "live";
  const [{ data, error }, { data: plans }] = await Promise.all([
    supabase.from("websites").select("id, domain, platform, status, customer_id, customers(name), hosting_accounts(suspended, billing_status, hosting_servers(name))").eq("organisation_id", org.id).order("domain").limit(5000),
    supabase.from("recurring_invoices").select("website_id, customer_id, category, creates_ticket, name, status, total, every, unit").eq("organisation_id", org.id).neq("status", "ended").limit(5000),
  ]);
  if (error) throw new Error(`Couldn't load websites: ${error.message}`);
  const all = (data ?? []) as unknown as Row[];
  type P = { website_id: string | null; customer_id: string; category: string; creates_ticket: boolean; name: string; status: string; total: number; every: number; unit: "week" | "month" };
  const bySite = new Map<string, P[]>();
  for (const p of (plans ?? []) as P[]) if (p.website_id) bySite.set(p.website_id, [...(bySite.get(p.website_id) ?? []), p]);
  const cats = (id: string) => new Set((bySite.get(id) ?? []).map((p) => planCategory(p)));
  let rows = all;
  if (view === "live") rows = all.filter((r) => r.status === "live" || r.status === "building");
  if (view === "nomaint") rows = all.filter((r) => r.status === "live" && !cats(r.id).has("maintenance"));
  if (view === "noclient") rows = all.filter((r) => !r.customer_id);
  if (view === "suspended") rows = all.filter((r) => r.hosting_accounts?.suspended);
  if (view === "notours") rows = all.filter((r) => !r.hosting_accounts && r.status !== "archived");
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.domain, r.customers?.name].filter(Boolean).join(" ").toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex-1"><input type="hidden" name="v" value={view} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search domains and clients" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
        <ButtonLink href="/nerd-herd/websites/new" variant="primary"><Plus className="h-4 w-4" />Add website</ButtonLink>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {VIEWS.map((v) => <Link key={v.key} href={`/nerd-herd/websites?v=${v.key}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v.key === view ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}</Link>)}
      </div>
      <p className="text-[0.75rem] text-ink-muted">{rows.length} website{rows.length === 1 ? "" : "s"}. Sites on your hosting servers were added automatically; add any others you look after.</p>
      {!rows.length ? <Card><EmptyState title="No websites here" /></Card> : (
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const ps = bySite.get(r.id) ?? [];
            const perMonth = ps.reduce((a, p) => a + monthly(Number(p.total), p.every, p.unit), 0);
            return (
              <Link key={r.id} href={`/nerd-herd/websites/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">{r.domain}</p>
                  <p className="truncate text-[0.75rem] text-ink-muted">{!r.customer_id && <span className="mr-1 rounded bg-zinc-100 px-1 text-ink-faint">no client</span>}{[r.customers?.name, PLATFORM_LABEL[r.platform] ?? r.platform, r.hosting_accounts ? r.hosting_accounts.hosting_servers?.name : "not hosted with us"].filter(Boolean).join(" · ")}</p>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {[...new Set(ps.map((p) => planCategory(p)))].map((c: PlanCategory) => <span key={c} className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.6875rem] font-medium text-sky-800 ring-1 ring-inset ring-sky-200">{PLAN_LABEL[c]}</span>)}
                    {r.status === "live" && !cats(r.id).has("maintenance") && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">no maintenance plan</span>}
                  </span>
                </div>
                {perMonth > 0 && <span className="hidden text-right text-[0.75rem] tabular text-ink-muted sm:block">{money(perMonth, org.currency)}<span className="block text-[0.6875rem] text-ink-faint">a month</span></span>}
                {r.hosting_accounts?.suspended && <Badge tone="red">Suspended</Badge>}
                <Badge tone={SITE_STATUS[r.status]?.tone ?? "neutral"}>{SITE_STATUS[r.status]?.label ?? r.status}</Badge>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
