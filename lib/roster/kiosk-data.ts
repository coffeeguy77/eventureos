import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/format";
import { fromLocal, shiftSpan } from "./time";
import { readRosterSettings } from "./settings";

/** Everyone on the café roster, for the iPad: today's shift (times, area, note), where they're at, when it started. */
export interface KioskPerson {
  id: string; name: string; area: string | null; hasPin: boolean;
  shift: { id: string; start: string; finish: string; startIso: string; finishIso: string; note: string | null } | null;
  state: "off" | "on" | "break" | "done"; since: string | null; breakSince: string | null; doneAt: string | null;
}

export async function kioskPeople(db: SupabaseClient, org: { id: string; timezone: string }): Promise<KioskPerson[]> {
  const today = todayISO(org.timezone);
  const [{ data: people }, { data: ents }, { data: shifts }, { data: areas }] = await Promise.all([
    db.from("crew_members").select("id, name, default_area_id, kiosk_pin_hash").eq("organisation_id", org.id).eq("active", true).eq("on_roster", true).order("name"),
    db.from("staff_time_entries").select("crew_member_id, clock_in, clock_out, break_started_at, event_crew_id").eq("organisation_id", org.id).or(`work_date.eq.${today},clock_out.is.null`).order("clock_in"),
    db.from("staff_shifts").select("id, crew_member_id, area_id, start_time, finish_time, notes").eq("organisation_id", org.id).eq("roster", true).eq("shift_date", today).not("published_at", "is", null).order("start_time"),
    db.from("roster_areas").select("id, name").eq("organisation_id", org.id),
  ]);
  const areaName = new Map(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  type En = { crew_member_id: string; clock_in: string; clock_out: string | null; break_started_at: string | null; event_crew_id?: string | null };
  const list = ((ents ?? []) as En[]).filter((e) => !e.event_crew_id);
  const sh = (shifts ?? []) as { id: string; crew_member_id: string | null; area_id: string | null; start_time: string; finish_time: string; notes: string | null }[];
  return ((people ?? []) as { id: string; name: string; default_area_id: string | null; kiosk_pin_hash: string | null }[]).map((p) => {
    const mine = list.filter((e) => e.crew_member_id === p.id);
    const open = mine.find((e) => !e.clock_out), last = mine[mine.length - 1];
    const s = sh.find((x) => x.crew_member_id === p.id) ?? null;
    const span = s ? shiftSpan(today, s.start_time, s.finish_time) : null;
    return {
      id: p.id, name: p.name, hasPin: !!p.kiosk_pin_hash,
      area: (s?.area_id ? areaName.get(s.area_id) : null) ?? (p.default_area_id ? areaName.get(p.default_area_id) ?? null : null),
      shift: s && span ? { id: s.id, start: s.start_time.slice(0, 5), finish: s.finish_time.slice(0, 5), startIso: fromLocal(span.start, org.timezone), finishIso: fromLocal(span.finish, org.timezone), note: s.notes } : null,
      state: open ? (open.break_started_at ? "break" : "on") : last?.clock_out ? "done" : "off",
      since: open?.clock_in ?? null, breakSince: open?.break_started_at ?? null, doneAt: !open && last?.clock_out ? last.clock_out : null,
    } as KioskPerson;
  });
}

/** The week from today, for "View full roster" (names, areas, times — nothing about pay). */
export async function kioskWeek(db: SupabaseClient, org: { id: string; timezone: string }) {
  const today = todayISO(org.timezone);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("staff_shifts").select("id, shift_date, start_time, finish_time, crew_member_id, member:crew_members(name), area:roster_areas(name)")
    .eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).gte("shift_date", today).lte("shift_date", end).order("shift_date").order("start_time");
  return ((data ?? []) as unknown as { id: string; shift_date: string; start_time: string; finish_time: string; crew_member_id: string | null; member: { name: string } | null; area: { name: string } | null }[])
    .map((x) => ({ id: x.id, date: x.shift_date, start: x.start_time.slice(0, 5), finish: x.finish_time.slice(0, 5), memberId: x.crew_member_id, name: x.member?.name ?? "Open shift", area: x.area?.name ?? null }));
}

export const homePlace = (settings: unknown, areas: { id: string; name: string }[]) => {
  const h = readRosterSettings(settings).home_areas;
  return areas.find((a) => h.includes(a.id))?.name ?? null;
};
