import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { addressLine, frequencyLabel, ORDER_STATUS, SUB_STATUS, type Address, type IntervalUnit } from "@/lib/shop/core";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: c } = await supabase.from("shop_customers").select("*").eq("organisation_id", org.id).eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: orders }, { data: subs }, { data: addresses }] = await Promise.all([
    supabase.from("shop_orders").select("id, number, status, total, created_at, source").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("shop_subscriptions").select("id, status, billing, interval_unit, interval_count, next_date").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("shop_addresses").select("id, label, name, company, line1, line2, suburb, state, postcode").eq("customer_id", id),
  ]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/store/customers" className="hover:underline">← Customers</Link>} title={c.name ?? c.email} subtitle={<>{c.email}{c.phone ? ` · ${c.phone}` : ""}{c.card_label ? ` · ${c.card_label}` : ""}{c.marketing_ok ? " · happy to get offers" : ""}</>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold text-ink">Subscriptions</h2>
          {!subs?.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">None.</p> : <ul className="mt-2 divide-y divide-line text-[0.8438rem]">{subs.map((s) => <li key={s.id}><Link href={`/store/subscriptions/${s.id}`} className="flex justify-between py-2 hover:underline"><span>{frequencyLabel(s.interval_unit as IntervalUnit, s.interval_count as number)} · {s.billing}</span><Badge>{SUB_STATUS[s.status as string] ?? s.status}</Badge></Link></li>)}</ul>}
          <h2 className="mt-5 font-semibold text-ink">Addresses</h2>
          {!addresses?.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">None saved.</p> : <ul className="mt-2 space-y-1 text-[0.8438rem]">{addresses.map((a) => <li key={a.id}><span className="font-medium">{a.label}:</span> {addressLine(a as Address)}</li>)}</ul>}
          {c.student_id && <p className="mt-5 text-[0.8438rem]"><Link href={`/bookings/students`} className="font-medium underline">Also a barista student</Link></p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-ink">Orders</h2>
          {!orders?.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">None.</p> : <ul className="mt-2 divide-y divide-line text-[0.8438rem]">{orders.map((o) => <li key={o.id}><Link href={`/store/orders/${o.id}`} className="flex justify-between py-2 hover:underline"><span>#{o.number} · {new Date(o.created_at as string).toLocaleDateString("en-AU")}{o.source === "woocommerce" ? " · Woo" : ""}</span><span className="text-ink-muted">{ORDER_STATUS[o.status as string] ?? o.status} · {money(o.total, org.currency, { cents: true })}</span></Link></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
