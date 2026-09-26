import "server-only";
import { localDate } from "@/lib/ai/classify";
import { appBaseUrl } from "@/lib/integrations/registry";
import { ApiError, apiJSON, errMessage, finishSyncLog, logIntegration, saveIntegrationSettings, startSyncLog, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Google Calendar API v3 (fetch only).
 *  calendarList.list  GET   https://www.googleapis.com/calendar/v3/users/me/calendarList   (minAccessRole)
 *                     https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list
 *  events.insert      POST  https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 *                     https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
 *  events.patch       PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
 *                     https://developers.google.com/workspace/calendar/api/v3/reference/events/patch
 *  events.list        GET   https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 *                     (privateExtendedProperty=name=value, timeMin, timeMax, singleEvents, orderBy, showDeleted, pageToken)
 *                     https://developers.google.com/workspace/calendar/api/v3/reference/events/list
 *
 * Duplicates are avoided two ways: the Google event id is stored in calendar_events.external_event_id, and every
 * event we create carries extendedProperties.private.eventureos_id so a lost id can be found again.
 */
const CAL = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendar { id: string; summary: string; primary?: boolean; accessRole?: string; backgroundColor?: string; timeZone?: string }
interface GEvent {
  id: string; status?: string; summary?: string; location?: string; transparency?: string; description?: string; htmlLink?: string;
  attendees?: { email?: string; self?: boolean; resource?: boolean }[]; organizer?: { email?: string; self?: boolean };
  start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export async function calendarListWithToken(accessToken: string): Promise<GoogleCalendar[]> {
  const res = await fetch(`${CAL}/users/me/calendarList?minAccessRole=writer&maxResults=250`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Google calendarList ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { items?: GoogleCalendar[] }).items ?? [];
}

export async function listCalendars(ctx: SyncContext): Promise<GoogleCalendar[]> {
  const out: GoogleCalendar[] = [];
  let page: string | undefined;
  do {
    const u = new URL(`${CAL}/users/me/calendarList`);
    u.searchParams.set("minAccessRole", "writer");
    u.searchParams.set("maxResults", "250");
    if (page) u.searchParams.set("pageToken", page);
    const r = await apiJSON<{ items?: GoogleCalendar[]; nextPageToken?: string }>(ctx, u.toString(), {}, "Google calendarList.list");
    out.push(...(r.items ?? []));
    page = r.nextPageToken;
  } while (page);
  return out.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary, accessRole: c.accessRole, backgroundColor: c.backgroundColor, timeZone: c.timeZone }));
}

async function findByEventureId(ctx: SyncContext, calendarId: string, eosId: string): Promise<GEvent | null> {
  const u = new URL(`${CAL}/calendars/${encodeURIComponent(calendarId)}/events`);
  u.searchParams.set("privateExtendedProperty", `eventureos_id=${eosId}`);
  u.searchParams.set("maxResults", "5");
  const r = await apiJSON<{ items?: GEvent[] }>(ctx, u.toString(), {}, "Google events.list");
  return r.items?.find((e) => e.status !== "cancelled") ?? null;
}

export interface CalendarSettings {
  sync_kinds?: string[];
  pull_busy?: boolean;
  calendars?: GoogleCalendar[];
  calendars_fetched_at?: string;
  /** Months of past entries imported once (default 24); afterwards only the last 30 days are re-read. */
  history_months?: number;
  history_done_for?: string[];            // calendar connection ids whose history is in
  pull_cursor?: { conn: string; page: string } | null;
}
const PULL_BUDGET_MS = 40_000;
export const DEFAULT_SYNC_KINDS = ["event", "site_visit", "setup", "hold"];

interface CalRow {
  id: string; calendar_connection_id: string; event_id: string | null; title: string; starts_at: string; ends_at: string;
  all_day: boolean; location: string | null; kind: string; external_event_id: string | null; sync_status: string;
  last_synced_at: string | null; updated_at: string;
}

function eventBody(ctx: SyncContext, ce: CalRow) {
  const tz = ctx.org.timezone;
  const start = ce.all_day ? { date: localDate(ce.starts_at, tz) } : { dateTime: ce.starts_at, timeZone: tz };
  const endDate = localDate(ce.ends_at, tz);
  const endExclusive = new Date(endDate + "T00:00:00Z");
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const end = ce.all_day ? { date: endExclusive.toISOString().slice(0, 10) } : { dateTime: ce.ends_at, timeZone: tz };
  const prefix = ce.kind === "hold" ? "HOLD: " : ce.kind === "site_visit" ? "Site visit: " : ce.kind === "setup" ? "Setup: " : "";
  return {
    summary: prefix + ce.title,
    location: ce.location ?? undefined,
    description: ce.event_id ? `Managed in EventureOS — ${appBaseUrl()}/events/${ce.event_id}` : "Managed in EventureOS",
    start, end,
    transparency: "opaque",
    extendedProperties: { private: { eventureos_id: ce.id, eventureos_org: ctx.org.id } },
  };
}

