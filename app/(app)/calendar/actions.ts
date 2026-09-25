"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, fmtDate, zonedMidnightUTC, zonedTimeUTC } from "@/lib/format";
import { KIND_LABEL, type EntryKind } from "@/components/calendar/model";

export type CalFormState = { error?: string; ok?: string } | undefined;

const KINDS: EntryKind[] = ["event", "site_visit", "setup", "hold", "other"];
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

type Conn = { id: string; name: string; provider: string; sync_enabled: boolean };

/** New entries on a Google resource with sync switched on wait for the sync worker; everything else is local only. */
const syncStatusFor = (c: Conn) => (c.provider === "google" && c.sync_enabled ? "pending" : "local");

function revalidate(eventId?: string | null) {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/events/${eventId}`);
}

async function loadConnection(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, id: string | null) {
  if (!id || !UUID.test(id)) return null;
  const { data } = await supabase.from("calendar_connections").select("id, name, provider, sync_enabled")
    .eq("id", id).eq("organisation_id", orgId).maybeSingle();
  return (data as Conn | null) ?? null;
}

export async function createCalendarEntry(_prev: CalFormState, form: FormData): Promise<CalFormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const tz = org.timezone;
  const kind = str(form.get("kind")) as EntryKind | null;
  const eventId = str(form.get("event_id"));
  const date = str(form.get("date"));
  const endDate = str(form.get("end_date")) ?? date;
  const allDay = form.get("all_day") === "on";
  const startTime = str(form.get("start_time"));
  const endTime = str(form.get("end_time"));
  let title = str(form.get("title"));
  const location = str(form.get("location"));

  if (!kind || !KINDS.includes(kind)) return { error: "Choose what kind of entry this is." };
  const conn = await loadConnection(supabase, org.id, str(form.get("calendar_connection_id")));
  if (!conn) return { error: "Choose a calendar resource." };
  if (!date || !DATE.test(date)) return { error: "Choose a date." };
  if (!endDate || !DATE.test(endDate) || endDate < date) return { error: "The end date can’t be before the start date." };

  let startsAt: string, endsAt: string;
  if (allDay) {
    startsAt = zonedMidnightUTC(date, tz);
    endsAt = zonedMidnightUTC(addDaysISO(endDate, 1), tz);
  } else {
    if (!startTime || !TIME.test(startTime)) return { error: "Choose a start time (or tick All day)." };
    if (!endTime || !TIME.test(endTime)) return { error: "Choose an end time (or tick All day)." };
    startsAt = zonedTimeUTC(date, startTime, tz);
    endsAt = zonedTimeUTC(endDate, endTime, tz);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) return { error: "The end time must be after the start time." };
  }
  if (Date.parse(endsAt) - Date.parse(startsAt) > 31 * 86400e3) return { error: "Entries can’t be longer than 31 days." };

  let ev: { id: string; number: number; name: string; customer_id: string; venue: string | null } | null = null;
  if (eventId) {
    if (!UUID.test(eventId)) return { error: "That event couldn’t be found." };
    const { data } = await supabase.from("events").select("id, number, name, customer_id, venue")
      .eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
    if (!data) return { error: "That event couldn’t be found." };
    ev = data;
  }
  if (kind === "event" && !ev) return { error: "Choose the event this booking is for, or pick Hold / Site visit / Setup." };
  if (!title) title = ev ? (kind === "event" ? ev.name : `${KIND_LABEL[kind]} · ${ev.name}`) : null;
  if (!title) return { error: "Give the entry a title." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };

  // Avoid duplicates: one booking entry per event per resource.
  if (ev && kind === "event") {
    const { data: dup } = await supabase.from("calendar_events").select("id")
      .eq("organisation_id", org.id).eq("event_id", ev.id).eq("kind", "event").eq("calendar_connection_id", conn.id).limit(1);
    if (dup?.length) return { error: `EV-${ev.number} is already on ${conn.name}. Move the existing entry instead of adding another.` };
  }

  const { data: row, error } = await supabase.from("calendar_events").insert({
    organisation_id: org.id,
    calendar_connection_id: conn.id,
    event_id: ev?.id ?? null,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    location: location ?? (kind === "event" ? ev?.venue ?? null : null),
    kind,
    sync_status: syncStatusFor(conn),
    created_by: user.id,
  }).select("id").single();
  if (error) return { error: `Couldn’t add the calendar entry: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.created", entityType: "calendar_event", entityId: row.id,
    eventId: ev?.id ?? null, customerId: ev?.customer_id ?? null,
    summary: `${actorName(profile)} added ${KIND_LABEL[kind].toLowerCase()} “${title}” to ${conn.name} on ${fmtDate(date)}`,
    metadata: { calendar_connection_id: conn.id, kind, starts_at: startsAt, ends_at: endsAt },
  });
  revalidate(ev?.id);
  return { ok: `Added to ${conn.name}` };
}

