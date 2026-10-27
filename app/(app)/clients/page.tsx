import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/records/filter-bar";
import { fmtDate, money } from "@/lib/format";
import { HostingPills, hostingByClient } from "@/components/hosting/pills";
import { codeRules, hasHostingCode, readHosting } from "@/lib/hosting/core";

export const metadata = { title: "Clients" };

type Row = {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; kind: string; tags: string[] | null; customer_since: string | null;
  events: number; upcoming: number; lifetime: number; owing: number; overdue: boolean; last_invoice: string | null; total_count: number;
};
const PAGE = 100;
const SORTS = [{ value: "value", label: "Lifetime value" }, { value: "owing", label: "Outstanding" }, { value: "recent", label: "Recently invoiced" }];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; sort?: string; page?: string; hosting?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const money_ = role === "owner" || role === "admin" || role === "manager";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const sort = SORTS.some((x) => x.value === sp.sort) ? sp.sort! : "name";
  // Hosting filter: clients with a hosting account, without one, or billed for hosting but with no site linked
  const hostingFilter = ["yes", "none", "missing"].includes(sp.hosting ?? "") ? sp.hosting! : null;
  const allHosting = await hostingByClient(supabase, org.id);
  const hasHosting = allHosting.size > 0;
  let rows: Row[];
  let total: number;
  if (!hostingFilter) {
    const { data, error } = await supabase.rpc("client_list", {
      p_org: org.id, p_q: sp.q?.trim().slice(0, 100) || null, p_kind: sp.kind === "company" || sp.kind === "individual" ? sp.kind : null,
      p_sort: sort, p_limit: PAGE, p_offset: (page - 1) * PAGE,
    });
    if (error) throw new Error(`Could not load clients: ${error.message}`);
    rows = (data ?? []) as Row[];
    total = Number(rows[0]?.total_count ?? 0);
  } else {
    const { data, error } = await supabase.rpc("client_list", {
      p_org: org.id, p_q: sp.q?.trim().slice(0, 100) || null, p_kind: sp.kind === "company" || sp.kind === "individual" ? sp.kind : null,
      p_sort: sort, p_limit: 5000, p_offset: 0,
    });
    if (error) throw new Error(`Could not load clients: ${error.message}`);
    let keep = new Set<string>();
    if (hostingFilter === "missing") {
      const rules = codeRules(readHosting(org.settings));
      const since = new Date(Date.now() - 396 * 86_400_000).toISOString().slice(0, 10);
      const { data: inv } = await supabase.from("invoices").select("customer_id, line_items").eq("organisation_id", org.id).gte("issue_date", since).neq("status", "void").limit(10000);
      for (const i of (inv ?? []) as { customer_id: string | null; line_items: { item_code?: string | null }[] | null }[])
        if (i.customer_id && !allHosting.has(i.customer_id) && hasHostingCode((i.line_items ?? []).map((l) => (l?.item_code ?? "").trim()).filter(Boolean), rules)) keep.add(i.customer_id);
      const { data: rec } = await supabase.from("recurring_invoices").select("customer_id").eq("organisation_id", org.id).eq("category", "hosting").neq("status", "ended").then((x) => x, () => ({ data: [] }));
      for (const r of (rec ?? []) as { customer_id: string }[]) if (!allHosting.has(r.customer_id)) keep.add(r.customer_id);
    } else keep = new Set(allHosting.keys());
    const filtered = ((data ?? []) as Row[]).filter((c) => (hostingFilter === "none" ? !keep.has(c.id) : keep.has(c.id)));
    total = filtered.length;
    rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  }
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (sp.q) q.set("q", sp.q);
    if (sp.kind) q.set("kind", sp.kind);
    if (sort !== "name") q.set("sort", sort);
    if (sp.hosting) q.set("hosting", sp.hosting);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/clients${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="Clients" subtitle="Everyone you’ve worked with, and what they’re worth."
        actions={<ButtonLink href="/clients/new" variant="primary">New client</ButtonLink>} />
      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar searchPlaceholder="Search name, company, email, phone…"
            filters={[{ key: "kind", label: "Type", options: [{ value: "company", label: "Companies" }, { value: "individual", label: "Individuals" }] },
              ...(hasHosting ? [{ key: "hosting", label: "Hosting", options: [{ value: "yes", label: "Has hosting" }, { value: "missing", label: "Billed for hosting — no site linked" }, { value: "none", label: "No hosting" }] }] : []),
              ...(money_ ? [{ key: "sort", label: "Sort: name", options: SORTS }] : [])]} />
        </div>
        {rows.length === 0 ? <EmptyState title="No clients found" /> : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((c) => {
              const owing = Number(c.owing), overdue = c.overdue;
              return (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-3 active:bg-zinc-50">
                    <Avatar name={c.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8438rem] font-medium text-ink">{c.name}</div>
                      <div className="truncate text-[0.7812rem] text-ink-muted">{c.email ?? c.phone ?? "—"}</div>
                      <div className="mt-0.5 truncate text-[0.75rem] text-ink-faint">{c.events} event{c.events === 1 ? "" : "s"}</div>
                      {allHosting.has(c.id) && <div className="mt-1"><HostingPills list={allHosting.get(c.id)} max={2} link={false} /></div>}
                    </div>
                    {owing > 0 && (
                      <div className="shrink-0 text-right">
                        <div className={`tabular text-[0.7812rem] ${overdue ? "font-medium text-rose-700" : "text-ink"}`}>{money(owing, org.currency)}</div>
                        <div className="text-[0.7188rem] text-ink-faint">{overdue ? "overdue" : "owing"}</div>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-left text-[0.8125rem]">
              <thead><tr className="border-b border-line text-[0.7188rem] uppercase tracking-wide text-ink-faint">
                {["Client", "Contact", "Events", "Lifetime value", "Outstanding", "Client since"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 font-medium ${["Events", "Lifetime value", "Outstanding"].includes(h) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const ltv = Number(c.lifetime), owing = Number(c.owing), overdue = c.overdue, upcoming = c.upcoming;
                  return (
                    <tr key={c.id} className="relative hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <Link href={`/clients/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                          <Avatar name={c.name} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{c.name}</span>
                            <span className="flex gap-1">{(c.tags ?? []).slice(0, 2).map((t) => <Badge key={t} className="!py-0 !text-[0.6562rem]">{t}</Badge>)}</span>
                          </span>
                        </Link>
                        {allHosting.has(c.id) && <div className="mt-1.5 pl-[42px]"><HostingPills list={allHosting.get(c.id)} /></div>}
                      </td>
                      <td className="px-4 py-3 text-ink-muted"><span className="block">{c.email ?? "—"}</span><span className="text-[0.75rem] text-ink-faint">{c.phone}</span></td>
                      <td className="tabular px-4 py-3 text-right text-ink">{c.events}{upcoming > 0 && <span className="block text-[0.7188rem] text-ink-faint">{upcoming} upcoming</span>}</td>
                      <td className="tabular px-4 py-3 text-right text-ink">{money(ltv, org.currency, { cents: false })}</td>
                      <td className={`tabular px-4 py-3 text-right ${overdue ? "font-medium text-rose-700" : owing > 0 ? "text-ink" : "text-ink-faint"}`}>{owing > 0 ? money(owing, org.currency) : "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{fmtDate(c.customer_since)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-faint">
          <span>{total ? `${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + rows.length} of ${total}` : "0"} client{total === 1 ? "" : "s"}</span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              {page > 1 ? <Link href={href(page - 1)} className="rounded-md px-2.5 py-1 font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Previous</Link> : null}
              <span>Page {page} of {pages}</span>
              {page < pages ? <Link href={href(page + 1)} className="rounded-md px-2.5 py-1 font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Next</Link> : null}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
