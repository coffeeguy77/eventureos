import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, Phone } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderStatusButtons, RunActions } from "@/components/wholesale/run-actions";
import { fmtDate, money } from "@/lib/format";
import { currentRun, runTotals, shiftRun } from "@/lib/wholesale/rules";
import { readWholesale } from "@/lib/wholesale/settings";

export const dynamic = "force-dynamic";

type Line = { name: string; quantity: number; unit_price: number; line_total: number; weight_kg: number | null; comment: string | null; position: number };
type Row = {
  id: string; number: string; source: string; status: string; total: number; payment_status: string; payment_mode: string | null; customer_note: string | null; needs_check: string | null;
  ship_to: { text?: string } | null; order_date: string;
  customer: { id: string; name: string; phone: string | null; address1: string | null; address2: string | null; suburb: string | null; state: string | null; postcode: string | null; delivery_instructions: string | null } | null;
  lines: Line[];
};

const STATUS: Record<string, { label: string; tone: "neutral" | "amber" | "green" | "slate" }> = {
  placed: { label: "To pack", tone: "amber" }, packed: { label: "Packed", tone: "neutral" }, delivered: { label: "Delivered", tone: "green" },
};

export default async function RunSheetPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const ws = readWholesale(org.settings);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone || "Australia/Sydney" }).format(new Date());
  const run = sp.run && /^\d{4}-\d{2}-\d{2}$/.test(sp.run) ? sp.run : currentRun(today, ws.deliveryWeekday);
  const { data } = await supabase.from("wholesale_orders")
    .select("id, number, source, status, total, payment_status, payment_mode, customer_note, needs_check, ship_to, order_date, customer:wholesale_customers(id, name, phone, address1, address2, suburb, state, postcode, delivery_instructions), lines:wholesale_order_lines(name, quantity, unit_price, line_total, weight_kg, comment, position)")
    .eq("organisation_id", org.id).eq("delivery_date", run).in("status", ["placed", "packed", "delivered"]);
  const orders = ((data ?? []) as unknown as Row[]).sort((a, b) => (a.customer?.suburb ?? "").localeCompare(b.customer?.suburb ?? "") || (a.customer?.name ?? "").localeCompare(b.customer?.name ?? ""));
  const totals = runTotals(orders.flatMap((o) => o.lines.map((l) => ({ name: l.name, quantity: Number(l.quantity), weight_kg: l.weight_kg == null ? null : Number(l.weight_kg) }))));
  const kg = totals.reduce((t, r) => t + (r.kg ?? 0), 0);
  const value = orders.reduce((t, o) => t + Number(o.total), 0);
  const { count: pending } = await supabase.from("wholesale_orders").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).gt("delivery_date", run).in("status", ["placed"]);
  const address = (o: Row) => o.ship_to?.text || [o.customer?.address1, o.customer?.address2, [o.customer?.suburb, o.customer?.state, o.customer?.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint print:hidden">Run sheet</p>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">{fmtDate(run, "long")}{run === today ? <span className="ml-2 align-middle"><Badge tone="brand">Today</Badge></span> : null}</h1>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            {orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"} · ${money(value, org.currency)} inc GST${kg ? ` · ${Number(kg.toFixed(2))} kg of coffee` : ""}` : "No orders for this run yet"}
            {(pending ?? 0) > 0 && <span className="print:hidden"> · {pending} more for later runs</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <Link href={`/wholesale?run=${shiftRun(run, -1)}`} className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-line hover:bg-zinc-50" aria-label="Previous run"><ChevronLeft className="h-4 w-4" /></Link>
          <form action="/wholesale"><input type="date" name="run" defaultValue={run} aria-label="Run date" className="h-10 rounded-lg border border-line-strong bg-surface px-2 text-[0.8125rem]" /></form>
          <Link href={`/wholesale?run=${shiftRun(run, 1)}`} className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-line hover:bg-zinc-50" aria-label="Next run"><ChevronRight className="h-4 w-4" /></Link>
          {run !== currentRun(today, ws.deliveryWeekday) && <Link href="/wholesale" className="ml-1 text-[0.8125rem] font-medium text-brand-700 hover:underline">This week</Link>}
        </div>
      </div>
      <div className="mb-5"><RunActions run={run} canImport={ws.emailImport.enabled} open={{ placed: orders.filter((o) => o.status === "placed").length, packed: orders.filter((o) => o.status === "packed").length }} /></div>

      {orders.length === 0 ? (
        <Card><EmptyState title="Nothing on this run">{ws.emailImport.enabled ? "Ordermentum orders appear here within about 10 minutes of the order email arriving." : "Orders for this delivery day will show here."}</EmptyState></Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] print:block">
          <div className="space-y-4 print:space-y-3">
            {orders.map((o) => {
              const st = STATUS[o.status] ?? STATUS.placed;
              return (
                <Card key={o.id} className="break-inside-avoid p-4 sm:p-5 print:rounded-none print:border-x-0 print:border-t-0 print:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        {o.customer ? <Link href={`/wholesale/customers/${o.customer.id}`} className="text-[0.9375rem] font-semibold text-ink hover:text-brand-700">{o.customer.name}</Link> : <span className="text-[0.9375rem] font-semibold text-ink">Unknown customer</span>}
                        <Link href={`/wholesale/orders/${o.id}`} className="text-[0.75rem] text-ink-faint hover:underline">{o.number}</Link>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {o.source === "eventureos" && <Badge tone="brand">Direct</Badge>}
                        {o.payment_status === "unpaid" && o.payment_mode === "invoice" && <Badge tone="slate">On account</Badge>}
                        {o.payment_status === "paid" && o.source === "eventureos" && <Badge tone="green">Paid</Badge>}
                      </p>
                      {address(o) && <p className="mt-1 flex items-start gap-1.5 text-[0.8125rem] text-ink-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{address(o)}</p>}
                      {o.customer?.phone && <p className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><Phone className="h-3.5 w-3.5" /><a href={`tel:${o.customer.phone.replace(/\s/g, "")}`} className="hover:underline">{o.customer.phone}</a></p>}
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[0.9375rem] font-semibold text-ink">{money(o.total, org.currency)}</p>
                      <OrderStatusButtons id={o.id} status={o.status} />
                    </div>
                  </div>
                  {o.customer?.delivery_instructions && <p className="mt-2 rounded-md bg-sky-50 px-2.5 py-1.5 text-[0.8125rem] text-sky-900 ring-1 ring-inset ring-sky-100">Delivery: {o.customer.delivery_instructions}</p>}
                  {o.customer_note && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-100">Note: {o.customer_note}</p>}
                  {o.needs_check && <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] text-amber-800 print:hidden"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Check: {o.needs_check}</p>}
                  <table className="mt-3 w-full text-[0.8438rem]">
                    <tbody className="divide-y divide-line">
                      {[...o.lines].sort((a, b) => a.position - b.position).map((l, i) => (
                        <tr key={i}>
                          <td className="w-12 py-1.5 pr-2 align-top font-semibold tabular text-ink">{Number(l.quantity)} ×</td>
                          <td className="py-1.5 text-ink">{l.name}{l.comment && <span className="block text-[0.75rem] text-ink-muted">{l.comment}</span>}</td>
                          <td className="hidden w-6 py-1.5 align-top print:table-cell"><span className="inline-block h-3.5 w-3.5 rounded border border-zinc-400" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              );
            })}
          </div>
          <Card className="self-start xl:sticky xl:top-6 print:mt-6 print:break-before-page print:rounded-none print:border-0 print:shadow-none">
            <CardHeader title="To roast & pack" subtitle={kg ? `${Number(kg.toFixed(2))} kg of coffee across ${orders.length} order${orders.length === 1 ? "" : "s"}` : `${orders.length} order${orders.length === 1 ? "" : "s"}`} />
            <table className="w-full text-[0.8438rem]">
              <thead><tr className="border-y border-line text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-5 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-5 py-2 text-right font-medium">Kg</th></tr></thead>
              <tbody className="divide-y divide-line">
                {totals.map((t) => (
                  <tr key={t.name}><td className="px-5 py-2 text-ink">{t.name}</td><td className="px-2 py-2 text-right font-semibold tabular text-ink">{t.quantity}</td><td className="px-5 py-2 text-right tabular text-ink-muted">{t.kg != null ? Number(t.kg.toFixed(2)) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
