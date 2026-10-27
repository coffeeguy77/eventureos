import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDateTime, money } from "@/lib/format";
import { ATTENTION, REVIEW, STATUS_TONE } from "@/lib/hosting/core";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckNow } from "@/components/hosting/check-now";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "attention", label: "Needs action" }, { key: "suspended", label: "Suspended" }, { key: "due", label: "Due soon" },
  { key: "paid", label: "Paid" }, { key: "review", label: "To match" }, { key: "noclient", label: "No client" }, { key: "protected", label: "Protected" }, { key: "all", label: "All" },
] as const;

type Row = { id: string; domain: string; username: string | null; plan: string | null; on_server: boolean; suspended: boolean; suspended_by_app: boolean; billing_status: string | null; match_status: string | null; amount_due: number | null; days_overdue: number | null; due_date: string | null; last_notice_at: string | null; customer_id: string | null; hosting_servers: { name: string; kind: string } | null; customers: { name: string } | null };

/** Every hosting account, matched to its invoice: who's paid, who's overdue, who's suspended. */
export default async function HostingPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v)?.key ?? "attention";
  const [{ data }, { data: xero }, { count: servers }] = await Promise.all([
    supabase.from("hosting_accounts").select("id, domain, username, plan, on_server, suspended, suspended_by_app, billing_status, match_status, amount_due, days_overdue, due_date, last_notice_at, customer_id, hosting_servers(name, kind), customers(name)").eq("organisation_id", org.id).order("domain").limit(5000),
    supabase.from("integrations").select("status, last_sync_at, last_sync_status").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
    supabase.from("hosting_servers").select("id", { count: "exact", head: true }).eq("organisation_id", org.id),
  ]);
  const all = (data ?? []) as unknown as Row[];
  const st = (r: Row) => r.billing_status ?? "No Match";
  const counts = {
    attention: all.filter((r) => r.on_server && ATTENTION.includes(st(r) as never)).length,
    suspended: all.filter((r) => r.suspended).length,
    due: all.filter((r) => st(r) === "Due Soon").length,
    paid: all.filter((r) => st(r) === "Paid").length,
    review: all.filter((r) => r.on_server && (REVIEW.includes(st(r) as never) || r.match_status === "Client Match" || r.match_status === "Multiple Matches")).length,
    protected: all.filter((r) => ["VIP Protected", "Disputed", "Manual Override", "Extended"].includes(st(r))).length,
    noclient: all.filter((r) => !r.customer_id).length,
    all: all.length,
  };
  let rows = all;
  if (view === "attention") rows = all.filter((r) => r.on_server && ATTENTION.includes(st(r) as never));
  if (view === "suspended") rows = all.filter((r) => r.suspended);
  if (view === "due") rows = all.filter((r) => st(r) === "Due Soon");
  if (view === "paid") rows = all.filter((r) => st(r) === "Paid");
  if (view === "review") rows = all.filter((r) => r.on_server && (REVIEW.includes(st(r) as never) || r.match_status === "Client Match" || r.match_status === "Multiple Matches"));
  if (view === "noclient") rows = all.filter((r) => !r.customer_id);
  if (view === "protected") rows = all.filter((r) => ["VIP Protected", "Disputed", "Manual Override", "Extended"].includes(st(r)));
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.domain, r.username, r.customers?.name].filter(Boolean).join(" ").toLowerCase().includes(q));
  if (view === "attention") rows = [...rows].sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0));
  const owing = all.filter((r) => r.on_server && ATTENTION.includes(st(r) as never)).reduce((a, r) => a + Number(r.amount_due ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[0.8125rem] text-ink-muted">
          <p>{xero?.last_sync_at ? <>Xero last checked <strong className="text-ink">{fmtDateTime(xero.last_sync_at as string, org.timezone)}</strong>{xero.last_sync_status && xero.last_sync_status !== "success" ? ` (${xero.last_sync_status})` : ""}.</> : "Xero hasn't synced yet."} Payments made in Xero show here after the next check — a direct deposit that isn't reconciled in Xero yet will still show as owing.</p>
          {owing > 0 && <p className="mt-1"><strong className="text-ink">{money(owing, org.currency)}</strong> overdue across {counts.attention} account{counts.attention === 1 ? "" : "s"}.</p>}
        </div>
        <CheckNow />
      </div>
      {!servers ? <Card><EmptyState title="No servers yet" action={<Link href="/hosting/servers" className="text-[0.8125rem] font-medium text-brand-600 underline">Add your WHM and SiteGround servers</Link>}>Add a server and sync it to bring in its hosting accounts.</EmptyState></Card> : <>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {VIEWS.map((v) => <Link key={v.key} href={`/hosting?v=${v.key}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v.key === view ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label} <span className="opacity-60">{counts[v.key]}</span></Link>)}
        </div>
        <form><input type="hidden" name="v" value={view} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search domains, cPanel users, clients" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
        {!rows.length ? <Card><EmptyState title="Nothing here">No accounts in this list.</EmptyState></Card> : (
          <Card className="divide-y divide-line">
            {rows.map((r) => (
              <Link key={r.id} href={`/hosting/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">{r.domain}{!r.on_server && <span className="ml-2 text-[0.7188rem] font-normal text-ink-faint">no longer on the server</span>}</p>
                  <p className="truncate text-[0.75rem] text-ink-muted">{!r.customer_id && <span className="mr-1 rounded bg-zinc-100 px-1 text-ink-faint">no client</span>}{[r.customers?.name, r.hosting_servers?.name, r.username, r.plan].filter(Boolean).join(" · ")}{r.match_status === "Client Match" ? " · matched by client" : ""}</p>
                </div>
                {Number(r.amount_due) > 0 && <span className="text-right text-[0.8125rem] tabular-nums text-ink">{money(Number(r.amount_due), org.currency)}{(r.days_overdue ?? 0) > 0 && <span className="block text-[0.6875rem] text-rose-700">{r.days_overdue} days over</span>}</span>}
                {r.suspended && <Badge tone="red">{r.suspended_by_app ? "Suspended" : "Suspended (outside)"}</Badge>}
                <Badge tone={STATUS_TONE[st(r)] ?? "neutral"}>{st(r)}</Badge>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </Link>
            ))}
          </Card>
        )}
      </>}
    </div>
  );
}
