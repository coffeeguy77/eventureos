import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO } from "@/lib/format";
import { breakRules, distanceMetres, readRosterSettings, type RosterSettings } from "./settings";
import { shiftBreak } from "./breaks";
import { shiftSpan, toLocal } from "./time";
import { paidTimes } from "./paid";

/**
 * Clocking on and off (staff app on a phone, or the café iPad). Everything runs as the server for one staff member.
 * When they clock off, the paid times are worked out: rounded, and snapped to the rostered times when within the grace
 * minutes. The office can change them before approving.
 */
export interface ClockOrg { id: string; timezone: string; settings: unknown }
export interface OpenEntry { id: string; clock_in: string; break_minutes: number; break_started_at: string | null; staff_shift_id: string | null; work_date: string; event_crew_id?: string | null; breaks?: { start: string; end: string }[] }
export interface TodayShift { id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; area: string | null }

export async function openEntry(db: SupabaseClient, orgId: string, memberId: string): Promise<OpenEntry | null> {
  let r = await db.from("staff_time_entries").select("id, clock_in, break_minutes, break_started_at, staff_shift_id, work_date, event_crew_id, breaks").eq("organisation_id", orgId).eq("crew_member_id", memberId).is("clock_out", null).maybeSingle();
  if (r.error) r = await db.from("staff_time_entries").select("id, clock_in, break_minutes, break_started_at, staff_shift_id, work_date, event_crew_id").eq("organisation_id", orgId).eq("crew_member_id", memberId).is("clock_out", null).maybeSingle() as typeof r;
  if (r.error) r = await db.from("staff_time_entries").select("id, clock_in, break_minutes, break_started_at, staff_shift_id, work_date").eq("organisation_id", orgId).eq("crew_member_id", memberId).is("clock_out", null).maybeSingle() as typeof r;
  return (r.data as OpenEntry | null) ?? null;
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

function checkPlace(settings: RosterSettings, where: { lat: number; lng: number } | null, source: string, event: boolean) {
  if (source !== "phone" || event || !settings.geofence) return;
  if (!where) throw new Error("Allow location so the app can check you're at work, then try again.");
  const d = distanceMetres(where, settings.geofence);
  if (d > settings.geofence.metres) throw new Error(`You're about ${Math.round(d)} m away — clock on when you get to work.`);
}

export async function clockOn(db: SupabaseClient, org: ClockOrg, memberId: string, opts: { source: "phone" | "kiosk"; where: { lat: number; lng: number } | null; eventCrewId?: string | null; photo?: string | null }) {
  const settings = readRosterSettings(org.settings);
  const event = !!opts.eventCrewId;
  if (event && !settings.clock.events) throw new Error("Clocking on for event shifts isn't switched on.");
  if (!event && opts.source === "phone" && settings.clock.cafe === "ipad") throw new Error("Café shifts are clocked on at the café iPad.");
  if (opts.source === "kiosk" && settings.clock.cafe === "phone") throw new Error("Café shifts are clocked on in the staff app on your phone.");
  checkPlace(settings, opts.where, opts.source, event);
  if (await openEntry(db, org.id, memberId)) throw new Error("You're already clocked on.");
  const nowLocal = toLocal(new Date(), org.timezone);
  const shift = event ? null : nearestShift(await shiftsToday(db, org, memberId), nowLocal);
  const id = randomUUID(), workDate = shift?.shift_date ?? nowLocal.slice(0, 10);
  const photo = await takePhoto(db, settings, opts, { orgId: org.id, memberId, workDate, entryId: id, which: "in" });
  const row = {
    id, organisation_id: org.id, crew_member_id: memberId, staff_shift_id: shift?.id ?? null, work_date: workDate,
    clock_in: new Date().toISOString(), source: opts.source, in_lat: opts.where?.lat ?? null, in_lng: opts.where?.lng ?? null,
    ...(event ? { event_crew_id: opts.eventCrewId } : {}), ...(photo ? { in_photo: photo } : {}),
  };
  let { error } = await db.from("staff_time_entries").insert(row);
  if (error && /in_photo/.test(error.message)) { const { in_photo: _drop, ...rest } = row as typeof row & { in_photo?: string }; void _drop; ({ error } = await db.from("staff_time_entries").insert(rest)); }
  if (error) throw new Error(/one_open/.test(error.message) ? "You're already clocked on." : error.message);
  return event ? "Clocked on for the event." : shift ? `Clocked on for your ${shift.start_time.slice(0, 5)} shift.` : "Clocked on. You weren't rostered on now — the office will check it.";
}

/**
 * The photo taken as someone clocks on / off (iPad or phone camera; a small JPEG data URL), saved privately under
 * their name: clock-photos/{org}/{person}/{date}-{entry}-in.jpg. When photos are switched on it's required — no photo,
 * no clock-on — unless the photo store itself isn't set up yet (database update 0085 not run), so clocking still works.
 */
async function takePhoto(db: SupabaseClient, settings: RosterSettings, opts: { source: "phone" | "kiosk"; photo?: string | null },
  at: { orgId: string; memberId: string; workDate: string; entryId: string; which: "in" | "out" }): Promise<string | null> {
  const need = settings.clock.photo;
  const m = opts.photo?.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  const word = at.which === "in" ? "clock on" : "clock off";
  if (!m) {
    if (!need) return null;
    throw new Error(opts.source === "kiosk" ? `Look at the camera — a photo is needed to ${word}. If Safari asks, allow the camera.` : `Take your photo to ${word} — allow the camera if your phone asks.`);
  }
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 600_000) throw new Error("That photo is too big — try again.");
  const path = `${at.orgId}/${at.memberId}/${at.workDate}-${at.entryId}-${at.which}.jpg`;
  const { error } = await db.storage.from("clock-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (!error) return path;
  if (/bucket not found|not found/i.test(error.message)) return null; // photo store not set up yet
  if (need) throw new Error(`Couldn't save your photo (${error.message}) — try again.`);
  return null;
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
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(e.break_started_at)) / 60_000));
  const base = { break_minutes: Math.min(600, breakSoFar(e)), break_started_at: null, updated_at: new Date().toISOString() };
  const { error } = await db.from("staff_time_entries").update({ ...base, breaks: [...(e.breaks ?? []), { start: e.break_started_at, end: new Date().toISOString() }] }).eq("id", e.id);
  if (error) await db.from("staff_time_entries").update(base).eq("id", e.id); // before database update 0086
  return `Welcome back — ${mins} min break.`;
}

