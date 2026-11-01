import Link from "next/link";
import { WhosOn, type TodayRow } from "./today";
import { fromLocal, shiftSpan, toLocal } from "@/lib/roster/time";
const addMinutesLocal = (local: string, m: number) => new Date(Date.parse(`${local}:00Z`) + m * 60_000).toISOString().slice(0, 16);
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, todayISO } from "@/lib/format";
import { weekOf } from "@/lib/roster/award";
import { loadWeek, plainWeek } from "@/lib/roster/data";
import { LEAVE_LABEL, readRosterSettings } from "@/lib/roster/settings";
import { RosterTabs } from "./tabs";
import { RosterGrid, Requests } from "./grid";

export const metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

/** The café roster: build the week, publish it to the staff app, deal with leave and swap requests. */
export default async function RosterPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const sp = await searchParams;
  const today = todayISO(org.timezone);
  const monday = weekOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? "") ? sp.w! : today);
  const week = await loadWeek(supabase, org, monday);
  const { data: tw } = await supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "twilio").maybeSingle();
  const smsOn = tw?.status === "connected";

  if (!week.ready) {
    return (<div><PageHeader title="Roster" /><Card><EmptyState title="One database update to go">Run 0084_cafe_roster.sql in Supabase to switch on the café roster.</EmptyState></Card></div>);
  }

  const [{ data: leave }, { data: offers }] = await Promise.all([
    supabase.from("staff_unavailability").select("id, starts_on, ends_on, leave_type, hours, note, created_at, member:crew_members(name)").eq("organisation_id", org.id).eq("status", "pending").order("starts_on"),
    supabase.from("staff_shift_offers").select("id, status, note, created_at, from:crew_members!staff_shift_offers_from_member_id_organisation_id_fkey(name), to:crew_members!staff_shift_offers_to_member_id_organisation_id_fkey(name), shift:staff_shifts!staff_shift_offers_staff_shift_id_fkey(shift_date, start_time, finish_time, title), swap:staff_shifts!staff_shift_offers_swap_shift_id_fkey(shift_date, start_time, finish_time)")
      .eq("organisation_id", org.id).in("status", ["open", "claimed"]).order("created_at"),
  ]);
  // Today: who's on, on a break, late or done (this week's view only)
  const st = readRosterSettings(org.settings);
  let todayRows: TodayRow[] = [];
  if (monday === weekOf(today)) {
    const { data: ents } = await supabase.from("staff_time_entries").select("crew_member_id, staff_shift_id, clock_in, clock_out, break_started_at").eq("organisation_id", org.id).or(`work_date.eq.${today},clock_out.is.null`);
    type En = { crew_member_id: string; staff_shift_id: string | null; clock_in: string; clock_out: string | null; break_started_at: string | null };
    const list = (ents ?? []) as En[];
    const nowL = toLocal(new Date(), org.timezone);
    const shiftsToday = week.shifts.filter((x) => x.shift_date === today && x.crew_member_id && x.published_at);
    const nameOf = new Map(week.people.map((p) => [p.id, p.name]));
    const used = new Set<En>();
    todayRows = shiftsToday.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((x) => {
      const span = shiftSpan(x.shift_date, x.start_time, x.finish_time);
      const e = list.find((y) => !used.has(y) && y.crew_member_id === x.crew_member_id && (y.staff_shift_id === x.id || !y.staff_shift_id));
      if (e) used.add(e);
      const late = !e && nowL > addMinutesLocal(span.start, st.grace) && nowL < span.finish;
      return { name: nameOf.get(x.crew_member_id!) ?? "—", shift: `${x.start_time.slice(0, 5)}–${x.finish_time.slice(0, 5)}`, start: fromLocal(span.start, org.timezone),
        state: e ? (e.clock_out ? "done" : e.break_started_at ? "break" : "on") : late ? "late" : nowL >= span.finish ? "done" : "due", since: e?.clock_in ?? null, breakSince: e?.break_started_at ?? null } as TodayRow;
    }).filter((r) => !(r.state === "done" && !r.since)); // rostered but never came and the shift's over: Timesheets shows it
    for (const e of list) if (!used.has(e) && !e.clock_out) todayRows.push({ name: nameOf.get(e.crew_member_id) ?? "Someone", shift: null, start: null, state: e.break_started_at ? "break" : "unrostered", since: e.clock_in, breakSince: e.break_started_at });
  }
  type L = { id: string; starts_on: string; ends_on: string; leave_type: string | null; hours: number | null; note: string | null; member: { name: string } | null };
  type O = { id: string; status: string; note: string | null; from: { name: string } | null; to: { name: string } | null; shift: { shift_date: string; start_time: string; finish_time: string; title: string } | null; swap: { shift_date: string; start_time: string; finish_time: string } | null };
  const leaveList = ((leave ?? []) as unknown as L[]).map((l) => ({ id: l.id, who: l.member?.name ?? "—", from: l.starts_on, to: l.ends_on, type: LEAVE_LABEL[l.leave_type ?? ""] ?? "Away", hours: l.hours == null ? null : Number(l.hours), note: l.note }));
  const offerList = ((offers ?? []) as unknown as O[]).map((o) => ({ id: o.id, status: o.status, note: o.note, from: o.from?.name ?? "—", to: o.to?.name ?? null, shift: o.shift, swap: o.swap }));

  return (
    <div>
      <PageHeader title="Roster" subtitle="Build the café week, publish it to the staff app, and approve leave and shift swaps." />
      <RosterTabs active="week" />
      {week.people.length === 0 ? (
        <Card><EmptyState title="Nobody is on the roster yet" action={<Link href="/roster/setup" className="text-[0.8125rem] font-medium text-brand-600">Set up the roster →</Link>}>
          Choose who works in the café, add areas like Barista and Floor, and import from Deputy in Setup.
        </EmptyState></Card>
      ) : (
        <div className="space-y-6">
          <WhosOn rows={todayRows} breakMin={st.meal.minutes} breakMax={Math.max(st.breaks.max, st.meal.minutes)} />
          {(leaveList.length > 0 || offerList.length > 0) && <Requests leave={leaveList} offers={offerList} />}
          <RosterGrid week={plainWeek(week)} today={today} prev={addDaysISO(monday, -7)} next={addDaysISO(monday, 7)} smsOn={smsOn} meal={st.meal} />
        </div>
      )}
    </div>
  );
}
