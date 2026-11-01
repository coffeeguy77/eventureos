import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO } from "@/lib/format";
import { fromLocal, shiftSpan } from "./time";
import { readRosterSettings } from "./settings";

/**
 * How reliably each person turns up: rostered (published) shifts that have started, against their first clock-on that
 * day. Late = clocked on after the start (minutes); no-show = no clock-on at all. Also breaks over the minimum.
 * Shifts from before clocking was used (e.g. brought over from Deputy, no clock times) don't count.
 */
export interface Punctuality { id: string; name: string; shifts: number; onTime: number; late: number; avgLate: number; worstLate: number; noShows: number; longBreaks: number; lastLate: string | null }

export async function punctuality(db: SupabaseClient, org: { id: string; timezone: string; settings: unknown }, days = 90): Promise<Punctuality[]> {
  const st = readRosterSettings(org.settings);
  const today = todayISO(org.timezone), from = addDaysISO(today, -days);
  const [{ data: people }, { data: sh }, { data: ents }] = await Promise.all([
    db.from("crew_members").select("id, name").eq("organisation_id", org.id).eq("active", true).eq("on_roster", true).order("name"),
    db.from("staff_shifts").select("crew_member_id, shift_date, start_time, finish_time").eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).gte("shift_date", from).lte("shift_date", today),
    db.from("staff_time_entries").select("crew_member_id, work_date, clock_in, source, break_taken").eq("organisation_id", org.id).gte("work_date", addDaysISO(from, -1)).lte("work_date", today).order("clock_in"),
  ]);
  type E = { crew_member_id: string; work_date: string; clock_in: string; source: string; break_taken?: number | null };
  const entries = (ents ?? []) as E[];
  const clocked = entries.filter((e) => e.source === "kiosk" || e.source === "phone");
  // only judge from the first day this person clocked themselves (before that, hours were typed in)
  const firstClock = new Map<string, string>();
  for (const e of clocked) if (!firstClock.has(e.crew_member_id)) firstClock.set(e.crew_member_id, e.work_date);
  const now = Date.now();
  return ((people ?? []) as { id: string; name: string }[]).map((p) => {
    const start = firstClock.get(p.id);
    const r: Punctuality = { id: p.id, name: p.name, shifts: 0, onTime: 0, late: 0, avgLate: 0, worstLate: 0, noShows: 0, longBreaks: 0, lastLate: null };
    if (!start) return r;
    let lateSum = 0;
    for (const s of ((sh ?? []) as { crew_member_id: string; shift_date: string; start_time: string; finish_time: string }[]).filter((x) => x.crew_member_id === p.id && x.shift_date >= start)) {
      const span = shiftSpan(s.shift_date, s.start_time, s.finish_time);
      const startMs = Date.parse(fromLocal(span.start, org.timezone));
      if (startMs > now) continue;
      r.shifts++;
      const e = clocked.find((x) => x.crew_member_id === p.id && Math.abs(Date.parse(x.clock_in) - startMs) < 6 * 3_600_000);
      if (!e) { if (Date.parse(fromLocal(span.finish, org.timezone)) < now) r.noShows++; else r.shifts--; continue; }
      const late = Math.round((Date.parse(e.clock_in) - startMs) / 60_000);
      if (late > 0) { r.late++; lateSum += late; r.worstLate = Math.max(r.worstLate, late); if (!r.lastLate || s.shift_date > r.lastLate) r.lastLate = s.shift_date; }
      else r.onTime++;
    }
    r.avgLate = r.late ? Math.round(lateSum / r.late) : 0;
    r.longBreaks = clocked.filter((x) => x.crew_member_id === p.id && x.work_date >= start && (x.break_taken ?? 0) > st.meal.minutes).length;
    return r;
  });
}
