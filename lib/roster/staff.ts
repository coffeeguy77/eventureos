import "server-only";
import type { CrewSession } from "@/lib/crew/server";
import { addDaysISO, todayISO } from "@/lib/format";

/** The café-roster parts of the staff app: availability, leave, swaps / cover, open shifts, timesheets. */

export async function rosterProfile(s: CrewSession): Promise<{ onRoster: boolean; employment: string }> {
  const { data, error } = await s.db.from("crew_members").select("on_roster, employment_type").eq("id", s.member.id).maybeSingle();
  if (error || !data) return { onRoster: false, employment: "casual" };
  return { onRoster: !!data.on_roster, employment: (data.employment_type as string) ?? "casual" };
}

export async function myAvailability(s: CrewSession) {
  const { data } = await s.db.from("staff_availability").select("id, weekday, available, start_time, finish_time, note").eq("crew_member_id", s.member.id).order("weekday");
  return ((data ?? []) as { id: string; weekday: number; available: boolean; start_time: string | null; finish_time: string | null; note: string | null }[])
    .map((a) => ({ ...a, start_time: a.start_time?.slice(0, 5) ?? null, finish_time: a.finish_time?.slice(0, 5) ?? null }));
}

export async function myLeave(s: CrewSession, today: string) {
  const { data } = await s.db.from("staff_unavailability").select("id, starts_on, ends_on, note, leave_type, status, hours, decline_reason").eq("crew_member_id", s.member.id).gte("ends_on", addDaysISO(today, -30)).order("starts_on");
  return (data ?? []) as { id: string; starts_on: string; ends_on: string; note: string | null; leave_type: string | null; status: string; hours: number | null; decline_reason: string | null }[];
}

/** Shifts on offer to me: others giving theirs away (published, future), and open shifts no one has. */
export async function boardRoster(s: CrewSession) {
  const today = todayISO(s.org.timezone);
  const [{ data: offers }, { data: open }, { data: mine }] = await Promise.all([
    s.db.from("staff_shift_offers").select("id, note, status, to_member_id, from:crew_members!staff_shift_offers_from_member_id_organisation_id_fkey(name), shift:staff_shifts!staff_shift_offers_staff_shift_id_fkey(id, shift_date, start_time, finish_time, break_minutes, area:roster_areas(name))")
      .eq("organisation_id", s.org.id).eq("status", "open").neq("from_member_id", s.member.id),
    s.db.from("staff_shifts").select("id, shift_date, start_time, finish_time, break_minutes, area:roster_areas(name)").eq("organisation_id", s.org.id).eq("roster", true).is("crew_member_id", null).not("published_at", "is", null).gte("shift_date", today).order("shift_date").order("start_time"),
    s.db.from("staff_shift_offers").select("id, status, staff_shift_id, to:crew_members!staff_shift_offers_to_member_id_organisation_id_fkey(name)").eq("organisation_id", s.org.id).eq("from_member_id", s.member.id).in("status", ["open", "claimed"]),
  ]);
  type Sh = { id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; area: { name: string } | null };
  return {
    offers: ((offers ?? []) as unknown as { id: string; note: string | null; to_member_id: string | null; from: { name: string } | null; shift: Sh | null }[])
      .filter((o) => o.shift && o.shift.shift_date >= today && (!o.to_member_id || o.to_member_id === s.member.id)),
    open: (open ?? []) as unknown as Sh[],
    mine: (mine ?? []) as unknown as { id: string; status: string; staff_shift_id: string; to: { name: string } | null }[],
  };
}

export async function myTimesheets(s: CrewSession, from: string) {
  const { data } = await s.db.from("staff_time_entries").select("id, work_date, clock_in, clock_out, break_minutes, paid_start, paid_finish, status, note").eq("crew_member_id", s.member.id).gte("work_date", from).order("clock_in", { ascending: false }).limit(60);
  return (data ?? []) as { id: string; work_date: string; clock_in: string; clock_out: string | null; break_minutes: number; paid_start: string | null; paid_finish: string | null; status: string; note: string | null }[];
}
