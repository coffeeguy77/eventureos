import { notFound } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ItemForm } from "@/components/rentals/item-form";
import { BookingRow } from "@/components/rentals/booking-row";
import { addDaysISO, money, todayISO, zonedMidnightUTC } from "@/lib/format";
import { brandOf, hireable, readHireSettings, usageGrid, type HireItem } from "@/lib/hire/core";
import { BOOKING_LIST_COLS, loadHolds, loadItems, productPagesReady, type BookingListRow } from "@/lib/hire/server";
import { appBaseUrl } from "@/lib/integrations/registry";

export const metadata = { title: "Hire item" };
export const dynamic = "force-dynamic";

/** An item: its details and rates, plus how hard it works (use over 90 days, earnings this year) and what's coming up. */
export default async function HireItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const s = readHireSettings(org.settings);
  const items = await loadItems(supabase, org.id);
  const it = items.find((i) => i.id === id);
  if (!it) notFound();
  const map = new Map<string, HireItem>(items.map((i) => [i.id, i]));
  const tz = org.timezone, today = todayISO(tz);

  // usage over the last 90 days (packages count towards their items)
  const dates = Array.from({ length: 90 }, (_, i) => addDaysISO(today, i - 90));
  const days = dates.map((d): [number, number] => [Date.parse(zonedMidnightUTC(d, tz)), Date.parse(zonedMidnightUTC(addDaysISO(d, 1), tz))]);
  const { holds } = await loadHolds(supabase, org.id, days[0][0], days[89][1], map);
  const grid = usageGrid([it], holds.concat(await returnedHolds()), days, 0).get(it.id) ?? [];
  async function returnedHolds() {
    // returned hires don't hold stock any more, but they count as use
    const { data } = await supabase.from("hire_booking_lines").select("booking_id, item_id, quantity, booking:hire_bookings!inner(status, starts_at, ends_at)")
      .eq("organisation_id", org.id).eq("booking.status", "returned").gt("booking.ends_at", new Date(days[0][0]).toISOString()).limit(5000);
    const { holdsFrom } = await import("@/lib/hire/core");
    type R = { booking_id: string; item_id: string | null; quantity: number; booking: { status: "returned"; starts_at: string; ends_at: string } };
    return holdsFrom(((data ?? []) as unknown as R[]).map((r) => ({ booking_id: r.booking_id, item_id: r.item_id, quantity: r.quantity, label: "", status: "booked", start: Date.parse(r.booking.starts_at), end: Date.parse(r.booking.ends_at) })), map);
  }
  const own = hireable(it);
  const util = own > 0 && it.kind === "hire" ? Math.round((grid.reduce((a, b) => a + Math.min(b, own), 0) / (own * 90)) * 100) : null;
  const daysOut = grid.filter((x) => x > 0).length;
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const [{ data: earned }, { data: upcoming }] = await Promise.all([
    supabase.from("hire_booking_lines").select("line_total, booking:hire_bookings!inner(status, starts_at)").eq("organisation_id", org.id).eq("item_id", id)
      .in("booking.status", ["reservation", "booked", "out", "returned"]).gt("booking.starts_at", yearAgo).limit(5000),
    supabase.from("hire_bookings").select(`${BOOKING_LIST_COLS}, l2:hire_booking_lines!inner(item_id)`).eq("organisation_id", org.id).eq("l2.item_id", id)
      .in("status", ["quote", "reservation", "booked", "out"]).gte("ends_at", new Date().toISOString()).order("starts_at").limit(20),
  ]);
  const revenue = ((earned ?? []) as { line_total: number }[]).reduce((a, r) => a + Number(r.line_total), 0);
  const others = items.filter((i) => i.id !== id && i.active).map((i) => ({ id: i.id, name: i.name, kind: i.kind }));
  const pagesReady = await productPagesReady(supabase);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Items & rates" title={it.name} actions={<ButtonLink href={`/rentals/bookings/new?item=${it.id}`} size="sm">Book this</ButtonLink>} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Owned</p><p className="text-[1.25rem] font-semibold tabular-nums">{it.kind === "package" ? "—" : it.quantity}{it.out_of_service ? <span className="text-[0.75rem] font-normal text-amber-700"> ({it.out_of_service} out of service)</span> : null}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Use, last 90 days</p><p className="text-[1.25rem] font-semibold tabular-nums">{util == null ? "—" : `${util}%`}</p><p className="text-[0.7188rem] text-ink-faint">{it.kind === "hire" ? `out on ${daysOut} of 90 days` : ""}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Earned, last 12 months</p><p className="text-[1.25rem] font-semibold tabular-nums">{money(revenue, org.currency)}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Coming up</p><p className="text-[1.25rem] font-semibold tabular-nums">{(upcoming ?? []).length}</p></Card>
      </div>
      {util != null && util >= 80 && <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">This item is out {util}% of the time. If you&apos;re turning hires away, it may be worth buying more.</p>}
      {util != null && util === 0 && it.quantity > 0 && <p className="mb-5 rounded-lg bg-zinc-50 px-4 py-3 text-[0.8125rem] text-ink-muted">Not hired in the last 90 days. Worth promoting, re-pricing or selling?</p>}
      {(upcoming ?? []).length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Booked and quoted" />
          <ul className="divide-y divide-line border-t border-line">{((upcoming ?? []) as unknown as BookingListRow[]).map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={org.currency} hire={s} />)}</ul>
        </Card>
      )}
      <ItemForm id={it.id} orgId={org.id} pagesReady={pagesReady} shopBase={s.shop.enabled ? `${appBaseUrl()}/hire/${org.slug}/shop` : null} canEdit={canManage(role)} units={s.units} brands={s.brands} others={others} categories={[...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort()}
        initial={{ ...it, brand: brandOf(s, it.id)?.key ?? null, rates: it.rates, companions: it.companions, package_lines: it.package_lines }} />
    </div>
  );
}