export async function moveCalendarEntry(id: string, connectionId: string): Promise<CalFormState> {
  const { supabase, org, user, profile, role } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can choose which calendar an entry syncs to." };
  if (!UUID.test(id)) return { error: "Calendar entry not found." };
  const { data: entry } = await supabase.from("calendar_events")
    .select("id, title, event_id, kind, calendar_connection_id, external_event_id, calendar:calendar_connections(name), event:events(customer_id)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!entry) return { error: "Calendar entry not found." };
  const conn = await loadConnection(supabase, org.id, connectionId);
  if (!conn) return { error: "Choose a calendar resource." };
  if (conn.id === entry.calendar_connection_id) return { ok: "Already on that calendar" };
  const e = entry as unknown as { id: string; title: string; event_id: string | null; kind: string; external_event_id: string | null; calendar: { name: string } | null; event: { customer_id: string } | null };

  if (e.event_id && e.kind === "event") {
    const { data: dup } = await supabase.from("calendar_events").select("id")
      .eq("organisation_id", org.id).eq("event_id", e.event_id).eq("kind", "event").eq("calendar_connection_id", conn.id).neq("id", e.id).limit(1);
    if (dup?.length) return { error: `This event is already on ${conn.name}. Delete one of the entries instead.` };
  }

  // The external id belonged to the old calendar; the new calendar gets its own on next sync.
  const { error } = await supabase.from("calendar_events").update({
    calendar_connection_id: conn.id,
    external_event_id: null,
    sync_status: syncStatusFor(conn),
    last_synced_at: null,
  }).eq("id", e.id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn’t move the entry: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.moved", entityType: "calendar_event", entityId: e.id,
    eventId: e.event_id, customerId: e.event?.customer_id ?? null,
    summary: `${actorName(profile)} moved “${e.title}” to ${conn.name}`,
    changes: { calendar: [e.calendar?.name ?? "—", conn.name] },
    metadata: e.external_event_id ? { previous_external_event_id: e.external_event_id } : null,
  });
  revalidate(e.event_id);
  return { ok: `Moved to ${conn.name}` };
}

export async function deleteCalendarEntry(id: string): Promise<CalFormState> {
  const { supabase, org, user, profile, role } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can delete calendar entries." };
  if (!UUID.test(id)) return { error: "Calendar entry not found." };
  const { data } = await supabase.from("calendar_events")
    .select("id, title, event_id, starts_at, external_event_id, calendar:calendar_connections(name), event:events(customer_id)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!data) return { error: "Calendar entry not found." };
  const e = data as unknown as { id: string; title: string; event_id: string | null; starts_at: string; external_event_id: string | null; calendar: { name: string } | null; event: { customer_id: string } | null };

  const { error, count } = await supabase.from("calendar_events").delete({ count: "exact" }).eq("id", e.id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn’t delete the entry: ${error.message}` };
  if (!count) return { error: "The entry wasn’t deleted — you may not have permission." };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.deleted", entityType: "calendar_event", entityId: e.id,
    eventId: e.event_id, customerId: e.event?.customer_id ?? null,
    summary: `${actorName(profile)} removed “${e.title}” from ${e.calendar?.name ?? "the calendar"}`,
    metadata: { starts_at: e.starts_at, external_event_id: e.external_event_id },
  });
  revalidate(e.event_id);
  return { ok: "Deleted" };
}
