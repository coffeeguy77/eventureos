import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { AutoCreate, EventPicker, ExistingQuotes, type PickerEvent } from "@/components/quotes/new-quote";
import { todayISO } from "@/lib/format";
import type { EventStatus, QuoteStatus } from "@/lib/types";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const today = todayISO(org.timezone);

  if (sp.event) {
    if (!/^[0-9a-f-]{36}$/i.test(sp.event)) notFound();
    const { data: ev, error } = await supabase.from("events")
      .select("id, number, name, status, quotes(id, number, title, status)")
      .eq("id", sp.event).eq("organisation_id", org.id).maybeSingle();
    if (error) throw new Error(`Could not load the event: ${error.message}`);
    if (!ev) notFound();
    const quotes = ((ev.quotes ?? []) as { id: string; number: number; title: string; status: QuoteStatus }[]).sort((a, b) => a.number - b.number);
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Quotes" title="New quote" subtitle={`For EV-${ev.number} · ${ev.name}`} />
        {quotes.length > 0
          ? <ExistingQuotes eventId={ev.id} eventName={ev.name} quotes={quotes} />
          : <AutoCreate eventId={ev.id} eventName={ev.name} />}
      </div>
    );
  }

  const { data, error } = await supabase.from("events")
    .select("id, number, name, event_date, status, customer:customers(name), quotes(id, number, status)")
    .eq("organisation_id", org.id)
    .not("status", "in", "(cancelled,completed)")
    .order("event_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`Could not load events: ${error.message}`);
  const rows = (data ?? []) as unknown as (Omit<PickerEvent, "customer"> & { customer: { name: string } | null; status: EventStatus })[];
  // Upcoming first (soonest first), then undated, then past events (most recent first)
  const upcoming = rows.filter((r) => r.event_date && r.event_date >= today);
  const undated = rows.filter((r) => !r.event_date);
  const past = rows.filter((r) => r.event_date && r.event_date < today).reverse();
  const events: PickerEvent[] = [...upcoming, ...undated, ...past].map((r) => ({
    ...r, customer: r.customer?.name ?? "—", quotes: [...(r.quotes ?? [])].sort((a, b) => a.number - b.number),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Quotes" title="New quote" subtitle="Every quote belongs to an event. Choose the event you're quoting for." />
      <EventPicker events={events} today={today} />
    </div>
  );
}
