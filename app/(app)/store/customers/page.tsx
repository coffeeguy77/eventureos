import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAID = ["paid", "roasting", "packed", "shipped", "completed"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  let query = supabase.from("shop_customers").select("id, name, email, phone, source, student_id, created_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(500);
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = query.or(`name.ilike.${like},email.ilike.${like}`); }
  const { data: custs } = await query;
  const ids = (custs ?? []).map((c) => c.id as string);
  const [{ data: orders }, { data: subs }] = await Promise.all([
    ids.length ? supabase.from("shop_orders").select("customer_id, total, status").in("customer_id", ids).in("status", PAID) : Promise.resolve({ data: [] as { customer_id: string; total: number; status: string }[] }),
    ids.length ? supabase.from("shop_subscriptions").select("customer_id, status").in("customer_id", ids).in("status", ["active", "paused", "payment_failed"]) : Promise.resolve({ data: [] as { customer_id: string; status: string }[] }),
  ]);
  const spent = new Map<string, { n: number; t: number }>();
  for (const o of orders ?? []) { const s = spent.get(o.customer_id as string) ?? { n: 0, t: 0 }; s.n++; s.t += Number(o.total); spent.set(o.customer_id as string, s); }
  const subbed = new Set((subs ?? []).map((s) => s.customer_id as string));
  return (
    <>
      <PageHeader title="Customers" subtitle={`${ids.length}${ids.length === 500 ? "+" : ""} shoppers · ${subbed.size} with a subscription`} />
      <form className="mb-3"><input name="q" defaultValue={q} placeholder="Search name or email" className="h-10 w-full max-w-sm rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem]" /></form>
      {!custs?.length ? <Card><EmptyState title="No customers yet">Shoppers appear here after their first order or sign-in.</EmptyState></Card> : (
        <Card className="divide-y divide-line overflow-hidden">
          {custs.map((c) => { const s = spent.get(c.id as string); return (
            <Link key={c.id} href={`/store/customers/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50">
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{c.name ?? c.email}</p><p className="text-[0.75rem] text-ink-muted">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p></div>
              {c.student_id && <Badge tone="blue">Barista student</Badge>}
              {subbed.has(c.id as string) && <Badge tone="brand">Subscriber</Badge>}
              {c.source === "woocommerce" && <Badge tone="slate">From WooCommerce</Badge>}
              <div className="w-36 text-right text-[0.8125rem] text-ink-muted">{s ? `${s.n} order${s.n === 1 ? "" : "s"} · ${money(s.t, org.currency)}` : "No orders"}</div>
            </Link>
          ); })}
        </Card>
      )}
    </>
  );
}