export async function clockOff(db: SupabaseClient, org: ClockOrg, memberId: string, opts: { source: "phone" | "kiosk"; where: { lat: number; lng: number } | null; photo?: string | null }) {
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
  const paid = paidTimes(settings, org.timezone, e.clock_in, now.toISOString(), rostered);
  // the unpaid meal break is part of the shift (staff must take it): at least the rostered break, and at least the
  // award's minimum once the shift is long enough — even if nobody pressed "Start break"
  // breaks clocked on the iPad (any break still running ends now); none clocked = null
  const recorded = brk;
  const taken = (e.breaks?.length ?? 0) > 0 || e.break_started_at || recorded > 0 ? recorded : null;
  const spanMin = (Date.parse(paid.finish) - Date.parse(paid.start)) / 60_000;
  if (!e.event_crew_id) brk = shiftBreak(spanMin, taken, breakRules(settings), rostered?.break_minutes ?? 0);
  const breaks = e.break_started_at ? [...(e.breaks ?? []), { start: e.break_started_at, end: now.toISOString() }] : null;
  const photo = await takePhoto(db, settings, opts, { orgId: org.id, memberId, workDate: e.work_date, entryId: e.id, which: "out" });
  const { error } = await db.from("staff_time_entries").update({
    ...(photo ? { out_photo: photo } : {}),
    clock_out: now.toISOString(), break_minutes: brk, break_started_at: null, out_lat: opts.where?.lat ?? null, out_lng: opts.where?.lng ?? null,
    paid_start: paid.start, paid_finish: paid.finish, status: "pending", updated_at: now.toISOString(),
  }).eq("id", e.id);
  if (error) throw new Error(error.message);
  // what was actually clocked, for the office (database update 0086)
  await db.from("staff_time_entries").update({ break_taken: e.event_crew_id ? null : taken, ...(breaks ? { breaks } : {}) }).eq("id", e.id).then(() => undefined, () => undefined);
  const hours = Math.max(0, (Date.parse(paid.finish) - Date.parse(paid.start)) / 3_600_000 - brk / 60);
  return `Clocked off — ${Math.round(hours * 100) / 100} paid hours${brk ? ` after your ${brk} min unpaid break` : ""}. Thanks!`;
}

