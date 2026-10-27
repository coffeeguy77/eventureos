import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { Card, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ImportXero, StatusSwitch } from "@/components/hosting/recurring-tools";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; category: string; status: string; source: string; every: number; unit: Unit; next_date: string; total: number; send_mode: string; last_error: string | null; reference: string | null; hosting_account_id: string | null; customers: { name: string } | null; hosting_accounts: { id: string; domain: string; suspended: boolean } | null };

/** Repeating invoices kept here instead of Xero: hosting, AdWords, domains, anything monthly. */
export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; q?: string; site?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const { data, error } = await supabase.from("recurring_invoices").select("id, name, category, status, source, every, unit, next_date, total, send_mode, last_error, reference, hosting_account_id, customers(name), hosting_accounts(id, domain, suspended)").eq("organisation_id", org.id).order("next_date").limit(3000);
  if (error && /recurring_invoices/.test(error.message)) return <Card className="p-6 text-[0.875rem] text-ink-muted">Recurring invoices need their database update first: run <span className="font-mono">supabase/migrations/0075_recurring.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  const all = (data ?? []) as unknown as Row[];
  const cats = [...new Set(all.map((r) => r.category))].sort();
  const cat = sp.c && cats.includes(sp.c) ? sp.c : "all";
  const st = ["active", "paused", "ended"].includes(sp.s ?? "") ? sp.s! : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const site = sp.site === "yes" || sp.site === "no" ? sp.site : "all";
  const rows = all.filter((r) => (cat === "all" || r.category === cat) && (st === "all" || r.status === st) && (site === "all" || (site === "yes") === !!r.hosting_account_id)
    && (!q || [r.name, r.customers?.name, r.reference, r.hosting_accounts?.domain].filter(Boolean).join(" ").toLowerCase().includes(q)));
  const monthly = (r: Row) => (r.unit === "week" ? (Number(r.total) * 52) / 12 / r.every : Number(r.total) / r.every);
  const activeMonthly = all.filter((r) => r.status === "active").reduce((a, r) => a + monthly(r), 0);
  const pausedXero = all.filter((r) => r.status === "paused" && r.source === "xero").length;
  const href = (p: Record<string, string>) => `/hosting/recurring?${new URLSearchParams({ ...(cat !== "all" ? { c: cat } : {}), ...(st !== "all" ? { s: st } : {}), ...(site !== "all" ? { site } : {}), ...p }).toString()}`;
  const unlinkedHosting = all.filter((r) => r.category === "hosting" && !r.hosting_account_id).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl text-[0.8125rem] text-ink-muted">
          <p><strong className="text-ink">{money(activeMonthly, org.currency)}</strong> a month from {all.filter((r) => r.status === "active").length} active recurring invoices (inc GST).</p>
          {pausedXero > 0 && <p className="mt-1 text-amber-800">{pausedXero} imported from Xero and paused. For each one: delete (or end) its repeating invoice in Xero, check the next date here, then switch it on — otherwise the client is invoiced twice.</p>}
        </div>
        <div className="flex flex-wrap items-start gap-2"><ImportXero /><ButtonLink href="/hosting/recurring/new" variant="primary"><Plus className="h-4 w-4" />New</ButtonLink></div>
      </div>
      <div className="no-scrollbar flex flex-wrap gap-1.5">
        {["all", ...cats].map((c) => <Link key={c} href={href({ c })} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium capitalize", c === cat ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{c === "all" ? "All types" : c}</Link>)}
        <span className="mx-1 w-px bg-line" />
        {["all", "active", "paused", "ended"].map((s) => <Link key={s} href={href({ s })} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium capitalize", s === st ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{s === "all" ? "Any status" : s === "active" ? "On" : s}</Link>)}
        <span className="mx-1 w-px bg-line" />
        {[["all", "Any site"], ["yes", "Linked to a site"], ["no", `No site linked${unlinkedHosting ? ` (${unlinkedHosting} hosting)` : ""}`]].map(([v, l]) => <Link key={v} href={href({ site: v })} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v === site ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{l}</Link>)}
      </div>
      <form>{site !== "all" && <input type="hidden" name="site" value={site} />}{cat !== "all" && <input type="hidden" name="c" value={cat} />}{st !== "all" && <input type="hidden" name="s" value={st} />}<input name="q" defaultValue={sp.q ?? ""} placeholder="Search clients, names, references" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
      {!rows.length ? <Card><EmptyState title="No recurring invoices here">Import your repeating invoices from Xero, or add one.</EmptyState></Card> : (
        <Card className="divide-y divide-line">
          {rows.map((r) => (
            <Link key={r.id} href={`/hosting/recurring/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium text-ink">{r.customers?.name ?? "Client"} <span className="font-normal text-ink-muted">· {r.name}</span></p>
                <p className="truncate text-[0.75rem] text-ink-muted"><span className="capitalize">{r.category}</span> · {describeSchedule(r.every, r.unit)} · next {fmtDate(r.next_date, "short")}{r.source === "xero" ? " · from Xero" : ""}{r.send_mode === "draft" ? " · drafts" : r.send_mode === "email" ? " · emailed" : ""}</p>
                {r.hosting_accounts && <span className="mt-1 flex"><span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset ${r.hosting_accounts.suspended ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}><span className={`h-1.5 w-1.5 rounded-full ${r.hosting_accounts.suspended ? "bg-rose-500" : "bg-emerald-500"}`} />{r.hosting_accounts.domain}</span></span>}
                {r.last_error && <p className="truncate text-[0.7188rem] text-rose-700">{r.last_error}</p>}
              </div>
              <span className="text-[0.8125rem] tabular-nums text-ink">{money(Number(r.total), org.currency)}</span>
              <StatusSwitch id={r.id} status={r.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
