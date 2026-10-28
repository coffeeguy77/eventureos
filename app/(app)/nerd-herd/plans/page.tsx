import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { PLAN_LABEL, monthly, planCategory, type PlanCategory } from "@/lib/nerdherd/core";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PlanOptions } from "@/components/nerdherd/plan-options";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TABS: (PlanCategory | "all")[] = ["all", "maintenance", "hosting", "adwords", "domains", "other"];
type P = {
  id: string; name: string; category: string; creates_ticket: boolean; work_after_payment: boolean; status: string; total: number; every: number; unit: Unit; next_date: string;
  customer_id: string; website_id: string | null; customers: { name: string } | null;
};

/** Every recurring plan (hosting, maintenance, Ads, domains): what it's worth a month and whether it opens maintenance jobs. */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; q?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  const sp = await searchParams;
  const cat = TABS.find((x) => x === sp.c) ?? "all";
  const showStatus = sp.s === "all" ? "all" : sp.s === "paused" ? "paused" : sp.s === "active" ? "active" : "current";
  const [{ data, error }, { data: sites }] = await Promise.all([
    supabase.from("recurring_invoices").select("id, name, category, creates_ticket, work_after_payment, status, total, every, unit, next_date, customer_id, website_id, customers(name)").eq("organisation_id", org.id).order("next_date").limit(5000),
    supabase.from("websites").select("id, domain, customer_id").eq("organisation_id", org.id).neq("status", "archived").order("domain").limit(5000),
  ]);
  if (error) {
    return <Card><EmptyState title="Plans are for managers">Ask an owner or manager to look after recurring plans.</EmptyState></Card>;
  }
  const all = (data ?? []) as unknown as P[];
  let rows = all.filter((p) => cat === "all" || planCategory(p) === cat);
  if (showStatus === "current") rows = rows.filter((p) => p.status !== "ended");
  else if (showStatus !== "all") rows = rows.filter((p) => p.status === showStatus);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((p) => [p.name, p.customers?.name].filter(Boolean).join(" ").toLowerCase().includes(q));
  const live = all.filter((p) => p.status === "active");
  const perMonth = (list: P[]) => list.reduce((a, p) => a + monthly(Number(p.total), p.every, p.unit), 0);
  const paused = all.filter((p) => p.status === "paused");
  const siteList = (sites ?? []) as { id: string; domain: string; customer_id: string | null }[];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3"><p className="text-[0.75rem] text-ink-muted">Active plans</p><p className="text-[1.375rem] font-semibold text-ink">{money(perMonth(live), org.currency)}<span className="text-[0.75rem] font-normal text-ink-muted"> a month · {live.length}</span></p></Card>
        <Card className="px-4 py-3"><p className="text-[0.75rem] text-ink-muted">Paused (not billing)</p><p className="text-[1.375rem] font-semibold text-ink">{money(perMonth(paused), org.currency)}<span className="text-[0.75rem] font-normal text-ink-muted"> a month · {paused.length}</span></p></Card>
        <Card className="px-4 py-3"><p className="text-[0.75rem] text-ink-muted">Maintenance plans</p><p className="text-[1.375rem] font-semibold text-ink">{all.filter((p) => p.creates_ticket && p.status !== "ended").length}<span className="text-[0.75rem] font-normal text-ink-muted"> open a job each time</span></p></Card>
      </div>
      {paused.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-200">{paused.length} plans are paused — they were brought in from Xero's repeating invoices and RepairShopr. Switch each one on (open it → Active) once you've stopped it in Xero or RepairShopr, so nobody is billed twice.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {TABS.map((c) => <Link key={c} href={`/nerd-herd/plans?c=${c}&s=${showStatus}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", c === cat ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{c === "all" ? "All" : PLAN_LABEL[c]}</Link>)}
          <span className="mx-1 w-px bg-line" />
          {(["current", "active", "paused", "all"] as const).map((s) => <Link key={s} href={`/nerd-herd/plans?c=${cat}&s=${s}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", s === showStatus ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{s === "current" ? "Not ended" : s[0].toUpperCase() + s.slice(1)}</Link>)}
        </div>
        {canManage(role) && <ButtonLink href="/hosting/recurring/new" size="sm" variant="primary">New plan</ButtonLink>}
      </div>
      <form><input type="hidden" name="c" value={cat} /><input type="hidden" name="s" value={showStatus} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search plans and clients" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
      {!rows.length ? <Card><EmptyState title="No plans here" /></Card> : (
        <Card className="divide-y divide-line">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <Link href={`/hosting/recurring/${p.id}`} className="block truncate text-[0.8438rem] font-medium text-ink hover:underline">{p.name}</Link>
                <p className="truncate text-[0.7188rem] text-ink-muted">{[p.customers?.name, PLAN_LABEL[planCategory(p)], `${money(p.total, org.currency)} ${describeSchedule(p.every, p.unit).toLowerCase()}`, p.status === "active" ? `next ${fmtDate(p.next_date)}` : null].filter(Boolean).join(" · ")}</p>
              </div>
              {canManage(role) && <PlanOptions id={p.id} createsTicket={p.creates_ticket} workAfterPayment={p.work_after_payment} websiteId={p.website_id} sites={siteList.filter((s) => s.customer_id === p.customer_id || s.id === p.website_id)} />}
              <Badge tone={p.status === "active" ? "green" : p.status === "paused" ? "amber" : "neutral"}>{p.status === "active" ? "Active" : p.status === "paused" ? "Paused" : "Ended"}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
