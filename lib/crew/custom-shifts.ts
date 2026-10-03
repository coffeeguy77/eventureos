import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO, zonedTimeUTC } from "@/lib/format";
import { seriesDates } from "./series";

/**
 * Shifts that aren't event shifts (a weekly coffee delivery, a one-off roastery day, a past Google booking someone
 * worked). Future ones go to the staff member's Google Calendar as an invite so their phone reminds them.
 */
export const HORIZON_DAYS = 56;

/** Create the upcoming occurrences of active regular shifts (idempotent). Returns the new shift ids. */
export async function fillSeries(db: SupabaseClient, orgId: string, tz: string, seriesId?: string): Promise<string[]> {
  const today = todayISO(tz), to = addDaysISO(today, HORIZON_DAYS);
  let q = db.from("staff_shift_series").select("id, crew_member_id, title, weekday, every_weeks, start_time, finish_time, location, notes, starts_on, ends_on, skip_dates, created_by")
    .eq("organisation_id", orgId).eq("active", true);
  if (seriesId) q = q.eq("id", seriesId);
  const { data, error } = await q;
  if (error) return [];
  const rows: Record<string, unknown>[] = [];
  for (const s of (data ?? []) as { id: string; crew_member_id: string; title: string; weekday: number; every_weeks: number; start_time: string; finish_time: string; location: string | null; notes: string | null; starts_on: string; ends_on: string | null; skip_dates: string[] | null; created_by: string | null }[]) {
    for (const d of seriesDates(s, today, to).filter((x) => !(s.skip_dates ?? []).includes(x))) {
      rows.push({ organisation_id: orgId, crew_member_id: s.crew_member_id, title: s.title, shift_date: d, start_time: s.start_time, finish_time: s.finish_time,
        location: s.location, notes: s.notes, series_id: s.id, created_by: s.created_by });
    }
  }
  if (!rows.length) return [];
  const { data: made } = await db.from("staff_shifts").upsert(rows, { onConflict: "series_id,shift_date", ignoreDuplicates: true }).select("id");
  const ids = (made ?? []).map((r) => r.id as string);
  if (ids.length) await syncShiftCalendar(db, orgId, tz, ids);
  return ids;
}

/** Make / update the Google Calendar entry for these shifts (future ones only), then push them now if we can. */
export async function syncShiftCalendar(db: SupabaseClient, orgId: string, tz: string, shiftIds: string[]) {
  if (!shiftIds.length) return;
  const today = todayISO(tz);
  const [{ data: shifts }, { data: conn }] = await Promise.all([
    db.from("staff_shifts").select("id, title, shift_date, start_time, finish_time, location, member:crew_members(name, email)").eq("organisation_id", orgId).in("id", shiftIds).gte("shift_date", today),
    db.from("calendar_connections").select("id").eq("organisation_id", orgId).eq("provider", "google").eq("sync_enabled", true).order("is_default", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!conn) return; // Google Calendar not connected
  type S = { id: string; title: string; shift_date: string; start_time: string | null; finish_time: string | null; location: string | null; member: { name: string; email: string | null } | null };
  const list = (shifts ?? []) as unknown as S[];
  if (!list.length) return;
  const { data: existing } = await db.from("calendar_events").select("id, staff_shift_id").eq("organisation_id", orgId).in("staff_shift_id", list.map((s) => s.id));
  const have = new Map(((existing ?? []) as { id: string; staff_shift_id: string }[]).map((r) => [r.staff_shift_id, r.id]));
  const touched: string[] = [];
  for (const s of list) {
    const start = s.start_time ? zonedTimeUTC(s.shift_date, s.start_time.slice(0, 5), tz) : zonedTimeUTC(s.shift_date, "00:00", tz);
    const endT = s.finish_time && (!s.start_time || s.finish_time > s.start_time) ? s.finish_time : null;
    const end = endT ? zonedTimeUTC(s.shift_date, endT.slice(0, 5), tz) : new Date(Date.parse(start) + 60 * 60000).toISOString();
    const row = { title: `${s.title}${s.member ? ` — ${s.member.name}` : ""}`.slice(0, 200), starts_at: start, ends_at: end, all_day: !s.start_time, location: s.location, sync_status: "pending" };
    if (have.has(s.id)) {
      await db.from("calendar_events").update(row).eq("id", have.get(s.id)!);
      touched.push(have.get(s.id)!);
    } else {
      const { data: ce } = await db.from("calendar_events").insert({ organisation_id: orgId, calendar_connection_id: conn.id, kind: "shift", staff_shift_id: s.id, ...row }).select("id").single();
      if (ce) touched.push(ce.id as string);
    }
  }
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { pushCalendarRowsNow } = await import("@/lib/integrations/google-calendar");
    const ctx = await buildContext(db, "service", orgId, "google_calendar", null);
    await pushCalendarRowsNow(ctx, touched);
  } catch { /* the next calendar sync sends them */ }
}

/** Take shifts off Google Calendar before they're deleted. */
export async function removeShiftCalendar(db: SupabaseClient, orgId: string, shiftIds: string[]) {
  if (!shiftIds.length) return;
  const { data } = await db.from("calendar_events").select("id, external_event_id, conn:calendar_connections(external_calendar_id)").eq("organisation_id", orgId).in("staff_shift_id", shiftIds);
  const rows = (data ?? []) as unknown as { id: string; external_event_id: string | null; conn: { external_calendar_id: string | null } | null }[];
  if (rows.some((r) => r.external_event_id)) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { deleteGoogleEvent } = await import("@/lib/integrations/google-calendar");
      const ctx = await buildContext(db, "service", orgId, "google_calendar", null);
      for (const r of rows) if (r.external_event_id && r.conn?.external_calendar_id) await deleteGoogleEvent(ctx, r.conn.external_calendar_id, r.external_event_id).catch(() => undefined);
    } catch { /* not connected */ }
  }
  if (rows.length) await db.from("calendar_events").delete().in("id", rows.map((r) => r.id));
}
