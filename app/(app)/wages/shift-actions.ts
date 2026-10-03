"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { fillSeries, removeShiftCalendar, syncShiftCalendar } from "@/lib/crew/custom-shifts";
import { weekdayOf, WEEKDAYS } from "@/lib/crew/series";
import { fmtDate, todayISO } from "@/lib/format";
import { localDate } from "@/lib/ai/classify";

export type ShiftResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can manage shifts.");
  return ctx;
}
async function wrap(fn: () => Promise<string | void>): Promise<ShiftResult> {
  try { const m = await fn(); revalidatePath("/wages", "layout"); return { ok: true, message: m || undefined }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export interface ShiftInput {
  crewId: string; title: string; date: string; start: string | null; finish: string | null; location: string | null; notes: string | null;
  repeat: "none" | "weekly" | "fortnightly"; until: string | null;
}

/** A shift that isn't an event shift — once, or every week / fortnight on that weekday. */
export async function createShift(input: ShiftInput) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(input.crewId)) throw new Error("Choose who's working it.");
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new Error("Give the shift a name, e.g. Coffee delivery.");
    if (!DATE.test(input.date)) throw new Error("Choose the date.");
    if (input.start && !TIME.test(input.start)) throw new Error("Check the start time.");
    if (input.finish && !TIME.test(input.finish)) throw new Error("Check the finish time.");
    if (input.repeat !== "none" && (!input.start || !input.finish)) throw new Error("A regular shift needs a start and finish time.");
    if (input.until && (!DATE.test(input.until) || input.until < input.date)) throw new Error("The end date is before the first shift.");
    const { data: m } = await supabase.from("crew_members").select("name").eq("id", input.crewId).eq("organisation_id", org.id).maybeSingle();
    if (!m) throw new Error("That person isn't on the staff list.");
    const base = { organisation_id: org.id, crew_member_id: input.crewId, title, location: input.location?.trim().slice(0, 300) || null, notes: input.notes?.trim().slice(0, 2000) || null, created_by: user.id };

    if (input.repeat === "none") {
      const { data: s, error } = await supabase.from("staff_shifts").insert({ ...base, shift_date: input.date, start_time: input.start, finish_time: input.finish }).select("id").single();
      if (error) throw new Error(/staff_shifts/.test(error.message) ? "Run the latest database update first." : error.message);
      await syncShiftCalendar(supabase, org.id, org.timezone, [s.id]);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.shift_added", entityType: "crew_member", entityId: input.crewId,
        summary: `${actorName(profile)} added a shift for ${m.name}: ${title} on ${fmtDate(input.date)}` });
      return `Shift added for ${m.name}.`;
    }
    const every = input.repeat === "fortnightly" ? 2 : 1;
    const { data: series, error } = await supabase.from("staff_shift_series").insert({
      ...base, weekday: weekdayOf(input.date), every_weeks: every, start_time: input.start, finish_time: input.finish, starts_on: input.date, ends_on: input.until || null,
    }).select("id").single();
    if (error) throw new Error(/staff_shift_series/.test(error.message) ? "Run the latest database update first." : error.message);
    // Past dates (if the first shift is already behind us) aren't created automatically — add those one by one
    const made = await fillSeries(supabase, org.id, org.timezone, series.id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.series_added", entityType: "crew_member", entityId: input.crewId,
      summary: `${actorName(profile)} set ${m.name} a regular shift: ${title} every ${every === 2 ? "second " : ""}${WEEKDAYS[weekdayOf(input.date)]}` });
    return `Regular shift set — ${made.length} upcoming shift${made.length === 1 ? "" : "s"} added to ${m.name}'s calendar (it keeps filling 8 weeks ahead).`;
  });
}

