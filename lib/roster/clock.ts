import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO } from "@/lib/format";
import { roundTime } from "./award";
import { distanceMetres, readRosterSettings, type RosterSettings } from "./settings";
import { fromLocal, shiftSpan, toLocal } from "./time";

/**
 * Clocking on and off (staff app on a phone, or the café iPad). Everything runs as the server for one staff member.
 * When they clock off, the paid times are worked out: rounded, and snapped to the rostered times when within the grace
 * minutes. The office can change them before approving.
 */
export interface ClockOrg { id: string; timezone: string; settings: unknown }
export interface OpenEntry { id: string; clock_in: string; break_minutes: number; break_started_at: string | null; staff_shift_id: string | null; work_date: string }
export interface TodayShift { id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; area: string | null }

export async function openEntry(db: SupabaseClient, orgId: string, memberId: string): Promise<OpenEntry | null> {
  const { data } = await db.from("staff_time_entries").select("id, clock_in, break_minutes, break_started_at, staff_shift_id, work_date").eq("organisation_id", orgId).eq("crew_member_id", memberId).is("clock_out", null).maybeSingle();
  return (data as OpenEntry | null) ?? null;
}

/** Their published roster shifts today (and any that started yesterday and run past midnight). */
export async function shiftsToday(db: SupabaseClient, org: ClockOrg, memberId: string): Promise<TodayShift[]> {
  const today = todayISO(org.timezone);
  const { data } = await db.from("staff_shifts").select("id, shift_date, start_time, finish_time, break_minutes, published_at, area:roster_areas(name)")
    .eq("organisation_id", org.id).eq("crew_member_id", memberId).eq("roster", true).gte("shift_date", addDaysISO(today, -1)).lte("shift_date", today).order("start_time");
  return ((data ?? []) as unknown as (TodayShift & { published_at: string | null; area: { name: string } | null })[])
    .filter((s) => s.published_at && (s.shift_date === today || s.finish_time.slice(0, 5) <= s.start_time.slice(0, 5)))
    .map((s) => ({ id: s.id, shift_date: s.shift_date, start_time: s.start_time, finish_time: s.finish_time, break_minutes: s.break_minutes, area: (s.area as unknown as { name: string } | null)?.name ?? null }));
}

function nearestShift(list: TodayShift[], nowLocal: string): TodayShift | null {
  let best: TodayShift | null = null, gap = Infinity;
  for (const s of list) {
    const span = shiftSpan(s.shift_date, s.start_time, s.finish_time);
    const g = nowLocal < span.start ? Date.parse(`${span.start}:00Z`) - Date.parse(`${nowLocal}:00Z`) : nowLocal > span.finish ? Date.parse(`${nowLocal}:00Z`) - Date.parse(`${span.finish}:00Z`) : 0;
    if (g < gap) { gap = g; best = s; }
  }
  return gap <= 4 * 3_600_000 ? best : null;
}

function checkPlace(settings: RosterSettings, where: { lat: number; lng: number } | null, source: string) {
  if (source !== "phone" || !settings.geofence) return;
  if (!where) throw new Error("Allow location so the app can check you're at work, then try again.");
  const d = distanceMetres(where, settings.geofence);
  if (d > settings.geofence.metres) throw new Error(`You're about ${Math.round(d)} m away — clock on when you get to work.`);
}

export async function clockOn(db: SupabaseClient, org: ClockOrg, memberId: string, opts: { source: "phone" | "kiosk"; where: { lat: number; lng: number } | null }) {
  const settings = readRosterSettings(org.settings);
  checkPlace(settings, opts.where, opts.source);
  if (await openEntry(db, org.id, memberId)) throw new Error("You're already clocked on.");
  const nowLocal = toLocal(new Date(), org.timezone);
  const shift = nearestShift(await shiftsToday(db, org, memberId), nowLocal);
  const { error } = await db.from("staff_time_entries").insert({
    organisation_id: org.id, crew_member_id: memberId, staff_shift_id: shift?.id ?? null, work_date: shift?.shift_date ?? nowLocal.slice(0, 10),
    clock_in: new Date().toISOString(), source: opts.source, in_lat: opts.where?.lat ?? null, in_lng: opts.where?.lng ?? null,
  });
  if (error) throw new Error(/one_open/.test(error.message) ? "You're already clocked on." : error.message);
  return shift ? `Clocked on for your ${shift.start_time.slice(0, 5)} shift.` : "Clocked on. You weren't rostered on now — the office will check it.";
}

