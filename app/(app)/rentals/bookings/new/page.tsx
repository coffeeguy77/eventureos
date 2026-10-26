import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { BookingEditor } from "@/components/rentals/booking-editor";
import { editorData } from "@/lib/hire/editor-data";
import { addDaysISO, todayISO } from "@/lib/format";
import { readHireSettings } from "@/lib/hire/core";

export const metadata = { title: "New hire booking" };
export const dynamic = "force-dynamic";

export default async function NewHireBookingPage({ searchParams }: { searchParams: Promise<{ customer?: string; event?: string; date?: string; item?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const s = readHireSettings(org.settings);
  const today = todayISO(org.timezone);
  const { customers, events, items } = await editorData(supabase, org.id);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDaysISO(today, 1);
  const ev = sp.event ? events.find((e) => e.id === sp.event) : undefined;
  const item = sp.item ? items.find((i) => i.id === sp.item) : undefined;
  return (
    <div>
      <PageHeader title="New hire booking" subtitle="Prices and stock are checked as you go." />
      <BookingEditor bookingId={null} status={null} currency={org.currency} today={today} tz={org.timezone} customers={customers} events={events} items={items}
        initial={{
          customer_id: (ev?.customerId ?? (customers.some((c) => c.id === sp.customer) ? sp.customer : "")) as string, event_id: ev?.id ?? null, title: null,
          start_date: date, start_time: s.defaultStart, end_date: s.defaultEnd > s.defaultStart ? date : addDaysISO(date, 1), end_time: s.defaultEnd,
          fulfilment: "collect", address: null, delivery_time: null, pickup_time: null, delivery_fee: s.deliveryFee || null, discount: null,
          reference: null, notes: null, internal_notes: null, quote_expires: null,
          lines: item ? [{ item_id: item.id, name: item.name, kind: item.kind, quantity: 1 }] : [],
        }} />
    </div>
  );
}
