import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderTools } from "@/components/store/order-tools";
import { addressLine, ORDER_STATUS, type Address } from "@/lib/shop/core";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: o } = await supabase.from("shop_orders").select("*, customer:shop_customers(id, name, email, phone), event:events(id, name)").eq("organisation_id", org.id).eq("id", id).maybeSingle();
  if (!o) notFound();
  const items = (o.items as { name: string; variant: string; grind_label: string | null; qty: number; unit_price: number; line_total: number }[]) ?? [];
  const a = o.address as Address;
  const cur = org.currency;
  return (
    <>
      <PageHeader eyebrow={<Link href="/store" className="hover:underline">← Orders</Link>} title={`Order #${o.number}`} subtitle={<>{new Date(o.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · <Badge>{ORDER_STATUS[o.status] ?? o.status}</Badge>{o.source === "woocommerce" ? <> · imported from WooCommerce{o.woo_status ? ` (${o.woo_status})` : ""}</> : null}</>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] print:block">
        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">To pack</h2>
          <ul className="mt-3 divide-y divide-line">
            {items.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2.5 text-[0.875rem]"><span><span className="text-[1rem] font-semibold text-ink">{i.qty} × {i.name} {i.variant}</span>{i.grind_label && <span className="block font-medium text-brand-700">Grind: {i.grind_label}</span>}</span><span className="text-ink-muted">{money(i.line_total, cur, { cents: true })}</span></li>)}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[0.8438rem]">
            <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd>{money(o.subtotal, cur, { cents: true })}</dd></div>
            {Number(o.discount) > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Discount{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd>−{money(o.discount, cur, { cents: true })}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-muted">Shipping</dt><dd>{money(o.shipping, cur, { cents: true })}</dd></div>
            {Number(o.gift_amount) > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Gift card</dt><dd>−{money(o.gift_amount, cur, { cents: true })}</dd></div>}
            <div className="flex justify-between text-[0.9375rem] font-semibold"><dt>Total</dt><dd>{money(o.total, cur, { cents: true })}</dd></div>
          </dl>
          <div className="mt-5 rounded-lg bg-zinc-50 p-4 text-[0.875rem]">
            <p className="font-semibold text-ink">{o.delivery === "pickup" ? "Pick up" : o.delivery === "event" ? `Deliver with event${o.event ? `: ${o.event.name}` : ""}` : "Post to"}</p>
            {o.delivery === "post" && <><p className="mt-1 text-ink">{a?.name || o.name}</p><p className="text-ink">{addressLine(a)}</p>{a?.instructions && <p className="mt-1 text-ink-muted">“{a.instructions}”</p>}</>}
            {o.customer_note && <p className="mt-2 text-ink-muted">Note: {o.customer_note}</p>}
          </div>
        </Card>
        <div className="space-y-5 print:hidden">
          <Card className="p-5"><OrderTools id={o.id} status={o.status} tracking={o.tracking_number ?? ""} note={o.office_note ?? ""} dispatchOn={o.dispatch_on} woo={o.source === "woocommerce"} /></Card>
          <Card className="p-5 text-[0.8438rem]">
            <h2 className="font-semibold text-ink">Customer</h2>
            <p className="mt-2 text-ink">{o.customer?.name ?? o.name}</p><p className="text-ink-muted">{o.customer?.email ?? o.email}</p>{(o.customer?.phone ?? o.phone) && <p className="text-ink-muted">{o.customer?.phone ?? o.phone}</p>}
            {o.customer && <Link href={`/store/customers/${o.customer.id}`} className="mt-2 inline-block font-medium text-ink underline">All their orders</Link>}
            {o.subscription_id && <p className="mt-2"><Link href={`/store/subscriptions/${o.subscription_id}`} className="font-medium text-ink underline">Open subscription</Link></p>}
            <p className="mt-2"><a href={`/shop/${org.slug}/order/${o.view_token}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline">Customer&apos;s view</a></p>
          </Card>
        </div>
      </div>
    </>
  );
}
