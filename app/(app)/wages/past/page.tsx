import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { localDate } from "@/lib/ai/classify";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";
import { WageTabs } from "../tabs";
import { AssignWorked } from "../shifts-ui";

export const metadata = { title: "Past jobs" };

type Assigned = { key: string; crewId: string; name: string; paid: boolean; kind: "event" | "custom" };
type Item = { key: string; kind: "event" | "booking" | "shift"; id: string; date: string; title: string; time: string; where: string | null; href?: string; assigned: Assigned[] };

/** Recent jobs (EventureOS events and Google Calendar bookings) — record who worked each so their hours can be paid. */
export default async function PastJobsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const weeks = [2, 4, 8, 12, 26].includes(Number(sp.weeks)) ? Number(sp.weeks) : 4;
  const tz = org.timezone, today = todayISO(tz), from = addDaysISO(today, -weeks * 7);
  const hm = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(" ", "").toLowerCase();
  const t = (x: string | null) => (x ? x.slice(0, 5) : null);

  const [{ data: staffRows }, { data: evRows }, { data: calRows }, shiftRes] = await Promise.all([
    supabase.from("crew_members").select("id, name").eq("organisation_id", org.id).eq("active", true).order("rank").order("name"),
    supabase.from("events").select("id, name, event_date, setup_time, start_time, finish_time, venue, status, crew:event_crew(id, crew_member_id, status, payment_id, member:crew_members(name))")
      .eq("organisation_id", org.id).gte("event_date", from).lte("event_date", today).neq("status", "cancelled").order("event_date", { ascending: false }).limit(300),
    supabase.from("calendar_events").select("id, title, starts_at, ends_at, all_day, location").eq("organisation_id", org.id).is("event_id", null).eq("kind", "other")
      .gte("starts_at", `${from}T00:00:00Z`).lte("starts_at", `${addDaysISO(today, 1)}T00:00:00Z`).order("starts_at", { ascending: false }).limit(500),
    supabase.from("staff_shifts").select("id, crew_member_id, title, shift_date, start_time, finish_time, location, payment_id, source_calendar_event_id, member:crew_members(name)")
      .eq("organisation_id", org.id).gte("shift_date", from).lte("shift_date", today),
  ]);
  const staff = (staffRows ?? []) as { id: string; name: string }[];
  type Sh = { id: string; crew_member_id: string; title: string; shift_date: string; start_time: string | null; finish_time: string | null; location: string | null; payment_id: string | null; source_calendar_event_id: string | null; member: { name: string } | null };
  const shifts = (shiftRes.error ? [] : shiftRes.data ?? []) as unknown as Sh[];
  const items: Item[] = [];
  for (const e of (evRows ?? []) as unknown as { id: string; name: string; event_date: string; setup_time: string | null; start_time: string | null; finish_time: string | null; venue: string | null; crew: { id: string; crew_member_id: string; status: string; payment_id: string | null; member: { name: string } | null }[] }[]) {
    items.push({ key: `e${e.id}`, kind: "event", id: e.id, date: e.event_date, title: e.name, href: `/events/${e.id}`,
      time: `${t(e.setup_time) ?? t(e.start_time) ?? "?"}–${t(e.finish_time) ?? "?"}`, where: e.venue,
      assigned: e.crew.filter((c) => c.status !== "interested").map((c) => ({ key: `e:${c.id}`, crewId: c.crew_member_id, name: c.member?.name ?? "?", paid: !!c.payment_id, kind: "event" as const })) });
  }
  const fromBooking = new Map<string, Sh[]>();
  for (const s of shifts) if (s.source_calendar_event_id) fromBooking.set(s.source_calendar_event_id, [...(fromBooking.get(s.source_calendar_event_id) ?? []), s]);
  if (!shiftRes.error) for (const c of (calRows ?? []) as { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null }[]) {
    items.push({ key: `b${c.id}`, kind: "booking", id: c.id, date: localDate(c.starts_at, tz), title: c.title, time: c.all_day ? "All day" : `${hm(c.starts_at)}–${hm(c.ends_at)}`, where: c.location,
      assigned: (fromBooking.get(c.id) ?? []).map((s) => ({ key: `c:${s.id}`, crewId: s.crew_member_id, name: s.member?.name ?? "?", paid: !!s.payment_id, kind: "custom" as const })) });
  }
  for (const s of shifts.filter((x) => !x.source_calendar_event_id)) {
    items.push({ key: `s${s.id}`, kind: "shift", id: s.id, date: s.shift_date, title: s.title, time: `${t(s.start_time) ?? "?"}–${t(s.finish_time) ?? "?"}`, where: s.location,
      assigned: [{ key: `c:${s.id}`, crewId: s.crew_member_id, name: s.member?.name ?? "?", paid: !!s.payment_id, kind: "custom" }] });
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));
  const byDay = new Map<string, Item[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const unstaffed = items.filter((i) => i.kind !== "shift" && i.assigned.length === 0).length;

  return (
    <div>
      <PageHeader title="Wages" subtitle="Recent jobs from EventureOS and your Google Calendar. Add who worked each one and their hours go straight into Owed." />
      <WageTabs active="past" />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[0.75rem]">
        <span className="text-ink-muted">Show the last</span>
        {[2, 4, 8, 12, 26].map((w) => (
          <Link key={w} href={`/wages/past?weeks=${w}`} className={cn("rounded-md px-2.5 py-1 font-medium ring-1 ring-inset", w === weeks ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line hover:bg-zinc-50")}>{w} weeks</Link>
        ))}
        {unstaffed > 0 && <span className="ml-auto text-amber-700">{unstaffed} job{unstaffed === 1 ? "" : "s"} with nobody recorded</span>}
      </div>
      {shiftRes.error && <Card className="mb-4"><p className="px-5 py-4 text-[0.8125rem] text-ink-muted">Run 0044_staff_shifts.sql in Supabase to also see your Google Calendar bookings here.</p></Card>}
      {items.length === 0 ? <Card><EmptyState title="No jobs in that period" /></Card> : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([d, list]) => (
            <Card key={d}>
              <CardHeader title={fmtDate(d, "weekday")} subtitle={`${list.length} job${list.length === 1 ? "" : "s"}`} />
              <ul className="divide-y divide-line border-t border-line">
                {list.map((i) => (
                  <li key={i.key} className={cn("px-5 py-3", i.kind !== "shift" && i.assigned.length === 0 && "bg-amber-50/40")}>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[0.8438rem] font-medium text-ink">{i.href ? <Link href={i.href} className="hover:text-brand-700">{i.title}</Link> : i.title}</p>
                      <span className="text-[0.7188rem] text-ink-faint">{i.kind === "event" ? "Event" : i.kind === "booking" ? "Google Calendar" : "Shift"} · {i.time}{i.where ? ` · ${i.where}` : ""}</span>
                    </div>
                    <div className="mt-1.5">
                      {i.kind === "shift"
                        ? <p className="text-[0.75rem] text-ink-muted">{i.assigned[0].name}{i.assigned[0].paid ? " · paid" : ""}</p>
                        : <AssignWorked kind={i.kind} id={i.id} staff={staff} assigned={i.assigned} />}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
