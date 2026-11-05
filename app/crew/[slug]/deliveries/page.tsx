import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireCrew } from "@/lib/crew/server";
import { isDelivery } from "@/lib/crew/skills";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { deliveryAddress, standingDeliveries, weekOf, type DeliveryLogRow } from "@/lib/wholesale/deliveries";
import { Card } from "../parts";
import { DeliveryList, type Stop } from "./ui";

export const metadata = { title: "Deliveries" };
export const dynamic = "force-dynamic";

type Row = {
  id: string; number: string; status: string; delivery_date: string | null; customer_note: string | null; ship_to: { text?: string } | null;
  customer: { name: string; phone: string | null; contact_name: string | null; address1: string | null; address2: string | null; suburb: string | null; state: string | null; postcode: string | null; delivery_instructions: string | null } | null;
  lines: { name: string; quantity: number; position: number }[];
};

/** The driver's week: every wholesale order due for delivery Monday–Sunday, ticked off one by one. */
export default async function CrewDeliveries({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  if (!isDelivery(s.member.skills)) redirect(`/crew/${slug}`);
  const sp = await searchParams;
  const today = todayISO(s.org.timezone || "Australia/Sydney");
  const { from, to } = weekOf(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const thisWeek = weekOf(today).from === from;
  const base = `/crew/${slug}/deliveries`;

  const { pickupReady } = await import("@/lib/wholesale/orders");
  const pickupOn = await pickupReady(s.db);
  let q = s.db.from("wholesale_orders")
    .select("id, number, status, delivery_date, customer_note, ship_to, customer:wholesale_customers(name, phone, contact_name, address1, address2, suburb, state, postcode, delivery_instructions), lines:wholesale_order_lines(name, quantity, position)")
    .eq("organisation_id", s.org.id).gte("delivery_date", from).lte("delivery_date", to).in("status", ["placed", "packed", "delivered"]);
  if (pickupOn) q = q.neq("fulfilment", "pickup"); // customers collect these themselves
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);
  const { data: logs, error: logErr } = ids.length
    ? await s.db.from("wholesale_delivery_log").select("order_id, action, at, by_name, lat, lng, accuracy_m, geo_error, note").eq("organisation_id", s.org.id).in("order_id", ids)
    : { data: [], error: null };
  const proof = standingDeliveries((logs ?? []) as DeliveryLogRow[]);

  const stops: Stop[] = rows.map((r) => {
    const p = proof.get(r.id);
    return {
      id: r.id, number: r.number, day: r.delivery_date ?? from, delivered: r.status === "delivered",
      name: r.customer?.name ?? "Unknown customer", contact: r.customer?.contact_name ?? null, phone: r.customer?.phone ?? null,
      address: deliveryAddress(r.ship_to, r.customer), suburb: r.customer?.suburb ?? "",
      instructions: r.customer?.delivery_instructions ?? null, note: r.customer_note,
      items: [...r.lines].sort((a, b) => a.position - b.position).map((l) => `${Number(l.quantity)} × ${l.name}`),
      proof: p ? { at: p.at, by: p.by_name, located: p.lat != null, canUndo: Date.now() - Date.parse(p.at) < 12 * 3600_000 } : null,
    };
  }).sort((a, b) => a.day.localeCompare(b.day) || a.suburb.localeCompare(b.suburb) || a.name.localeCompare(b.name));

  const left = stops.filter((x) => !x.delivered).length;
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.25rem] font-semibold tracking-tight text-ink">{thisWeek ? "This week's deliveries" : "Deliveries"}</h1>
          <p className="text-[0.8125rem] text-ink-muted">{fmtDate(from, "short")} – {fmtDate(to, "short")} · {stops.length ? (left ? `${left} of ${stops.length} to go` : `all ${stops.length} done ✓`) : "nothing booked"}</p>
        </div>
        <Link href={`${base}?week=${addDaysISO(from, -7)}`} className="grid h-11 w-11 place-items-center rounded-xl bg-surface ring-1 ring-line" aria-label="Last week"><ChevronLeft className="h-5 w-5" /></Link>
        <Link href={`${base}?week=${addDaysISO(from, 7)}`} className="grid h-11 w-11 place-items-center rounded-xl bg-surface ring-1 ring-line" aria-label="Next week"><ChevronRight className="h-5 w-5" /></Link>
      </div>
      {!thisWeek && <p className="mb-3 text-[0.8125rem]"><Link href={base} className="font-medium text-[var(--crew-brand)]">Back to this week</Link></p>}
      {logErr && <Card className="mb-3"><p className="text-[0.8125rem] text-rose-700">Ticking off deliveries isn&apos;t switched on yet — the office needs to finish setting it up.</p></Card>}
      {stops.length === 0
        ? <Card><p className="text-[0.875rem] text-ink-muted">No wholesale deliveries this week.</p></Card>
        : <DeliveryList slug={slug} today={today} stops={stops} tz={s.org.timezone || "Australia/Sydney"} />}
      <p className="mt-6 px-1 text-[0.75rem] text-ink-faint">When you tick a delivery off, the time and your phone&apos;s location are saved so the office can show a customer when and where it was dropped.</p>
    </div>
  );
}
