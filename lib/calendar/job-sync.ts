import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeUTC } from "@/lib/format";
import { localDate } from "@/lib/ai/classify";
import { jobDays, type EventDay } from "@/lib/events/days";
import { shiftDays, type ShiftDay, type StaffDetails } from "@/lib/quotes/line-helpers";

/**
 * Put a job on the calendar the way it really runs — one entry per day, each with that day's hours — and send it to
 * Google Calendar straight away (not on the next half-hourly sync).
 *
 *  create: false  only keeps entries that already exist in step (quote accepted, job edited, staff rostered)
 *  create: true   also adds the job if it isn't on the calendar yet ("Add to calendar" on the job)
 */
export type JobCalendarResult = { entries: number; added: number; removed: number; pushed: number; failed: number; errors: string[]; google: boolean };

/** The quote's barista hours for a job: the accepted quote, else the newest one still in play. */
export async function quoteStaffDays(db: SupabaseClient, orgId: string, eventId: string): Promise<ShiftDay[]> {
  const { data } = await db.from("quotes").select("status, created_at, quote_items(details, is_optional)")
    .eq("organisation_id", orgId).eq("event_id", eventId).not("status", "in", "(superseded,declined)");
  type Q = { status: string; created_at: string; quote_items: { details: { kind?: string } | null; is_optional: boolean }[] };
  const qs = ((data ?? []) as Q[]).sort((a, b) => (a.status === "accepted" ? -1 : b.status === "accepted" ? 1 : b.created_at.localeCompare(a.created_at)));
  const d = (qs[0]?.quote_items ?? []).filter((i) => !i.is_optional).map((i) => i.details).find((x) => x?.kind === "staff");
  return d ? shiftDays(d as unknown as StaffDetails) : [];
}

/** Load a job (tolerating a database without the 0058 update) and work out its days. */
export async function loadJobDays(db: SupabaseClient, orgId: string, eventId: string) {
  const cols = "id, number, name, venue, customer_id, event_date, setup_time, start_time, finish_time";
  let { data: ev, error } = await db.from("events").select(`${cols}, days`).eq("organisation_id", orgId).eq("id", eventId).maybeSingle();
  if (error && /days/.test(error.message)) ({ data: ev, error } = await db.from("events").select(cols).eq("organisation_id", orgId).eq("id", eventId).maybeSingle());
  if (error) throw new Error(error.message);
  if (!ev) return null;
  const e = ev as { id: string; number: number; name: string; venue: string | null; customer_id: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; days?: unknown };
  return { ev: e, days: jobDays(e, await quoteStaffDays(db, orgId, eventId)) };
}

