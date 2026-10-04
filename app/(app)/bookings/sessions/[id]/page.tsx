import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { bookedSeats, seatCount, sessionWhen } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { RosterRow, AddBooking, SessionControls, PrintRoster } from "@/components/bookings/session-tools";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const { data: s } = await supabase.from("booking_sessions").select("id, course_id, starts_at, ends_at, capacity, price, status, external_seats, external_note, note, calendar_event_id, course:booking_courses(id, name, price, location, colour, calendar_connection_id)").eq("organisation_id", org.id).eq("id", id).maybeSingle();
  if (!s) notFound();
  const session = s as unknown as { id: string; course_id: string; starts_at: string; ends_at: string; capacity: number; price: number | null; status: string; external_seats: number; external_note: string | null; note: string | null; calendar_event_id: string | null;
    course: { id: string; name: string; price: number; location: string | null; colour: string | null; calendar_connection_id: string | null } };
  const [{ data: rows }, { data: others }, { data: agencies }] = await Promise.all([
    supabase.from("bookings").select("id, reference, status, seats, attendees, contact_name, contact_email, contact_phone, notes, answers, total, gift_amount, amount_paid, payment_method, source, po_number, po_site, po_contact, invoice_id, checked_in_at, hold_expires_at, created_at, cancel_reason, agency:booking_agencies(name), invoice:invoices(number, status)")
      .eq("session_id", id).order("created_at"),
    supabase.from("booking_sessions").select("id, starts_at, ends_at, capacity, external_seats, status, course:booking_courses(name)").eq("organisation_id", org.id).gt("starts_at", new Date().toISOString()).neq("id", id).neq("status", "cancelled").order("starts_at").limit(60),
    supabase.from("booking_agencies").select("id, name").eq("organisation_id", org.id).eq("active", true).order("name"),
  ]);
  type Row = { id: string; reference: string; status: string; seats: number; attendees: { name: string }[]; contact_name: string; contact_email: string | null; contact_phone: string | null; notes: string | null; answers: Record<string, string>;
    total: number; gift_amount: number; amount_paid: number; payment_method: string; source: string; po_number: string | null; po_site: string | null; po_contact: string | null; invoice_id: string | null; checked_in_at: string | null; hold_expires_at: string | null; created_at: string; cancel_reason: string | null;
    agency: { name: string } | null; invoice: { number: string; status: string } | null };
  const list = (rows ?? []) as unknown as Row[];
  const n = seatCount(session.capacity, bookedSeats(list), session.external_seats);
  const w = sessionWhen(session.starts_at, session.ends_at, org.timezone);
  const active = list.filter((b) => ["confirmed", "attended", "no_show"].includes(b.status) || (b.status === "held" && b.hold_expires_at && Date.parse(b.hold_expires_at) > Date.now()));
  const waitlist = list.filter((b) => b.status === "waitlist");
  const gone = list.filter((b) => b.status === "cancelled" || (b.status === "held" && !(b.hold_expires_at && Date.parse(b.hold_expires_at) > Date.now())));
  const paid = active.reduce((t, b) => t + Number(b.amount_paid), 0);
  const people = active.reduce((t, b) => t + b.seats, 0);
  const here = active.filter((b) => b.status === "attended").reduce((t, b) => t + b.seats, 0);
  const otherSessions = ((others ?? []) as unknown as { id: string; starts_at: string; ends_at: string; capacity: number; course: { name: string } | null }[])
    .map((o) => ({ id: o.id, label: `${sessionWhen(o.starts_at, o.ends_at, org.timezone).short} ${sessionWhen(o.starts_at, o.ends_at, org.timezone).start} · ${o.course?.name ?? ""}` }));
  const isPast = Date.parse(session.ends_at) < Date.now();

  return (
    <>
      <PageHeader eyebrow={<Link href="/bookings" className="hover:text-ink">← Bookings</Link>} title={`${session.course.name}`}
        subtitle={<>{w.day} · {w.time}{session.course.location ? ` · ${session.course.location}` : ""}</>}
        actions={<PrintRoster />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="px-4 py-3.5"><p className="text-[0.75rem] text-ink-muted">Seats</p><p className="mt-1 text-[1.5rem] font-semibold text-ink">{n.taken}<span className="text-[1rem] text-ink-faint">/{session.capacity}</span></p><p className="text-[0.75rem] text-ink-faint">{n.full ? "Full" : `${n.left} left`}{session.external_seats ? ` · ${session.external_seats} sold elsewhere` : ""}</p></Card>
        <Card className="px-4 py-3.5"><p className="text-[0.75rem] text-ink-muted">People booked here</p><p className="mt-1 text-[1.5rem] font-semibold text-ink">{people}</p><p className="text-[0.75rem] text-ink-faint">{isPast || here ? `${here} checked in` : `${active.length} booking${active.length === 1 ? "" : "s"}`}</p></Card>
        <Card className="px-4 py-3.5"><p className="text-[0.75rem] text-ink-muted">Paid</p><p className="mt-1 text-[1.5rem] font-semibold text-ink">{money(paid, org.currency)}</p><p className="text-[0.75rem] text-ink-faint">{active.filter((b) => b.payment_method === "agency").length ? `${active.filter((b) => b.payment_method === "agency").length} via agency` : "Card, gift & office"}</p></Card>
        <Card className="px-4 py-3.5"><p className="text-[0.75rem] text-ink-muted">Waitlist</p><p className="mt-1 text-[1.5rem] font-semibold text-ink">{waitlist.reduce((t, b) => t + b.seats, 0)}</p><p className="text-[0.75rem] text-ink-faint">{session.calendar_event_id ? "Busy on your calendar" : session.course.calendar_connection_id ? "Calendar blocks when full" : "No calendar set for course"}</p></Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="overflow-hidden" id="roster">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-[0.9375rem] font-semibold text-ink">Who&apos;s coming</h2>
              <Badge tone={session.status === "open" ? "green" : session.status === "cancelled" ? "red" : "slate"}>{session.status === "open" ? "Taking bookings" : session.status === "closed" ? "Closed" : "Cancelled"}</Badge>
            </div>
            {active.length === 0 ? <p className="px-5 pb-5 text-[0.8438rem] text-ink-muted">No bookings yet.</p> : (
              <ul className="divide-y divide-line">{active.map((b) => <RosterRow key={b.id} b={b} currency={org.currency} others={otherSessions} isPast={isPast} />)}</ul>
            )}
          </Card>
          {waitlist.length > 0 && (
            <Card className="overflow-hidden">
              <h2 className="px-5 pb-2 pt-4 text-[0.9375rem] font-semibold text-ink">Waitlist</h2>
              <ul className="divide-y divide-line">{waitlist.map((b) => <RosterRow key={b.id} b={b} currency={org.currency} others={otherSessions} isPast={isPast} />)}</ul>
            </Card>
          )}
          {gone.length > 0 && (
            <details className="rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-[0.8125rem] font-medium text-ink-muted">Cancelled and unfinished checkouts ({gone.length})</summary>
              <ul className="divide-y divide-line border-t border-line">{gone.map((b) => <RosterRow key={b.id} b={b} currency={org.currency} others={otherSessions} isPast={isPast} />)}</ul>
            </details>
          )}
        </div>
        <div className="space-y-5">
          {!isPast && session.status !== "cancelled" && <AddBooking sessionId={session.id} full={n.full} left={n.left} price={Number(session.price ?? session.course.price)} agencies={(agencies ?? []) as { id: string; name: string }[]} />}
          <SessionControls s={{ id: session.id, capacity: session.capacity, external_seats: session.external_seats, external_note: session.external_note, note: session.note, status: session.status, price: session.price }} defaultPrice={Number(session.course.price)} hasBookings={list.length > 0} />
        </div>
      </div>
    </>
  );
}
