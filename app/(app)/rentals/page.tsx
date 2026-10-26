import Link from "next/link";
import { AlertTriangle, CalendarClock, PackageCheck, PackageOpen, Wrench } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingRow } from "@/components/rentals/booking-row";
import { addDaysISO, fmtDate, todayISO, zonedMidnightUTC } from "@/lib/format";
import { HOLDS_STOCK, checkStock, readHireSettings, type HireItem } from "@/lib/hire/core";
import { BOOKING_LIST_COLS, loadHolds, loadItems, type BookingListRow } from "@/lib/hire/server";

export const dynamic = "force-dynamic";

/** Today: what goes out, what comes back, what's overdue — and what needs attention before it bites (stock clashes, expiring quotes, tags due). */
export default async function HireTodayPage() {
  const { supabase, org } = await requireOrg();
  const tz = org.timezone || "Australia/Sydney";
  const s = readHireSettings(org.settings);
  const today = todayISO(tz);
  const dayStart = zonedMidnightUTC(today, tz), dayEnd = zonedMidnightUTC(addDaysISO(today, 1), tz);
  const weekEnd = zonedMidnightUTC(addDaysISO(today, 8), tz), monthEnd = zonedMidnightUTC(addDaysISO(today, 31), tz);
  const nowIso = new Date().toISOString();
  const q = () => supabase.from("hire_bookings").select(BOOKING_LIST_COLS).eq("organisation_id", org.id);
  const [goingRes, backRes, overdueRes, upcomingRes, quotesRes, items] = await Promise.all([
    q().in("status", ["reservation", "booked"]).lt("starts_at", dayEnd).order("starts_at").limit(200),
    q().eq("status", "out").gte("ends_at", nowIso).lt("ends_at", dayEnd).order("ends_at").limit(200),
    q().eq("status", "out").lt("ends_at", nowIso).order("ends_at").limit(200),
    q().in("status", [...HOLDS_STOCK, "quote"]).gte("starts_at", dayEnd).lt("starts_at", monthEnd).order("starts_at").limit(300),
    q().eq("status", "quote").lte("quote_expires", addDaysISO(today, 3)).gte("starts_at", nowIso).order("quote_expires").limit(50),
    loadItems(supabase, org.id),
  ]);
  for (const r of [goingRes, backRes, overdueRes, upcomingRes, quotesRes]) if (r.error) throw new Error(r.error.message);
  const rows = (r: { data: unknown }) => (r.data ?? []) as BookingListRow[];
  const going = rows(goingRes), back = rows(backRes), overdue = rows(overdueRes), upcoming = rows(upcomingRes), expiring = rows(quotesRes);
  const week = upcoming.filter((b) => b.starts_at < weekEnd);

  // Stock clashes on anything booked in the next month (someone overbooked, or items came back damaged)
  const map = new Map<string, HireItem>(items.map((i) => [i.id, i]));
  const holding = upcoming.filter((b) => HOLDS_STOCK.includes(b.status)).concat(going);
  const clashes: { b: BookingListRow; text: string }[] = [];
  if (holding.length) {
    const { holds } = await loadHolds(supabase, org.id, Date.parse(dayStart), Date.parse(monthEnd), map);
    const { data: ls } = await supabase.from("hire_booking_lines").select("booking_id, item_id, quantity").in("booking_id", holding.map((b) => b.id));
    const byB = new Map<string, { itemId: string | null; qty: number }[]>();
    for (const l of (ls ?? []) as { booking_id: string; item_id: string | null; quantity: number }[]) { const a = byB.get(l.booking_id) ?? []; a.push({ itemId: l.item_id, qty: l.quantity }); byB.set(l.booking_id, a); }
    for (const b of holding) {
      const sh = checkStock(byB.get(b.id) ?? [], map, holds.filter((h) => h.bookingId !== b.id), Date.parse(b.starts_at), Date.parse(b.ends_at), s.bufferHours);
      if (sh.length) clashes.push({ b, text: sh.map((x) => `${x.short} × ${x.name} short`).join(", ") });
    }
  }
  const soon = addDaysISO(today, 14);
  const maintenance = items.filter((i) => i.active && ((i.test_tag_due && i.test_tag_due <= soon) || (i.service_due && i.service_due <= soon)));
  const outUnits = back.concat(overdue).reduce((a, b) => a + b.lines.reduce((x, l) => x + Math.max(0, Number(l.qty_out || l.quantity) - Number(l.qty_returned) - Number(l.qty_damaged)), 0), 0);
  const { count: outCount } = await supabase.from("hire_bookings").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "out");
  const cur = org.currency;

  const tiles = [
    { label: "Going out today", value: going.length, icon: PackageOpen, tone: "text-brand-700" },
    { label: "Due back today", value: back.length, icon: PackageCheck, tone: "text-emerald-700" },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, tone: overdue.length ? "text-rose-700" : "text-ink" },
    { label: "Hires out now", value: outCount ?? 0, icon: CalendarClock, tone: "text-ink" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-ink-muted"><t.icon className="h-3.5 w-3.5" />{t.label}</p>
            <p className={`mt-1 text-[1.5rem] font-semibold tabular-nums ${t.tone}`}>{t.value}</p>
          </Card>
        ))}
      </div>

      {(clashes.length > 0 || overdue.length > 0) && (
        <Card className="border-rose-200">
          <CardHeader title={<span className="flex items-center gap-2 text-rose-800"><AlertTriangle className="h-4 w-4" />Needs attention</span>} subtitle="Sort these first: overdue returns and bookings without enough stock." />
          <ul className="divide-y divide-line border-t border-line">
            {overdue.map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={cur} hire={s} note={<Badge tone="red">Overdue since {fmtDate(b.ends_at.slice(0, 10), "short")}</Badge>} />)}
            {clashes.map(({ b, text }) => <BookingRow key={`c${b.id}`} b={b} tz={tz} currency={cur} note={<Badge tone="red">{text}</Badge>} />)}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Going out today" subtitle={going.some((b) => b.starts_at < nowIso) ? "Some are past their start time and haven't been marked out." : "Pick, load and mark them out."} />
          {going.length ? <ul className="divide-y divide-line border-t border-line">{going.map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={cur} hire={s} showMoney={false} note={b.starts_at < dayStart ? <Badge tone="amber">Late</Badge> : null} />)}</ul>
            : <EmptyState title="Nothing going out today" />}
        </Card>
        <Card>
          <CardHeader title="Coming back today" subtitle={outUnits ? `${outUnits} item${outUnits === 1 ? "" : "s"} still to check in, including overdue.` : "Check them in as they arrive."} />
          {back.length ? <ul className="divide-y divide-line border-t border-line">{back.map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={cur} hire={s} showMoney={false} />)}</ul>
            : <EmptyState title="Nothing due back today" />}
        </Card>
      </div>

      <Card>
        <CardHeader title="Next 7 days" subtitle="Quotes are pencilled in. They don't hold stock until they're reserved or booked." action={<Link href="/rentals/bookings" className="text-[0.8125rem] font-medium text-brand-700 hover:underline">All bookings</Link>} />
        {week.length ? <ul className="divide-y divide-line border-t border-line">{week.map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={cur} hire={s} />)}</ul>
          : <EmptyState title="Nothing in the next week" action={<Link href="/rentals/bookings/new" className="text-[0.8125rem] font-medium text-brand-700 hover:underline">New booking</Link>} />}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {expiring.length > 0 && (
          <Card>
            <CardHeader title="Quotes about to expire" subtitle="Follow up, or reserve the stock before someone else books it." />
            <ul className="divide-y divide-line border-t border-line">{expiring.map((b) => <BookingRow key={b.id} b={b} tz={tz} currency={cur} hire={s} note={<Badge tone={b.quote_expires && b.quote_expires < today ? "red" : "amber"}>{b.quote_expires && b.quote_expires < today ? "Expired" : `Expires ${fmtDate(b.quote_expires, "short")}`}</Badge>} />)}</ul>
          </Card>
        )}
        {maintenance.length > 0 && (
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Wrench className="h-4 w-4 text-ink-faint" />Test & tag and servicing</span>} subtitle="Due in the next two weeks, or overdue." />
            <ul className="divide-y divide-line border-t border-line">
              {maintenance.map((i) => (
                <li key={i.id}><Link href={`/rentals/items/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50/70">
                  <span className="font-medium text-ink">{i.name}</span>
                  <span className="flex gap-1.5">
                    {i.test_tag_due && i.test_tag_due <= soon && <Badge tone={i.test_tag_due < today ? "red" : "amber"}>Tag {fmtDate(i.test_tag_due, "short")}</Badge>}
                    {i.service_due && i.service_due <= soon && <Badge tone={i.service_due < today ? "red" : "amber"}>Service {fmtDate(i.service_due, "short")}</Badge>}
                  </span>
                </Link></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {!items.length && <Card className="p-5 text-[0.8438rem] text-ink-muted">Start by adding what you hire out in <Link href="/rentals/items/new" className="font-medium text-brand-700 hover:underline">Items &amp; rates</Link>.</Card>}
    </div>
  );
}