export async function deleteShift(shiftId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(shiftId)) throw new Error("Refresh and try again.");
    const { data: s } = await supabase.from("staff_shifts").select("id, title, shift_date, payment_id, series_id, member:crew_members(name)").eq("id", shiftId).eq("organisation_id", org.id).maybeSingle();
    if (!s) return;
    if (s.payment_id) throw new Error("This shift has been paid. Undo the payment first.");
    await removeShiftCalendar(supabase, org.id, [shiftId]);
    const { error } = await supabase.from("staff_shifts").delete().eq("id", shiftId);
    if (error) throw new Error(error.message);
    // A removed occurrence of a regular shift mustn't come back on the next fill
    if (s.series_id) {
      const { data: ser } = await supabase.from("staff_shift_series").select("skip_dates").eq("id", s.series_id).maybeSingle();
      await supabase.from("staff_shift_series").update({ skip_dates: [...new Set([...((ser?.skip_dates as string[] | null) ?? []), s.shift_date])] }).eq("id", s.series_id);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.shift_removed", entityType: "crew_member", entityId: shiftId,
      summary: `${actorName(profile)} removed ${(s.member as unknown as { name: string } | null)?.name ?? "a staff member"}'s shift: ${s.title} on ${fmtDate(s.shift_date)}` });
    return s.series_id ? "Removed just this one — the regular shift carries on." : "Shift removed.";
  });
}

/** Stop a regular shift: no more dates are added, and unpaid future ones are removed. */
export async function endSeries(seriesId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(seriesId)) throw new Error("Refresh and try again.");
    const today = todayISO(org.timezone);
    const { data: s } = await supabase.from("staff_shift_series").select("id, title, member:crew_members(name)").eq("id", seriesId).eq("organisation_id", org.id).maybeSingle();
    if (!s) return;
    await supabase.from("staff_shift_series").update({ active: false, ends_on: today }).eq("id", seriesId);
    const { data: future } = await supabase.from("staff_shifts").select("id").eq("series_id", seriesId).gt("shift_date", today).is("payment_id", null);
    const ids = (future ?? []).map((r) => r.id as string);
    await removeShiftCalendar(supabase, org.id, ids);
    if (ids.length) await supabase.from("staff_shifts").delete().in("id", ids);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.series_ended", entityType: "crew_member", entityId: seriesId,
      summary: `${actorName(profile)} stopped ${(s.member as unknown as { name: string } | null)?.name ?? "a staff member"}'s regular shift: ${s.title}` });
    return `Stopped. ${ids.length} upcoming shift${ids.length === 1 ? "" : "s"} removed.`;
  });
}

// ---------------------------------------------------------------------------
// Past jobs: record who worked them, so their hours can be paid
// ---------------------------------------------------------------------------

/** Someone worked a past EventureOS event. */
export async function assignPastEvent(eventId: string, crewId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventId) || !UUID.test(crewId)) throw new Error("Choose someone from the staff list.");
    const [{ data: e }, { data: m }] = await Promise.all([
      supabase.from("events").select("id, name, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle(),
      supabase.from("crew_members").select("name, role").eq("id", crewId).eq("organisation_id", org.id).maybeSingle(),
    ]);
    if (!e || !m) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("event_crew").upsert({ organisation_id: org.id, event_id: eventId, crew_member_id: crewId, status: "confirmed", role: m.role, responded_at: new Date().toISOString() },
      { onConflict: "event_id,crew_member_id" });
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_added", entityType: "event", entityId: eventId, eventId, customerId: e.customer_id,
      summary: `${actorName(profile)} recorded that ${m.name} worked ${e.name}` });
    return `${m.name} added — their hours are now in Wages.`;
  });
}

export async function unassignPastEvent(eventCrewId: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(eventCrewId)) throw new Error("Refresh and try again.");
    const { data: r } = await supabase.from("event_crew").select("payment_id").eq("id", eventCrewId).eq("organisation_id", org.id).maybeSingle();
    if (r?.payment_id) throw new Error("That shift has been paid. Undo the payment first.");
    await supabase.from("event_crew").delete().eq("id", eventCrewId).eq("organisation_id", org.id);
  });
}