const needsPush = (ce: CalRow) =>
  ce.sync_status !== "synced" || !ce.last_synced_at || !ce.external_event_id ||
  Date.parse(ce.updated_at) - Date.parse(ce.last_synced_at) > 5000;

export async function syncGoogleCalendar(ctx: SyncContext) {
  const logId = await startSyncLog(ctx, "calendar", "outbound");
  const s = (ctx.integration.settings ?? {}) as CalendarSettings;
  const kinds = s.sync_kinds?.length ? s.sync_kinds : DEFAULT_SYNC_KINDS;
  let pushed = 0, failed = 0, pulled = 0;
  const errors: string[] = [];
  try {
    // keep the calendar picker fresh
    try {
      const cals = await listCalendars(ctx);
      await saveIntegrationSettings(ctx, { calendars: cals, calendars_fetched_at: new Date().toISOString() });
    } catch (e) { errors.push(`Couldn't refresh calendar list: ${errMessage(e)}`); }

    const { data: conns, error } = await ctx.db.from("calendar_connections").select("id, name, external_calendar_id")
      .eq("organisation_id", ctx.org.id).eq("provider", "google").eq("sync_enabled", true).not("external_calendar_id", "is", null);
    if (error) throw new Error(`Could not load calendars: ${error.message}`);
    if (!conns?.length) {
      const msg = "Connected, but no EventureOS calendar is mapped to a Google calendar yet — choose one in Google Calendar settings.";
      await finishSyncLog(ctx, logId, "success", 0, msg);
      return { pushed, failed, pulled, message: msg };
    }
    const byId = new Map(conns.map((c) => [c.id as string, c as { id: string; name: string; external_calendar_id: string }]));

    // PUSH: EventureOS → Google
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: rows, error: rErr } = await ctx.db.from("calendar_events")
      .select("id, calendar_connection_id, event_id, title, starts_at, ends_at, all_day, location, kind, external_event_id, sync_status, last_synced_at, updated_at")
      .eq("organisation_id", ctx.org.id).in("calendar_connection_id", [...byId.keys()]).in("kind", kinds).gte("ends_at", since)
      .order("starts_at").limit(1000);
    if (rErr) throw new Error(`Could not load calendar entries: ${rErr.message}`);
    for (const ce of ((rows ?? []) as CalRow[]).filter(needsPush)) {
      const calId = byId.get(ce.calendar_connection_id)!.external_calendar_id;
      try {
        const body = eventBody(ctx, ce);
        let g: GEvent | null = null;
        if (ce.external_event_id) {
          try {
            g = await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ce.external_event_id)}`,
              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.patch");
            if (g.status === "cancelled") g = null; // deleted in Google → recreate
          } catch (e) { if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) throw e; }
        }
        if (!g) {
          const found = await findByEventureId(ctx, calId, ce.id);
          g = found
            ? await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(found.id)}`,
                { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.patch")
            : await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events`,
                { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.insert");
        }
        const { error: uErr } = await ctx.db.from("calendar_events").update({ external_event_id: g.id, sync_status: "synced", last_synced_at: new Date().toISOString() }).eq("id", ce.id);
        if (uErr) throw new Error(uErr.message);
        pushed++;
      } catch (e) {
        failed++;
        errors.push(`${ce.title}: ${errMessage(e)}`);
        await ctx.db.from("calendar_events").update({ sync_status: "error" }).eq("id", ce.id);
      }
    }

    // PULL (optional): entries from Google — busy time for conflict checks, and the client booking history
    let pullMore = false;
    if (s.pull_busy) {
      const started = Date.now();
      const now = Date.now();
      const done = new Set(s.history_done_for ?? []);
      const max = new Date(now + 365 * 86400000).toISOString();
      const own = new Set([ctx.integration.account_label?.toLowerCase()].filter(Boolean) as string[]);
      conns: for (const conn of byId.values()) {
        const backfill = !done.has(conn.id);
        const min = new Date(now - (backfill ? (s.history_months ?? 24) * 30.5 : 30) * 86400000).toISOString();
        let page: string | undefined = s.pull_cursor?.conn === conn.id ? s.pull_cursor.page : undefined;
        do {
          if (Date.now() - started > PULL_BUDGET_MS) {
            await saveIntegrationSettings(ctx, { pull_cursor: page ? { conn: conn.id, page } : null });
            pullMore = true;
            break conns;
          }
          const u = new URL(`${CAL}/calendars/${encodeURIComponent(conn.external_calendar_id)}/events`);
          u.searchParams.set("timeMin", min);
          u.searchParams.set("timeMax", max);
          u.searchParams.set("singleEvents", "true");
          u.searchParams.set("showDeleted", "true");
          u.searchParams.set("maxResults", "2500");
          if (page) u.searchParams.set("pageToken", page);
          const r = await apiJSON<{ items?: GEvent[]; nextPageToken?: string }>(ctx, u.toString(), {}, "Google events.list");
          const gone: string[] = [];
          const rows = [];
          for (const ge of r.items ?? []) {
            if (ge.extendedProperties?.private?.eventureos_id) continue; // ours
            if (ge.status === "cancelled" || ge.transparency === "transparent") { gone.push(ge.id); continue; }
            const startIso = ge.start?.dateTime ?? (ge.start?.date ? ge.start.date + "T00:00:00Z" : null);
            const endIso = ge.end?.dateTime ?? (ge.end?.date ? ge.end.date + "T00:00:00Z" : null);
            if (!startIso || !endIso) continue;
            const allDay = !ge.start?.dateTime;
            const endMs = allDay ? Date.parse(endIso) - 1000 : Date.parse(endIso);
            rows.push({
              organisation_id: ctx.org.id, calendar_connection_id: conn.id, title: ge.summary?.slice(0, 200) || "Busy (Google)",
              starts_at: new Date(startIso).toISOString(),
              ends_at: new Date(Math.max(endMs, Date.parse(startIso))).toISOString(),
              all_day: allDay, location: ge.location?.slice(0, 500) ?? null, kind: "other", external_event_id: ge.id,
              description: ge.description?.slice(0, 8000) ?? null, html_link: ge.htmlLink ?? null,
              attendees: (ge.attendees ?? []).filter((a) => a.email && !a.self && !a.resource && !own.has(a.email.toLowerCase())).map((a) => a.email!.toLowerCase()),
              sync_status: "synced", last_synced_at: new Date(Date.now() + 10_000).toISOString(),
            });
          }
          for (let i = 0; i < gone.length; i += 200) {
            await ctx.db.from("calendar_events").delete().eq("calendar_connection_id", conn.id).in("external_event_id", gone.slice(i, i + 200)).is("event_id", null);
          }
          for (let i = 0; i < rows.length; i += 500) {
            const { error: pErr } = await ctx.db.from("calendar_events").upsert(rows.slice(i, i + 500), { onConflict: "calendar_connection_id,external_event_id" });
            if (pErr) { errors.push(`Calendar import: ${pErr.message}`); break; } else pulled += Math.min(500, rows.length - i);
          }
          page = r.nextPageToken;
        } while (page);
        if (backfill) { done.add(conn.id); await saveIntegrationSettings(ctx, { history_done_for: [...done], pull_cursor: null }); }
        else if (s.pull_cursor) await saveIntegrationSettings(ctx, { pull_cursor: null });
      }
      if (pulled) {
        const { error: lErr } = await ctx.db.rpc("link_customer_emails", { p_org: ctx.org.id });
        if (lErr) errors.push(`Linking clients: ${lErr.message}`);
      }
    }

    const msg = `Pushed ${pushed} calendar entr${pushed === 1 ? "y" : "ies"} to Google` + (s.pull_busy ? `, imported ${pulled} entr${pulled === 1 ? "y" : "ies"} from Google` : "") +
      (pullMore ? ". More will be fetched on the next sync" : "") +
      (failed ? `. ${failed} failed: ${errors.slice(0, 3).join("; ")}` : errors.length ? `. ${errors[0]}` : ".");
    await finishSyncLog(ctx, logId, failed ? "partial" : "success", pushed + pulled, msg);
    if (pushed || pulled) await logIntegration(ctx, { action: "calendar.synced", entityType: "integration", entityId: ctx.integration.id, summary: msg });
    return { pushed, failed, pulled, message: msg };
  } catch (e) {
    await finishSyncLog(ctx, logId, "error", pushed, `Google Calendar sync failed: ${errMessage(e)}`);
    throw e;
  }
}
