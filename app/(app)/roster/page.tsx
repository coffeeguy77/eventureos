import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, todayISO } from "@/lib/format";
import { weekOf } from "@/lib/roster/award";
import { loadWeek, plainWeek } from "@/lib/roster/data";
import { LEAVE_LABEL } from "@/lib/roster/settings";
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

  if (!week.ready) {
    return (<div><PageHeader title="Roster" /><Card><EmptyState title="One database update to go">Run 0084_cafe_roster.sql in Supabase to switch on the café roster.</EmptyState></Card></div>);
  }

  const [{ data: leave }, { data: offers }] = await Promise.all([
    supabase.from("staff_unavailability").select("id, starts_on, ends_on, leave_type, hours, note, created_at, member:crew_members(name)").eq("organisation_id", org.id).eq("status", "pending").order("starts_on"),
    supabase.from("staff_shift_offers").select("id, status, note, created_at, from:crew_members!staff_shift_offers_from_member_id_organisation_id_fkey(name), to:crew_members!staff_shift_offers_to_member_id_organisation_id_fkey(name), shift:staff_shifts!staff_shift_offers_staff_shift_id_fkey(shift_date, start_time, finish_time, title), swap:staff_shifts!staff_shift_offers_swap_shift_id_fkey(shift_date, start_time, finish_time)")
      .eq("organisation_id", org.id).in("status", ["open", "claimed"]).order("created_at"),
  ]);
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
          {(leaveList.length > 0 || offerList.length > 0) && <Requests leave={leaveList} offers={offerList} />}
          <RosterGrid week={plainWeek(week)} today={today} prev={addDaysISO(monday, -7)} next={addDaysISO(monday, 7)} />
        </div>
      )}
    </div>
  );
}