/** Someone worked a booking that's only in Google Calendar (no EventureOS event) — make it a shift for them. */
export async function assignPastBooking(calendarEventId: string, crewId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(calendarEventId) || !UUID.test(crewId)) throw new Error("Choose someone from the staff list.");
    const [{ data: ce }, { data: m }] = await Promise.all([
      supabase.from("calendar_events").select("id, title, starts_at, ends_at, all_day, location").eq("id", calendarEventId).eq("organisation_id", org.id).maybeSingle(),
      supabase.from("crew_members").select("name").eq("id", crewId).eq("organisation_id", org.id).maybeSingle(),
    ]);
    if (!ce || !m) throw new Error("Refresh and try again.");
    const { data: dup } = await supabase.from("staff_shifts").select("id").eq("source_calendar_event_id", calendarEventId).eq("crew_member_id", crewId).limit(1);
    if (dup?.length) return `${m.name} is already on it.`;
    const tz = org.timezone;
    const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
    const { error } = await supabase.from("staff_shifts").insert({
      organisation_id: org.id, crew_member_id: crewId, title: (ce.title || "Booking").slice(0, 120), shift_date: localDate(ce.starts_at, tz),
      start_time: ce.all_day ? null : hm(ce.starts_at), finish_time: ce.all_day ? null : hm(ce.ends_at), location: ce.location?.slice(0, 300) ?? null,
      source_calendar_event_id: calendarEventId, created_by: user.id,
    });
    if (error) throw new Error(/staff_shifts/.test(error.message) ? "Run the latest database update first." : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.shift_added", entityType: "crew_member", entityId: crewId,
      summary: `${actorName(profile)} recorded that ${m.name} worked “${ce.title}” (${fmtDate(localDate(ce.starts_at, tz))})` });
    return `${m.name} added — their hours are now in Wages.`;
  });
}

// ---------------------------------------------------------------------------
// Edit any unpaid shift: who, when, hours, rate (office shifts also: name, where, notes)
// ---------------------------------------------------------------------------
export interface ShiftEdit {
  crewId: string;
  hoursOverride: number | null; rateOverride: number | null;
  // office shifts only
  title?: string; date?: string; start?: string | null; finish?: string | null; location?: string | null; notes?: string | null;
}

