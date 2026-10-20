import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderEdit } from "@/components/wholesale/order-edit";
import { fmtDate, fmtDateTime, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WholesaleOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: o } = await supabase.from("wholesale_orders")
    .select("*, customer:wholesale_customers(id, name, business_name, phone, email, address1, address2, suburb, state, postcode, delivery_instructions), lines:wholesale_order_lines(name, sku, quantity, unit_price, tax_rate, line_total, comment, position)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!o) notFound();
  const c = o.customer as { id: string; name: string; business_name: string | null; phone: string | null; email: string | null; address1: string | null; address2: string | null; suburb: string | null; state: string | null; postcode: string | null; delivery_instructions: string | null } | null;
  const lines = ((o.lines ?? []) as { name: string; sku: string | null; quantity: number; unit_price: number; tax_rate: number; line_total: number; comment: string | null; position: number }[]).sort((a, b) => a.position - b.position);
  const cur = org.currency;
  const direct = o.source === "eventureos";
  return (
    <div>
      <div className="mb-5">
        <p className="mb-1 text-[0.75rem] text-ink-faint"><Link href="/wholesale/orders" className="hover:text-ink">Orders</Link> / {o.number}</p>
        <h1 className="flex flex-wrap items-center gap-2 text-[1.375rem] font-semibold tracking-tight text-ink">{o.number}<span className="font-normal text-ink-muted">· {c?.name ?? "Unknown customer"}</span></h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
          <Badge tone={direct ? "brand" : "slate"}>{direct ? "Ordered here" : "Ordermentum"}</Badge>
          <span>Ordered {fmtDate(o.order_date, "long")}</span>
          {o.delivery_date && <Link href={`/wholesale?run=${o.delivery_date}`} className="hover:underline">Delivery {fmtDate(o.delivery_date, "long")}</Link>}
          {direct && <span>{o.payment_status === "paid" ? `Paid${o.paid_at ? ` ${fmtDateTime(o.paid_at, org.timezone)}` : ""}` : o.payment_mode === "invoice" ? `On account${o.due_date ? `, due ${fmtDate(o.due_date)}` : ""}` : "Not paid"}</span>}
          {!direct && <span>Payment handled by Ordermentum</span>}
        </p>
      </div>
      {o.needs_check && <div className="mb-4 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />Check this order: {o.needs_check}</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Items" subtitle="Prices ex GST" />
          <table className="w-full text-[0.8438rem]">
            <thead><tr className="border-y border-line text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-5 py-2 font-medium">Item</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-2 py-2 text-right font-medium">Price</th><th className="px-5 py-2 text-right font-medium">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {lines.map((l, i) => (
                <tr key={i}><td className="px-5 py-2 text-ink">{l.name}{Number(l.tax_rate) > 0 && <span className="ml-1 text-[0.6875rem] text-ink-faint">GST</span>}{l.comment && <span className="block text-[0.75rem] text-ink-muted">{l.comment}</span>}</td><td className="px-2 py-2 text-right tabular">{Number(l.quantity)}</td><td className="px-2 py-2 text-right tabular text-ink-muted">{money(l.unit_price, cur, { cents: true })}</td><td className="px-5 py-2 text-right tabular text-ink">{money(l.line_total, cur, { cents: true })}</td></tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1 border-t border-line px-5 py-3 text-[0.8125rem]">
            <div className="flex justify-between text-ink-muted"><dt>Subtotal</dt><dd className="tabular">{money(o.subtotal, cur, { cents: true })}</dd></div>
            {Number(o.freight) > 0 && <div className="flex justify-between text-ink-muted"><dt>Freight</dt><dd className="tabular">{money(o.freight, cur, { cents: true })}</dd></div>}
            {Number(o.discount) > 0 && <div className="flex justify-between text-ink-muted"><dt>Discount</dt><dd className="tabular">−{money(o.discount, cur, { cents: true })}</dd></div>}
            <div className="flex justify-between text-ink-muted"><dt>GST</dt><dd className="tabular">{money(o.gst, cur, { cents: true })}</dd></div>
            <div className="flex justify-between pt-1 text-[0.9375rem] font-semibold text-ink"><dt>Total</dt><dd className="tabular">{money(o.total, cur, { cents: true })}</dd></div>
          </dl>
          {o.customer_note && <p className="mx-5 mb-4 rounded-md bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-100">Customer note: {o.customer_note}</p>}
        </Card>
        <div className="space-y-6">
          <Card className="p-5"><OrderEdit id={o.id} status={o.status} delivery={o.delivery_date} payment={o.payment_status} note={o.office_note} needsCheck={o.needs_check} direct={direct} /></Card>
          {c && (
            <Card>
              <CardHeader title={<Link href={`/wholesale/customers/${c.id}`} className="hover:text-brand-700">{c.name}</Link>} subtitle={c.business_name ?? undefined} />
              <div className="space-y-1 px-5 pb-5 text-[0.8125rem] text-ink-muted">
                {(o.ship_to as { text?: string } | null)?.text ? <p>Deliver to: {(o.ship_to as { text: string }).text}</p> : <p>{[c.address1, c.address2, [c.suburb, c.state, c.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "No address"}</p>}
                {c.phone && <p>{c.phone}</p>}{c.email && <p>{c.email}</p>}
                {c.delivery_instructions && <p className="text-sky-800">Delivery: {c.delivery_instructions}</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
