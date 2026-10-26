import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { BookingEditor } from "@/components/rentals/booking-editor";
import { BookingActions, CountsPanel } from "@/components/rentals/booking-actions";
import { editorData } from "@/lib/hire/editor-data";
import { todayISO } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, type HireStatus } from "@/lib/hire/core";

export const dynamic = "force-dynamic";

const parts = (iso: string | null, tz: string) => {
  if (!iso) return { date: "", time: "" };
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

export const metadata = { title: "Hire booking" };

export default async function HireBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const { data: b, error } = await supabase.from("hire_bookings")
    .select("*, customer:customers(id, name, email, phone), event:events(id, number, name), lines:hire_booking_lines(id, item_id, name, kind, quantity, unit_price, manual_price, line_total, qty_out, qty_returned, qty_damaged, sort)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) notFound();
  type L = { id: string; item_id: string | null; name: string; kind: "hire" | "sale" | "package" | "misc"; quantity: number; unit_price: number; manual_price: boolean; line_total: number; qty_out: number; qty_returned: number; qty_damaged: number; sort: number };
  const lines = ((b.lines ?? []) as L[]).sort((x, y) => x.sort - y.sort);
  const tz = org.timezone;
  const s = parts(b.starts_at, tz), e = parts(b.ends_at, tz);
  const status = b.status as HireStatus;
  const { customers, events, items } = await editorData(supabase, org.id);
  const cust = b.customer as { id: string; name: string; email: string | null; phone: string | null } | null;
  const ev = b.event as { id: string; number: number; name: string } | null;
  let invoice: { id: string; number: string; status: string } | null = null;
  if (b.invoice_id && canManage(role)) {
    const { data } = await supabase.from("invoices").select("id, number, status").eq("id", b.invoice_id).maybeSingle();
    invoice = data as typeof invoice;
  }
  const overdue = status === "out" && Date.parse(b.ends_at) < Date.now();
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[0.75rem] font-medium text-ink-faint"><Link href="/rentals/bookings" className="hover:underline">Hire bookings</Link></p>
          <h1 className="flex flex-wrap items-center gap-2 text-[1.25rem] font-semibold tracking-tight text-ink sm:text-[1.375rem]">
            {b.number}<Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>{overdue && <Badge tone="red">Overdue</Badge>}
          </h1>
          <p className="mt-1 text-[0.8438rem] text-ink-muted">
            {cust ? <Link href={`/clients/${cust.id}`} className="font-medium text-ink hover:underline">{cust.name}</Link> : "No client"}
            {cust?.phone ? ` · ${cust.phone}` : ""}{ev ? <> · <Link href={`/events/${ev.id}`} className="hover:underline">EV-{ev.number} {ev.name}</Link></> : null}
          </p>
        </div>
        <BookingActions id={b.id} status={status} canManage={canManage(role)} invoice={invoice} bond={Number(b.bond)} bondStatus={b.bond_status} currency={org.currency} />
      </div>
      {(status === "out" || status === "returned" || status === "booked") && lines.some((l) => l.kind !== "misc") && (
        <CountsPanel id={b.id} status={status} lines={lines.filter((l) => l.kind !== "misc").map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, out: l.qty_out, returned: l.qty_returned, damaged: l.qty_damaged }))} />
      )}
      <BookingEditor bookingId={b.id} status={status} currency={org.currency} today={todayISO(tz)} tz={tz} customers={customers} events={events} items={items}
        initial={{
          customer_id: b.customer_id, event_id: b.event_id, title: b.title, start_date: s.date, start_time: s.time, end_date: e.date, end_time: e.time,
          fulfilment: b.fulfilment, address: b.address, delivery_time: parts(b.delivery_at, tz).time || null, pickup_time: parts(b.pickup_at, tz).time || null,
          delivery_fee: Number(b.delivery_fee) || null, discount: Number(b.discount) || null, reference: b.reference, notes: b.notes, internal_notes: b.internal_notes, quote_expires: b.quote_expires,
          lines: lines.map((l) => ({ id: l.id, item_id: l.item_id, name: l.name, kind: l.kind, quantity: l.quantity, unit_price: l.manual_price || !l.item_id ? Number(l.unit_price) : null, manual: l.manual_price || !l.item_id })),
        }} />
    </div>
  );
}