export async function editShift(key: string, input: ShiftEdit) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const [kind, id] = key.split(":");
    if (!UUID.test(id ?? "") || (kind !== "e" && kind !== "c") || !UUID.test(input.crewId)) throw new Error("Refresh and try again.");
    if (input.hoursOverride != null && (!Number.isFinite(input.hoursOverride) || input.hoursOverride < 0 || input.hoursOverride > 48)) throw new Error("Hours must be between 0 and 48.");
    if (input.rateOverride != null && (!Number.isFinite(input.rateOverride) || input.rateOverride < 0 || input.rateOverride > 500)) throw new Error("Rate must be between $0 and $500.");
    const { data: m } = await supabase.from("crew_members").select("name").eq("id", input.crewId).eq("organisation_id", org.id).maybeSingle();
    if (!m) throw new Error("That person isn't on the staff list.");

    if (kind === "e") {
      const { data: r } = await supabase.from("event_crew").select("id, event_id, crew_member_id, payment_id, member:crew_members(name), event:events(name, customer_id)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
      if (!r) throw new Error("That shift no longer exists.");
      if (r.payment_id) throw new Error("This shift has been paid. Undo the payment first to change it.");
      const moved = r.crew_member_id !== input.crewId;
      const { error } = await supabase.from("event_crew").update({
        crew_member_id: input.crewId, hours_override: input.hoursOverride, rate_override: input.rateOverride,
        ...(moved ? { calendar_response: null, calendar_response_at: null, board_posted_at: null, board_note: null } : {}),
      }).eq("id", id);
      if (error) throw new Error(error.code === "23505" ? `${m.name} is already on this job.` : error.message);
      const ev = r.event as unknown as { name: string; customer_id: string } | null;
      if (moved) {
        await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_changed", entityType: "event", entityId: r.event_id, eventId: r.event_id, customerId: ev?.customer_id,
          summary: `${actorName(profile)} moved the shift on ${ev?.name ?? "a job"} from ${(r.member as unknown as { name: string } | null)?.name ?? "someone"} to ${m.name}` });
        await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", r.event_id).eq("kind", "event").neq("sync_status", "local");
      }
      return moved ? `Moved to ${m.name}.` : "Saved.";
    }

    const { data: s } = await supabase.from("staff_shifts").select("id, crew_member_id, title, shift_date, series_id, payment_id, member:crew_members(name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!s) throw new Error("That shift no longer exists.");
    if (s.payment_id) throw new Error("This shift has been paid. Undo the payment first to change it.");
    const title = (input.title ?? s.title).trim().slice(0, 120);
    if (!title) throw new Error("Give the shift a name.");
    const date = input.date ?? s.shift_date;
    if (!DATE.test(date)) throw new Error("Choose the date.");
    if (input.start && !TIME.test(input.start)) throw new Error("Check the start time.");
    if (input.finish && !TIME.test(input.finish)) throw new Error("Check the finish time.");
    const dateChanged = date !== s.shift_date;
    const { error } = await supabase.from("staff_shifts").update({
      crew_member_id: input.crewId, title, shift_date: date,
      ...(input.start !== undefined ? { start_time: input.start || null } : {}), ...(input.finish !== undefined ? { finish_time: input.finish || null } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim().slice(0, 300) || null } : {}), ...(input.notes !== undefined ? { notes: input.notes?.trim().slice(0, 2000) || null } : {}),
      hours_override: input.hoursOverride, rate_override: input.rateOverride,
      // a regular shift moved to another day becomes a one-off, and its old date isn't re-created
      ...(dateChanged && s.series_id ? { series_id: null } : {}),
    }).eq("id", id);
    if (error) throw new Error(error.message);
    if (dateChanged && s.series_id) {
      const { data: ser } = await supabase.from("staff_shift_series").select("skip_dates").eq("id", s.series_id).maybeSingle();
      await supabase.from("staff_shift_series").update({ skip_dates: [...new Set([...((ser?.skip_dates as string[] | null) ?? []), s.shift_date])] }).eq("id", s.series_id);
    }
    // Calendar: future shifts are (re)sent; one moved into the past comes off the calendar
    if (date >= todayISO(org.timezone)) await syncShiftCalendar(supabase, org.id, org.timezone, [id]);
    else await removeShiftCalendar(supabase, org.id, [id]);
    const from = (s.member as unknown as { name: string } | null)?.name ?? "someone";
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.shift_changed", entityType: "crew_member", entityId: input.crewId,
      summary: `${actorName(profile)} changed the shift “${title}” on ${fmtDate(date)}${s.crew_member_id !== input.crewId ? ` (moved from ${from} to ${m.name})` : ""}` });
    return s.crew_member_id !== input.crewId ? `Moved to ${m.name}.` : "Saved.";
  });
}

/** Take a worked event shift off someone (e.g. added to the wrong person) — unpaid only. */
export async function removeEventShift(eventCrewId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventCrewId)) throw new Error("Refresh and try again.");
    const { data: r } = await supabase.from("event_crew").select("event_id, payment_id, member:crew_members(name), event:events(name, customer_id)").eq("id", eventCrewId).eq("organisation_id", org.id).maybeSingle();
    if (!r) return;
    if (r.payment_id) throw new Error("That shift has been paid. Undo the payment first.");
    await supabase.from("event_crew").delete().eq("id", eventCrewId);
    const ev = r.event as unknown as { name: string; customer_id: string } | null;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_removed", entityType: "event", entityId: r.event_id, eventId: r.event_id, customerId: ev?.customer_id,
      summary: `${actorName(profile)} took ${(r.member as unknown as { name: string } | null)?.name ?? "someone"} off ${ev?.name ?? "a job"}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", r.event_id).eq("kind", "event").neq("sync_status", "local");
    return "Removed.";
  });
}

/** Minimum paid hours per shift (short shifts are paid up to this). Stored in the organisation's settings. */
export async function setStaffMinHours(hours: number) {
  return wrap(async () => {
    const { supabase, org, role } = await office();
    if (role === "manager") throw new Error("Only owners and admins can change pay rules.");
    if (!Number.isFinite(hours) || hours < 0 || hours > 12) throw new Error("Enter between 0 and 12 hours.");
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = { ...((o?.settings as Record<string, unknown> | null) ?? {}), staff_min_hours: Math.round(hours * 4) / 4 };
    const { error } = await supabase.from("organisations").update({ settings }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/team");
    return "Saved.";
  });
}
