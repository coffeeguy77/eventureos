import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO, zonedTimeUTC } from "@/lib/format";
import { readSettings, scheduleDates } from "./core";

/**
 * Keep each course's weekly timetable open the set number of days ahead.
 * Only adds missing sessions: dates the office cancelled stay cancelled (same course + start time already exists).
 */
export async function fillSchedules(db: SupabaseClient, orgId: string): Promise<number> {
  const { data: o } = await db.from("organisations").select("timezone, settings").eq("id", orgId).single();
  if (!o) return 0;
  const s = readSettings(o.settings);
  const live = s.schedules.filter((x) => x.active);
  if (!live.length) return 0;
  const tz = (o.timezone as string) || "Australia/Sydney";
  const { data: cs } = await db.from("booking_courses").select("id, duration_minutes, capacity")
    .eq("organisation_id", orgId).eq("active", true).in("id", live.map((x) => x.course_id));
  const courses = new Map(((cs ?? []) as { id: string; duration_minutes: number; capacity: number }[]).map((c) => [c.id, c]));
  const today = todayISO(tz), now = Date.now();
  const rows = live.flatMap((sc) => {
    const c = courses.get(sc.course_id);
    if (!c) return [];
    return scheduleDates(sc, s.closures, today).flatMap((d) => sc.times.map((t) => {
      const starts = zonedTimeUTC(d, t, tz);
      return { organisation_id: orgId, course_id: c.id, starts_at: starts, ends_at: new Date(Date.parse(starts) + Number(c.duration_minutes) * 60000).toISOString(), capacity: c.capacity, status: "open" };
    }));
  }).filter((r) => Date.parse(r.starts_at) > now).slice(0, 600);
  if (!rows.length) return 0;
  const { data, error } = await db.from("booking_sessions").upsert(rows, { onConflict: "course_id,starts_at", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Every business with a timetable (run by the scheduled sync). */
export async function fillAllSchedules(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("organisations").select("id").not("settings->booking->schedules", "is", null);
  let n = 0;
  for (const o of (data ?? []) as { id: string }[]) n += await fillSchedules(db, o.id).catch(() => 0);
  return n;
}
