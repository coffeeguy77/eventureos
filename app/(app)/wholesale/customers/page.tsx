import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate, money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function WholesaleCustomersPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const sp = await searchParams;
  const show = sp.show === "inactive" ? "inactive" : "active";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  let query = supabase.from("wholesale_customers").select("id, name, business_name, suburb, payment_mode, payment_terms_days, price_group, last_order_at, source, notes").eq("organisation_id", org.id).eq("active", show === "active").order("name");
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = query.or(`name.ilike.${like},business_name.ilike.${like},email.ilike.${like},suburb.ilike.${like}`); }
  const { data } = await query;
  type Row = { id: string; name: string; business_name: string | null; suburb: string | null; payment_mode: string; payment_terms_days: number; price_group: string | null; last_order_at: string | null; source: string; notes: string | null };
  const rows = (data ?? []) as Row[];
  // Spend over the last 12 months
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const { data: ord } = rows.length ? await supabase.from("wholesale_orders").select("customer_id, total, order_date").eq("organisation_id", org.id).neq("status", "cancelled").gte("order_date", since).in("customer_id", rows.map((r) => r.id)) : { data: [] };
  const stats = new Map<string, { n: number; total: number; last: string }>();
  for (const o of (ord ?? []) as { customer_id: string; total: number; order_date: string }[]) {
    const s = stats.get(o.customer_id) ?? { n: 0, total: 0, last: "" };
    s.n++; s.total += Number(o.total); if (o.order_date > s.last) s.last = o.order_date;
    stats.set(o.customer_id, s);
  }
  const { count: inactive } = await supabase.from("wholesale_customers").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("active", false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["active", "inactive"] as const).map((k) => <Link key={k} href={`/wholesale/customers?show=${k}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", k === show ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{k === "active" ? "Active" : `Inactive${inactive ? ` (${inactive})` : ""}`}</Link>)}
        <form className="ml-auto flex w-full gap-2 sm:w-auto"><input type="hidden" name="show" value={show} /><input name="q" defaultValue={q} placeholder="Name, email or suburb" aria-label="Search customers" className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] sm:h-9 sm:w-56" /></form>
        <ButtonLink href="/wholesale/customers/new" size="sm" variant="primary" className="h-10 sm:h-9"><Plus className="h-4 w-4" />Add customer</ButtonLink>
      </div>
      {rows.length === 0 ? <Card><EmptyState title="No customers here" /></Card> : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((c) => {
              const s = stats.get(c.id);
              const last = s?.last || c.last_order_at?.slice(0, 10) || null;
              return (
                <li key={c.id}>
                  <Link href={`/wholesale/customers/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50/70 sm:px-5">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="flex flex-wrap items-center gap-2 text-[0.8438rem] font-medium text-ink">{c.name}{c.notes?.startsWith("Added from an Ordermentum order email") && <Badge tone="amber">New — check details</Badge>}</p>
                      <p className="truncate text-[0.75rem] text-ink-muted">{[c.business_name && c.business_name !== c.name ? c.business_name : null, c.suburb].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={c.payment_mode === "card" ? "neutral" : "slate"}>{c.payment_mode === "card" ? "Card" : `Invoice ${c.payment_terms_days}d`}</Badge>
                      {c.price_group && <Badge tone="brand">{c.price_group}</Badge>}
                    </div>
                    <div className="w-40 text-right text-[0.75rem] text-ink-muted">
                      <span className="block tabular text-[0.8125rem] font-medium text-ink">{s ? money(s.total, org.currency) : "—"}</span>
                      <span className="block">{s ? `${s.n} order${s.n === 1 ? "" : "s"} in 12 months` : "No orders in 12 months"}{last ? ` · last ${fmtDate(last)}` : ""}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
