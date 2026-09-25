import { requireOrg, canManage } from "@/lib/context";
import { addDaysISO, fmtDate, fmtDateTime, todayISO, zonedMidnightUTC } from "@/lib/format";
import { CalendarShell, type EventOption } from "@/components/calendar/calendar-shell";
import {
  daysIn, findConflicts, isISODate, localParts, segmentsFor, viewRange,
  type CalView, type Entry, type EntryKind, type Resource, type SyncStatus,
} from "@/components/calendar/model";

export const metadata = { title: "Calendar" };

type SP = { view?: string; date?: string; hide?: string; add?: string };

type CalRow = {
  id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; kind: EntryKind; location: string | null;
  calendar_connection_id: string; event_id: string | null; sync_status: SyncStatus; external_event_id: string | null; last_synced_at: string | null;
  event: { number: number; name: string; customer: { name: string } | null } | null;
};
type EventRow = {
  id: string; number: number; name: string; event_date: string; start_time: string | null; finish_time: string | null;
  venue: string | null; status: string; customer: { name: string } | null; calendar_events: { id: string; kind: string }[];
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);
  const view: CalView = (["month", "week", "day", "agenda"] as const).includes(sp.view as CalView) ? (sp.view as CalView) : "month";
  const date = isISODate(sp.date) ? sp.date : today;
  const range = viewRange(view, date);
  const days = daysIn(range.start, range.end);
  const rangeStartUTC = zonedMidnightUTC(range.start, tz);
  const rangeEndUTC = zonedMidnightUTC(range.end, tz);

  const [connRes, calRes, intRes, evRes] = await Promise.all([
    supabase.from("calendar_connections")
      .select("id, name, colour, provider, sync_enabled, external_calendar_id, is_default, created_at")
      .eq("organisation_id", org.id).order("is_default", { ascending: false }).order("created_at"),
    supabase.from("calendar_events")
      .select("id, title, starts_at, ends_at, all_day, kind, location, calendar_connection_id, event_id, sync_status, external_event_id, last_synced_at, event:events(number, name, customer:customers(name))")
      .eq("organisation_id", org.id).lt("starts_at", rangeEndUTC).gt("ends_at", rangeStartUTC)
      .order("starts_at").limit(2000),
    supabase.from("integrations").select("status, account_label, last_sync_at, last_error")
      .eq("organisation_id", org.id).eq("provider", "google_calendar").maybeSingle(),
    supabase.from("events")
      .select("id, number, name, event_date, start_time, finish_time, venue, status, customer:customers(name), calendar_events(id, kind)")
      .eq("organisation_id", org.id).gte("event_date", addDaysISO(today, -7)).not("status", "in", "(cancelled,completed)")
      .order("event_date").order("start_time").limit(300),
  ]);
  for (const r of [connRes, calRes, evRes]) if (r.error) throw new Error(`Could not load the calendar: ${r.error.message}`);
  if (intRes.error) throw new Error(`Could not load Google Calendar status: ${intRes.error.message}`);

  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean));
  const resources: Resource[] = (connRes.data ?? []).map((c) => ({
    id: c.id, name: c.name, colour: c.colour, provider: c.provider as Resource["provider"], syncEnabled: c.sync_enabled,
    externalCalendarId: c.external_calendar_id, isDefault: c.is_default, hidden: hidden.has(c.id),
  }));

  const rows = (calRes.data ?? []) as unknown as CalRow[];
  const conflicts = findConflicts(rows.map((r) => ({ id: r.id, resourceId: r.calendar_connection_id, startsAt: r.starts_at, endsAt: r.ends_at })));

  const entries: Entry[] = rows.map((r) => {
    const long = Date.parse(r.ends_at) - Date.parse(r.starts_at) >= 86400e3;
    const s = localParts(r.starts_at, tz);
    const segs = segmentsFor(r.starts_at, r.ends_at, days, tz);
    const spanDays = r.all_day ? Math.max(1, Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 86400e3)) : 0;
    return {
      id: r.id, title: r.title, kind: r.kind, startsAt: r.starts_at, endsAt: r.ends_at, allDay: r.all_day,
      lane: r.all_day || long ? "allday" : "timed", location: r.location,
      resourceId: r.calendar_connection_id, eventId: r.event_id, eventName: r.event?.name ?? null, eventNumber: r.event?.number ?? null,
      customerName: r.event?.customer?.name ?? null, syncStatus: r.sync_status, externalEventId: r.external_event_id, lastSyncedAt: r.last_synced_at ? fmtDateTime(r.last_synced_at, tz) : null,
      timeLabel: r.all_day
        ? spanDays > 1 ? `All day · ${spanDays} days` : "All day"
        : long
          ? `${fmtDateTime(r.starts_at, tz)} – ${fmtDateTime(r.ends_at, tz)}`
          : `${fmtDateTime(r.starts_at, tz, "time")} – ${fmtDateTime(r.ends_at, tz, "time")}`,
      dateLabel: fmtDate(s.date, "weekday"),
      conflictsWith: conflicts[r.id] ?? [],
      segments: segs,
    };
  });

  const events = (evRes.data ?? []) as unknown as EventRow[];
  const eventOptions: EventOption[] = events.map((e) => ({
    id: e.id, number: e.number, name: e.name, date: e.event_date, dateLabel: fmtDate(e.event_date, "weekday"),
    start: e.start_time?.slice(0, 5) ?? null, finish: e.finish_time?.slice(0, 5) ?? null, venue: e.venue,
    customerName: e.customer?.name ?? null, status: e.status,
    onCalendar: e.calendar_events.some((c) => c.kind === "event"),
  }));

  const g = intRes.data;
  const google = {
    connected: g?.status === "connected" || g?.status === "syncing",
    status: g?.status ?? "not_connected",
    account: g?.account_label ?? null,
    lastSync: g?.last_sync_at ? fmtDateTime(g.last_sync_at, tz) : null,
    error: g?.status === "error" ? g.last_error ?? "Sync error" : null,
  };

  const nowParts = localParts(new Date().toISOString(), tz);

  return (
    <CalendarShell
      key={`${view}-${date}`}
      view={view}
      date={date}
      today={today}
      nowMin={nowParts.minutes}
      days={days}
      resources={resources}
      entries={entries}
      eventOptions={eventOptions}
      google={google}
      canManage={canManage(role)}
      initialAddEventId={sp.add && /^[0-9a-f-]{36}$/i.test(sp.add) ? sp.add : null}
    />
  );
}
