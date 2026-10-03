import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildContext } from "@/lib/integrations/sync-runner";
import { errMessage } from "@/lib/integrations/runtime";
import { deleteGoogleEvent, pushCalendarEntry } from "@/lib/integrations/google-calendar";

/**
 * Follow-up reminders: an open task with a due time can have a calendar entry (kind "task") on the default
 * calendar. It's pushed to Google straight away (as Free, with a pop-up when due) and removed when the task
 * is done or deleted. If Google can't be reached, the entry waits for the next calendar sync.
 */
export const REMINDER_MINUTES = 15;

export interface ReminderResult { calendar: boolean; message?: string }

const missingSchema = (m: string) => /task_id|calendar_events_kind_check|column .* does not exist/i.test(m);

export async function syncTaskReminder(db: SupabaseClient, orgId: string, actorId: string, taskId: string, opts: { remind?: boolean } = {}): Promise<ReminderResult> {
  const [{ data: task }, { data: rows, error: rErr }] = await Promise.all([
    db.from("tasks").select("id, title, description, status, due_at").eq("organisation_id", orgId).eq("id", taskId).maybeSingle(),
    db.from("calendar_events").select("id, external_event_id, conn:calendar_connections(external_calendar_id)").eq("organisation_id", orgId).eq("task_id", taskId),
  ]);
  if (rErr) return { calendar: false, message: missingSchema(rErr.message) ? "Calendar reminders need a quick database update first." : rErr.message };
  const existing = (rows ?? []) as unknown as { id: string; external_event_id: string | null; conn: { external_calendar_id: string | null } | null }[];
  const want = !!task && task.status !== "done" && !!task.due_at && (opts.remind ?? existing.length > 0);

  // Google needs a connected calendar; without one the entry still shows on the EventureOS calendar
  const google = async () => { try { return await buildContext(db, "user", orgId, "google_calendar", actorId); } catch { return null; } };

  if (!want) {
    if (!existing.length) return { calendar: false };
    const ctx = await google();
    for (const r of existing) {
      if (ctx && r.external_event_id && r.conn?.external_calendar_id) {
        try { await deleteGoogleEvent(ctx, r.conn.external_calendar_id, r.external_event_id); }
        catch (e) { return { calendar: true, message: `Couldn't remove the reminder from Google Calendar: ${errMessage(e)}` }; }
      }
      await db.from("calendar_events").delete().eq("id", r.id).eq("organisation_id", orgId);
    }
    return { calendar: false };
  }

  const starts = new Date(task!.due_at!);
  const fields = { title: task!.title, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + REMINDER_MINUTES * 60_000).toISOString(), all_day: false };
  let id = existing[0]?.id;
  if (id) {
    const { error } = await db.from("calendar_events").update({ ...fields, sync_status: "pending" }).eq("id", id);
    if (error) return { calendar: false, message: error.message };
  } else {
    const { data: conn } = await db.from("calendar_connections").select("id, provider, sync_enabled")
      .eq("organisation_id", orgId).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle();
    if (!conn) return { calendar: false, message: "No calendar is set up yet (Settings → Integrations → Google Calendar)." };
    const { data, error } = await db.from("calendar_events").insert({
      organisation_id: orgId, calendar_connection_id: conn.id, task_id: taskId, kind: "task", ...fields,
      sync_status: conn.provider === "google" && conn.sync_enabled ? "pending" : "local", created_by: actorId,
    }).select("id").single();
    if (error) return { calendar: false, message: missingSchema(error.message) ? "Calendar reminders need a quick database update first." : error.message };
    id = data.id as string;
  }
  const ctx = await google();
  if (!ctx) return { calendar: true, message: "Added to the EventureOS calendar (Google Calendar isn't connected)." };
  try { await pushCalendarEntry(ctx, id!, task!.description); return { calendar: true }; }
  catch (e) { return { calendar: true, message: `Saved — it'll reach Google Calendar on the next sync (${errMessage(e)}).` }; }
}
