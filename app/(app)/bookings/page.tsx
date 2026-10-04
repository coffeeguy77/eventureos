import Link from "next/link";
import { CalendarPlus, ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi } from "@/components/records/kpi";
import { bookedSeats, seatCount, sessionWhen } from "@/lib/bookings/core";
import { money, relative } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type S = { id: string; course_id: string; starts_at: string; ends_at: string; capacity: number; external_seats: number; status: string; course: { name: string; colour: string | null } | null };
type B = { id: string; session_id: string; seats: number; status: string; hold_expires_at: string | null; total: number; amount_paid: number; payment_method: string; source: string; contact_name: string; reference: string; created_at: string };

const SRC: Record<string, string> = { website: "Website", wordpress: "Website", office: "Office", bookly: "Bookly", classbento: "ClassBento", woocommerce: "WooCommerce", import: "Import" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ past?: string }> }) {
  const sp = await searchParams;
  const past = sp.past === "1";
  const { supabase, org } = await requireOrg();
  const now = new Date().toISOString();
  let sq = supabase.from("booking_sessions").select("id, course_id, starts_at, ends_at, capacity, external_seats, status, course:booking_courses(name, colour)").eq("organisation_id", org.id);
  sq = past ? sq.lt("ends_at", now).order("starts_at", { ascending: false }).limit(60) : sq.gte("ends_at", now).order("starts_at").limit(120);
  const [sRes, cRes, recent] = await Promise.all([
    sq,
    supabase.from("booking_courses").select("id", { count: "exact", head: true }).eq("organisation_id", org.id),
    supabase.from("bookings").select("id, session_id, seats, status, hold_expires_at, total, amount_paid, payment_method, source, contact_name, reference, created_at").eq("organisation_id", org.id).in("source", ["website", "wordpress", "office"]).order("created_at", { ascending: false }).limit(8),
  ]);
  if (sRes.error) {
    return (
      <>
        <PageHeader title="Bookings" subtitle="Courses and classes people book and pay for online." />
        <Card className="p-6">
          <p className="text-[0.9375rem] font-semibold text-ink">One step to switch bookings on</p>
          <p className="mt-1 text-[0.8438rem] text-ink-muted">Run the database update <b>0049_bookings.sql</b> in the Supabase SQL Editor, then come back here.</p>
        </Card>
      </>
    );
  }
  const sessions = (sRes.data ?? []) as unknown as S[];
  const ids = sessions.map((s) => s.id);
  const { data: bRows } = ids.length ? await supabase.from("bookings").select("id, session_id, seats, status, hold_expires_at, total, amount_paid, payment_method, source, contact_name, reference, created_at").in("session_id", ids).neq("status", "cancelled") : { data: [] };
  const bookings = (bRows ?? []) as B[];
  const by = new Map<string, B[]>();
  for (const b of bookings) by.set(b.session_id, [...(by.get(b.session_id) ?? []), b]);

  const in30 = Date.now() + 30 * 86400e3;
  const soon = sessions.filter((s) => Date.parse(s.starts_at) < in30);
  const soonSeats = soon.reduce((t, s) => t + bookedSeats(by.get(s.id) ?? []), 0);
  const soonValue = soon.reduce((t, s) => t + (by.get(s.id) ?? []).filter((b) => ["confirmed", "attended"].includes(b.status)).reduce((x, b) => x + Number(b.total), 0), 0);
  const waiting = bookings.filter((b) => b.status === "waitlist").reduce((t, b) => t + b.seats, 0);
  const full = soon.filter((s) => seatCount(s.capacity, bookedSeats(by.get(s.id) ?? []), s.external_seats).full).length;

  // Group by week (Monday) in the business's timezone
  const weekOf = (iso: string) => {
    const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date(iso)) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, S[]>();
  for (const s of sessions) weeks.set(weekOf(s.starts_at), [...(weeks.get(weekOf(s.starts_at)) ?? []), s]);
  const weekLabel = (k: string) => `Week of ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(k + "T00:00:00Z"))}`;

  return (
    <>
      <PageHeader title="Bookings" subtitle="Your classes, who's coming, and what's been paid."
        actions={<>
          <a href={`/book/${org.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}><ExternalLink className="h-4 w-4" />Booking page</a>
          <Link href="/bookings/courses" className={buttonClass("primary")}><CalendarPlus className="h-4 w-4" />Add sessions</Link>
        </>} />

      {cRes.count === 0 ? (
        <Card className="mb-5 p-5">
          <p className="text-[0.9375rem] font-semibold text-ink">Set up online bookings</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[0.8438rem] text-ink-muted">
            <li><Link href="/bookings/courses" className="font-medium text-brand-700 hover:underline">Add your courses</Link> — name, price, seats, which calendar they go on.</li>
            <li>Add the dates (e.g. every Saturday at 10am and 2:30pm).</li>
            <li><Link href="/bookings/website" className="font-medium text-brand-700 hover:underline">Put the booking form on your website</Link> and copy your past bookings across.</li>
          </ol>
        </Card>
      ) : null}

      {!past && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Seats booked · next 30 days" value={soonSeats} sub={`${soon.length} session${soon.length === 1 ? "" : "s"}`} />
          <Kpi label="Booked value · next 30 days" value={money(soonValue, org.currency)} />
          <Kpi label="Full sessions" value={full} sub="Blocked on your calendar" />
          <Kpi label="On the waitlist" value={waiting} />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <Link href="/bookings" className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", !past ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line")}>Upcoming</Link>
        <Link href="/bookings?past=1" className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", past ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line")}>Past</Link>
      </div>

      {sessions.length === 0 ? (
        <Card><EmptyState title={past ? "No past sessions" : "No upcoming sessions"} action={<Link href="/bookings/courses" className={buttonClass("primary")}>Add sessions</Link>}>Sessions are the dates people can book.</EmptyState></Card>
      ) : (
        <div className="space-y-5">
          {[...weeks.entries()].map(([wk, list]) => (
            <section key={wk}>
              <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">{weekLabel(wk)}</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {list.map((s) => {
                  const rows = by.get(s.id) ?? [];
                  const n = seatCount(s.capacity, bookedSeats(rows), s.external_seats);
                  const w = sessionWhen(s.starts_at, s.ends_at, org.timezone);
                  const wl = rows.filter((b) => b.status === "waitlist").length;
                  const pct = s.capacity ? Math.min(100, Math.round((n.taken / s.capacity) * 100)) : 100;
                  return (
                    <Link key={s.id} href={`/bookings/sessions/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-zinc-50 sm:flex-nowrap">
                      <span className="w-full min-w-0 sm:w-56 sm:flex-none">
                        <span className="block text-[0.875rem] font-semibold text-ink">{w.short}</span>
                        <span className="block text-[0.78rem] text-ink-muted">{w.time}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.course?.colour ?? "rgb(var(--brand-500))" }} />
                        <span className="truncate text-[0.875rem] text-ink">{s.course?.name}</span>
                        {s.status !== "open" && <Badge tone={s.status === "cancelled" ? "red" : "slate"}>{s.status === "cancelled" ? "Cancelled" : "Closed"}</Badge>}
                        {wl > 0 && <Badge tone="amber">{wl} waiting</Badge>}
                      </span>
                      <span className="flex w-full items-center gap-3 sm:w-64 sm:flex-none">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><span className={cn("block h-full rounded-full", n.full ? "bg-rose-500" : pct >= 67 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} /></span>
                        <span className="w-24 text-right text-[0.8125rem] tabular-nums text-ink">{n.taken}/{s.capacity}{n.full ? " · full" : ""}</span>
                      </span>
                    </Link>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      {!past && (recent.data ?? []).length > 0 && (
        <Card className="mt-6">
          <div className="px-5 pb-2 pt-4 text-[0.8438rem] font-semibold text-ink">Latest bookings</div>
          <ul className="divide-y divide-line">
            {((recent.data ?? []) as B[]).map((b) => (
              <li key={b.id}>
                <Link href={`/bookings/sessions/${b.session_id}`} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50">
                  <span className="w-20 shrink-0 text-ink-faint">{b.reference}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{b.contact_name} · {b.seats} seat{b.seats === 1 ? "" : "s"}</span>
                  <Badge tone={b.status === "confirmed" ? "green" : b.status === "waitlist" ? "amber" : b.status === "held" ? "slate" : "neutral"}>{b.status === "held" ? "Paying…" : b.status === "confirmed" ? (b.payment_method === "agency" ? "Agency" : "Paid") : b.status}</Badge>
                  <span className="hidden w-24 text-right text-ink-muted sm:block">{SRC[b.source]}</span>
                  <span className="hidden w-24 text-right text-ink-faint sm:block">{relative(b.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