/** Start and end of a day's calendar entry (arrives at setup; 3 hours if no finish time). */
export function dayWindow(d: EventDay, tz: string) {
  const startT = d.setup ?? d.start ?? "09:00";
  const startsAt = zonedTimeUTC(d.date, startT, tz);
  let endsAt = d.finish ? zonedTimeUTC(d.date, d.finish, tz) : new Date(Date.parse(startsAt) + 3 * 3600e3).toISOString();
  if (Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = new Date(Date.parse(startsAt) + 3600e3).toISOString();
  return { startsAt, endsAt };
}

export async function syncJobCalendar(db: SupabaseClient, orgId: string, eventId: string,
  opts: { create?: boolean; mode?: "user" | "service"; actorId?: string | null } = {}): Promise<JobCalendarResult> {
  const out: JobCalendarResult = { entries: 0, added: 0, removed: 0, pushed: 0, failed: 0, errors: [], google: false };
  const job = await loadJobDays(db, orgId, eventId);
  if (!job) return out;
  const { data: org } = await db.from("organisations").select("timezone").eq("id", orgId).single();
  const tz = (org?.timezone as string) || "Australia/Sydney";

  const { data: rows } = await db.from("calendar_events")
    .select("id, calendar_connection_id, starts_at, ends_at, title, location, sync_status, external_event_id, conn:calendar_connections(provider, sync_enabled, external_calendar_id)")
    .eq("organisation_id", orgId).eq("event_id", eventId).eq("kind", "event").order("starts_at");
  type Row = { id: string; calendar_connection_id: string; starts_at: string; ends_at: string; title: string; location: string | null; sync_status: string; external_event_id: string | null;
    conn: { provider: string; sync_enabled: boolean; external_calendar_id: string | null } | null };
  const existing = (rows ?? []) as unknown as Row[];
  if (!existing.length && !opts.create) return out;
  if (!job.days.length) { out.entries = existing.length; return out; }

  // Which calendar: where the job already is, else the default one
  let connId = existing[0]?.calendar_connection_id ?? null;
  let conn = existing[0]?.conn ?? null;
  if (!connId) {
    const { data: c } = await db.from("calendar_connections").select("id, provider, sync_enabled, external_calendar_id")
      .eq("organisation_id", orgId).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle();
    if (!c) throw new Error("No calendar is set up yet — add one in Settings → Integrations → Google Calendar.");
    connId = c.id as string;
    conn = c as Row["conn"];
  }
  const status = conn?.provider === "google" && conn.sync_enabled ? "pending" : "local";

  // Match entries to days by their local date; extra entries on the same day are spares
  const byDate = new Map<string, Row>();
  const spare: Row[] = [];
  for (const r of existing) {
    const d = localDate(r.starts_at, tz);
    if (byDate.has(d) || !job.days.some((x) => x.date === d)) spare.push(r); else byDate.set(d, r);
  }
  const ids: string[] = [];
  for (const day of job.days) {
    const { startsAt, endsAt } = dayWindow(day, tz);
    const have = byDate.get(day.date) ?? spare.shift();
    if (have) {
      const same = Date.parse(have.starts_at) === Date.parse(startsAt) && Date.parse(have.ends_at) === Date.parse(endsAt) && have.title === job.ev.name && (have.location ?? null) === (job.ev.venue ?? null);
      if (!same || have.sync_status !== "synced") {
        const { error } = await db.from("calendar_events").update({ starts_at: startsAt, ends_at: endsAt, title: job.ev.name, location: job.ev.venue, ...(have.sync_status === "local" ? {} : { sync_status: status }) }).eq("id", have.id);
        if (error) throw new Error(`Couldn't update the calendar: ${error.message}`);
      }
      ids.push(have.id);
    } else {
      const { data: row, error } = await db.from("calendar_events").insert({
        organisation_id: orgId, calendar_connection_id: connId, event_id: eventId, title: job.ev.name, starts_at: startsAt, ends_at: endsAt,
        all_day: false, location: job.ev.venue, kind: "event", sync_status: status, created_by: opts.actorId ?? null,
      }).select("id").single();
      if (error) throw new Error(`Couldn't add it to the calendar: ${error.message}`);
      ids.push(row.id as string);
      out.added++;
    }
  }

  // Days that were taken off the job: remove their entries (from Google too)
  let ctx: Awaited<ReturnType<typeof import("@/lib/integrations/sync-runner").buildContext>> | null = null;
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    ctx = await buildContext(db, opts.mode ?? "service", orgId, "google_calendar", opts.actorId ?? null);
    out.google = true;
  } catch { ctx = null; }
  for (const r of spare) {
    if (r.external_event_id && r.conn?.external_calendar_id) {
      if (!ctx) continue; // can't remove it from Google right now — leave it for next time
      try {
        const { deleteGoogleEvent } = await import("@/lib/integrations/google-calendar");
        await deleteGoogleEvent(ctx, r.conn.external_calendar_id, r.external_event_id);
      } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); continue; }
    }
    await db.from("calendar_events").delete().eq("id", r.id).eq("organisation_id", orgId);
    out.removed++;
  }

  out.entries = ids.length;
  if (ctx && status === "pending") {
    try {
      const { pushCalendarRowsNow } = await import("@/lib/integrations/google-calendar");
      const r = await pushCalendarRowsNow(ctx, ids);
      out.pushed = r.pushed; out.failed = r.failed; out.errors.push(...r.errors);
    } catch (e) { out.failed = ids.length; out.errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return out;
}

/** After a quote is accepted / a booking approved: get the job's calendar to Google now. Never throws. */
export async function jobCalendarAfterAccept(db: SupabaseClient, eventId: string) {
  try {
    const { data } = await db.from("events").select("organisation_id").eq("id", eventId).maybeSingle();
    if (data?.organisation_id) await syncJobCalendar(db, data.organisation_id as string, eventId, { create: false, mode: "service" });
  } catch { /* the half-hourly sync will send it */ }
}
