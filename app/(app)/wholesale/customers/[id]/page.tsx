import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerForm } from "@/components/wholesale/customer-form";
import { OrderLinkBox } from "@/components/wholesale/order-link";
import type { CustomerInput } from "@/app/(app)/wholesale/actions";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fmtDate, money } from "@/lib/format";
import { readWholesale } from "@/lib/wholesale/settings";

export const dynamic = "force-dynamic";

const BLANK: CustomerInput = { name: "", payment_mode: "card", payment_terms_days: 7, delivery_weekday: null, min_order: 0, active: true };

export default async function WholesaleCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const ws = readWholesale(org.settings);
  const { data: groupRows } = await supabase.from("wholesale_group_prices").select("price_group").eq("organisation_id", org.id);
  const groups = [...new Set(((groupRows ?? []) as { price_group: string }[]).map((g) => g.price_group))].sort();
  if (isNew) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-[1.375rem] font-semibold tracking-tight text-ink">Add a wholesale customer</h1>
        <Card className="p-5"><CustomerForm id={null} initial={BLANK} groups={groups} defaultDay={ws.deliveryWeekday} canEdit={canManage(role)} /></Card>
      </div>
    );
  }
  const { data: c } = await supabase.from("wholesale_customers").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!c) notFound();
  const { data: orders } = await supabase.from("wholesale_orders").select("id, number, source, status, order_date, delivery_date, total, lines:wholesale_order_lines(name, quantity)").eq("customer_id", id).order("order_date", { ascending: false }).limit(100);
  type O = { id: string; number: string; source: string; status: string; order_date: string; delivery_date: string | null; total: number; lines: { name: string; quantity: number }[] };
  const list = (orders ?? []) as unknown as O[];
  const live = list.filter((o) => o.status !== "cancelled");
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const year = live.filter((o) => o.order_date >= yearAgo);
  // What they usually order
  const usual = new Map<string, number>();
  for (const o of year) for (const l of o.lines) usual.set(l.name, (usual.get(l.name) ?? 0) + Number(l.quantity));
  const initial: CustomerInput = {
    name: c.name, business_name: c.business_name, email: c.email, billing_email: c.billing_email, phone: c.phone, contact_name: c.contact_name, address1: c.address1, address2: c.address2,
    suburb: c.suburb, state: c.state, postcode: c.postcode, delivery_instructions: c.delivery_instructions, notes: c.notes, abn: c.abn, price_group: c.price_group,
    payment_mode: c.payment_mode, payment_terms_days: c.payment_terms_days, delivery_weekday: c.delivery_weekday, min_order: Number(c.min_order), active: c.active,
  };
  return (
    <div>
      <div className="mb-5">
        <p className="mb-1 text-[0.75rem] text-ink-faint"><Link href="/wholesale/customers" className="hover:text-ink">Customers</Link> / {c.name}</p>
        <h1 className="flex flex-wrap items-center gap-2 text-[1.375rem] font-semibold tracking-tight text-ink">{c.name}{!c.active && <Badge tone="slate">Inactive</Badge>}{c.source === "ordermentum" && <Badge tone="slate">From Ordermentum</Badge>}</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">{year.length ? `${year.length} order${year.length === 1 ? "" : "s"} · ${money(year.reduce((t, o) => t + Number(o.total), 0), org.currency)} in the last 12 months` : "No orders in the last 12 months"}{live[0] ? ` · last ordered ${fmtDate(live[0].order_date)}` : ""}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-5"><CustomerForm id={c.id} initial={initial} groups={groups} defaultDay={ws.deliveryWeekday} canEdit={canManage(role)} /></Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Ordering link" subtitle="Their own page to order with their prices — no login" />
            <div className="px-5 pb-5"><OrderLinkBox id={c.id} url={`${appBaseUrl()}/order/${c.order_token}`} email={c.email || c.billing_email} ordering={ws.ordering} active={c.active} canEdit={canManage(role)} /></div>
          </Card>
          {usual.size > 0 && (
            <Card>
              <CardHeader title="Usually orders" subtitle="Last 12 months" />
              <ul className="divide-y divide-line border-t border-line">
                {[...usual.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, q]) => <li key={n} className="flex justify-between px-5 py-2 text-[0.8125rem]"><span className="text-ink">{n}</span><span className="tabular text-ink-muted">{q}</span></li>)}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Orders" subtitle={list.length >= 100 ? "Latest 100" : undefined} />
            {list.length === 0 ? <EmptyState title="No orders yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {list.slice(0, 30).map((o) => (
                  <li key={o.id}><Link href={`/wholesale/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                    <span className="min-w-0"><span className="block text-[0.8125rem] font-medium text-ink">{o.number} <span className="font-normal text-ink-faint">· {fmtDate(o.order_date)}</span>{o.status === "cancelled" && <span className="ml-1 text-rose-700">cancelled</span>}</span><span className="block truncate text-[0.75rem] text-ink-muted">{o.lines.map((l) => `${Number(l.quantity)} × ${l.name}`).join(", ")}</span></span>
                    <span className="shrink-0 tabular text-[0.8125rem] text-ink">{money(o.total, org.currency)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