export async function startBreak(db: SupabaseClient, orgId: string, memberId: string) {
  const e = await openEntry(db, orgId, memberId);
  if (!e) throw new Error("You're not clocked on.");
  if (e.break_started_at) throw new Error("You're already on a break.");
  await db.from("staff_time_entries").update({ break_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", e.id);
  return "Break started — enjoy.";
}

const breakSoFar = (e: OpenEntry) => e.break_minutes + (e.break_started_at ? Math.round((Date.now() - Date.parse(e.break_started_at)) / 60_000) : 0);

export async function endBreak(db: SupabaseClient, orgId: string, memberId: string) {
  const e = await openEntry(db, orgId, memberId);
  if (!e?.break_started_at) throw new Error("You're not on a break.");
  await db.from("staff_time_entries").update({ break_minutes: Math.min(600, breakSoFar(e)), break_started_at: null, updated_at: new Date().toISOString() }).eq("id", e.id);
  return "Welcome back.";
}

export async function clockOff(db: SupabaseClient, org: ClockOrg, memberId: string, opts: { source: "phone" | "kiosk"; where: { lat: number; lng: number } | null }) {
  const e = await openEntry(db, org.id, memberId);
  if (!e) throw new Error("You're not clocked on.");
  const settings = readRosterSettings(org.settings);
  const now = new Date();
  let brk = Math.min(600, breakSoFar(e));
  let rostered: TodayShift | null = null;
  if (e.staff_shift_id) {
    const { data } = await db.from("staff_shifts").select("id, shift_date, start_time, finish_time, break_minutes").eq("id", e.staff_shift_id).maybeSingle();
    rostered = (data as TodayShift | null) ?? null;
  }
  // no break recorded: the rostered (unpaid) break still comes off — the office sees it and can change it
  const assumedBreak = !brk && !!rostered?.break_minutes;
  if (assumedBreak) brk = rostered!.break_minutes;
  const paid = paidTimes(settings, org.timezone, e.clock_in, now.toISOString(), rostered);
  const { error } = await db.from("staff_time_entries").update({
    clock_out: now.toISOString(), break_minutes: brk, break_started_at: null, out_lat: opts.where?.lat ?? null, out_lng: opts.where?.lng ?? null,
    paid_start: paid.start, paid_finish: paid.finish, status: "pending", updated_at: now.toISOString(),
    ...(assumedBreak ? { note: `No break recorded — the rostered ${brk} min break was taken off.` } : {}),
  }).eq("id", e.id);
  if (error) throw new Error(error.message);
  const hours = Math.max(0, (Date.parse(paid.finish) - Date.parse(paid.start)) / 3_600_000 - brk / 60);
  return `Clocked off — ${Math.round(hours * 100) / 100} hours${assumedBreak ? ` (your ${brk} min break was taken off)` : ""}. Thanks!`;
}

/** Paid start/finish: clock times rounded, or the rostered times when they clocked within the grace minutes. */
export function paidTimes(settings: Pick<RosterSettings, "rounding" | "grace">, tz: string, clockIn: string, clockOut: string, shift: Pick<TodayShift, "shift_date" | "start_time" | "finish_time"> | null) {
  const inL = toLocal(clockIn, tz), outL = toLocal(clockOut, tz);
  let start = roundTime(inL, settings.rounding), finish = roundTime(outL, settings.rounding);
  if (shift) {
    const span = shiftSpan(shift.shift_date, shift.start_time, shift.finish_time);
    const mins = (a: string, b: string) => Math.abs(Date.parse(`${a}:00Z`) - Date.parse(`${b}:00Z`)) / 60_000;
    if (mins(inL, span.start) <= settings.grace) start = span.start;
    if (mins(outL, span.finish) <= settings.grace) finish = span.finish;
  }
  if (finish <= start) finish = roundTime(outL, 1);
  return { start: fromLocal(start, tz), finish: fromLocal(finish, tz) };
}
