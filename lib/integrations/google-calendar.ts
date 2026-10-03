import "server-only";
import { isFreeDay, jobDescription, jobTitle } from "@/lib/calendar/job-invite";
import { shiftDays, type StaffDetails } from "@/lib/quotes/line-helpers";
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
  /** Add the client's people on the job as guests (default on). Rostered staff are always added. */
  invite_clients?: boolean;
  /** Days (0 = Sunday … 6 = Saturday) on which bookings show as Free, not Busy. Default: Saturday. */
  free_weekdays?: number[];
}
const PULL_BUDGET_MS = 40_000;
export const DEFAULT_SYNC_KINDS = ["event", "site_visit", "setup", "hold"];

interface CalRow {
  id: string; calendar_connection_id: string; event_id: string | null; title: string; starts_at: string; ends_at: string;
  all_day: boolean; location: string | null; kind: string; external_event_id: string | null; sync_status: string;
  last_synced_at: string | null; updated_at: string; attendees: string[] | null;
  /** Task reminders only: notes shown in the Google event */
  description?: string | null;
}

export const DEFAULT_FREE_WEEKDAYS = [6];

/** The job details shown on a booking's calendar entry, by event id. */
interface JobInfo { title: string; description: string; date: string | null; startLocal: string | null; endLocal: string | null }

async function jobInfo(ctx: SyncContext, eventIds: string[]): Promise<Map<string, JobInfo>> {
  const out = new Map<string, JobInfo>();
  const ids = [...new Set(eventIds)];
  if (!ids.length) return out;
  const [{ data: evs }, { data: quotes }, { data: pkgs }, { data: crew }, { data: staff }] = await Promise.all([
    ctx.db.from("events").select("id, name, event_date, setup_time, start_time, finish_time, serves, venue, address, customer:customers(name, company, kind)")
      .eq("organisation_id", ctx.org.id).in("id", ids),
    ctx.db.from("quotes").select("id, event_id, status, created_at, quote_items(service_id, quantity, is_optional, details)")
      .eq("organisation_id", ctx.org.id).in("event_id", ids).not("status", "in", "(superseded,declined)"),
    ctx.db.from("service_packages").select("name, rules").eq("organisation_id", ctx.org.id).eq("active", true).order("position"),
    ctx.db.from("event_crew").select("event_id").eq("organisation_id", ctx.org.id).in("event_id", ids),
    ctx.db.from("event_staff").select("event_id").eq("organisation_id", ctx.org.id).in("event_id", ids),
  ]);
  const packages = (pkgs ?? []) as { name: string; rules: { hire?: { service_id: string } | null; per_serve?: { service_id: string } | null; staff?: { label?: string } | null; calendar_label?: string; serves_label?: string } }[];
  const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const people = new Map<string, number>();
  for (const r of [...(crew ?? []), ...(staff ?? [])] as { event_id: string }[]) people.set(r.event_id, (people.get(r.event_id) ?? 0) + 1);
  type Q = { event_id: string; status: string; created_at: string; quote_items: { service_id: string | null; quantity: number; is_optional: boolean; details: { kind?: string; start?: string | null; end?: string | null; setup_minutes?: number; hot?: number; cold?: number } | null }[] };
  for (const e of (evs ?? []) as unknown as { id: string; name: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; serves: number | null; venue: string | null; address: string | null; customer: { name: string; company: string | null; kind: string | null } | null }[]) {
    // The accepted quote, otherwise the newest one still in play
    const qs = ((quotes ?? []) as Q[]).filter((q) => q.event_id === e.id).sort((a, b) => (a.status === "accepted" ? -1 : b.status === "accepted" ? 1 : b.created_at.localeCompare(a.created_at)));
    const items = (qs[0]?.quote_items ?? []).filter((i) => !i.is_optional && i.service_id);
    const pkg = packages.find((p) => p.rules?.hire && items.some((i) => i.service_id === p.rules.hire!.service_id));
    const servesFromQuote = pkg?.rules.per_serve ? items.filter((i) => i.service_id === pkg.rules.per_serve!.service_id).reduce((a, i) => a + Number(i.quantity), 0) : 0;
    // Times and drinks worked out on the quote fill any gaps in the event's own details
    // The shift for the event's date (or the first one) on the quote's staff line
    const staffRaw = items.map((i) => i.details).find((d) => d?.kind === "staff");
    const shifts = staffRaw ? shiftDays(staffRaw as unknown as StaffDetails) : [];
    const shift = shifts.find((x) => x.date && x.date === e.event_date) ?? shifts[0];
    const staffD = shift && shift.start && shift.end ? { start: shift.start, end: shift.end, setup_minutes: shift.setup_minutes } : undefined;
    const servesD = items.map((i) => i.details).filter((d) => d?.kind === "serves");
    const qSetup = staffD?.start ? (() => { const [h, m] = staffD.start!.split(":").map(Number); const t = h * 60 + m - (staffD.setup_minutes ?? 0); const x = ((t % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; })() : null;
    const setupT = e.setup_time ?? (e.start_time ? null : qSetup);
    const startT = e.start_time ?? staffD?.start ?? null;
    const finishT = e.finish_time ?? staffD?.end ?? null;
    const hot = servesD.reduce((a, d) => a + (d?.hot ?? 0), 0), cold = servesD.reduce((a, d) => a + (d?.cold ?? 0), 0);
    const input = {
      label: pkg ? (pkg.rules.calendar_label?.trim() || title(pkg.name)) : null, eventName: e.name, customer: e.customer,
      date: e.event_date, setupTime: setupT, startTime: startT, finishTime: finishT,
      serves: e.serves ?? (servesFromQuote || null), servesLabel: (pkg?.rules.serves_label ?? null) as string | null,
      staffCount: people.get(e.id) ?? null, staffLabel: pkg?.rules.staff?.label ?? null, venue: e.venue, address: e.address,
    };
    const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
    // "250 coffees (200 hot + 50 cold)" when the quote split them
    if (cold > 0 && e.serves == null) input.servesLabel = `${input.servesLabel ?? "serves"} (${hot} hot + ${cold} cold)`;
    out.set(e.id, {
      title: jobTitle(input), description: jobDescription(input), date: e.event_date,
      startLocal: e.event_date && (hhmm(setupT) ?? hhmm(startT)) ? `${e.event_date}T${hhmm(setupT) ?? hhmm(startT)}:00` : null,
      endLocal: e.event_date && hhmm(finishT) ? `${e.event_date}T${hhmm(finishT)}:00` : null,
    });
  }
  return out;
}

function eventBody(ctx: SyncContext, ce: CalRow, job?: JobInfo | null, freeDays: number[] = DEFAULT_FREE_WEEKDAYS) {
  const tz = ctx.org.timezone;
  if (job && !ce.all_day) {
    // A booking: titled and described from the job; arrives at setup time; Free on the chosen days
    const startLocal = job.startLocal, endLocal = job.endLocal && job.startLocal && job.endLocal > job.startLocal ? job.endLocal : null;
    return {
      summary: job.title,
      location: ce.location ?? undefined,
      description: job.description || undefined,
      start: startLocal ? { dateTime: startLocal, timeZone: tz } : { dateTime: ce.starts_at, timeZone: tz },
      end: endLocal ? { dateTime: endLocal, timeZone: tz } : { dateTime: ce.ends_at, timeZone: tz },
      transparency: isFreeDay(job.date ?? localDate(ce.starts_at, tz), freeDays) ? "transparent" : "opaque",
      extendedProperties: { private: { eventureos_id: ce.id, eventureos_org: ctx.org.id } },
    };
  }
  if (ce.kind === "task") {
    // A follow-up reminder: shows as Free (never blocks bookings) and pops up at the time it's due
    return {
      summary: `Follow up: ${ce.title}`,
      description: `${ce.description ? `${ce.description}\n\n` : ""}To-do in EventureOS — ${appBaseUrl()}/tasks`,
      start: { dateTime: ce.starts_at, timeZone: tz }, end: { dateTime: ce.ends_at, timeZone: tz },
      transparency: "transparent",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
      extendedProperties: { private: { eventureos_id: ce.id, eventureos_org: ctx.org.id } },
    };
  }
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
    transparency: isFreeDay(localDate(ce.starts_at, tz), freeDays) && (ce.kind === "event" || ce.kind === "setup") ? "transparent" : "opaque",
    extendedProperties: { private: { eventureos_id: ce.id, eventureos_org: ctx.org.id } },
  };
}

const needsPush = (ce: CalRow) =>
  ce.sync_status !== "synced" || !ce.last_synced_at || !ce.external_event_id ||
  Date.parse(ce.updated_at) - Date.parse(ce.last_synced_at) > 5000;

/**
 * Guests for each event's calendar invite: everyone rostered on it (incl. "add to every event" people),
 * plus — unless switched off — the client's people linked to the job. Lower-case, de-duplicated, sorted.
 */
async function guestLists(ctx: SyncContext, eventIds: string[], includeClients: boolean) {
  const out = new Map<string, string[]>();
  if (!eventIds.length) return out;
  const ids = [...new Set(eventIds)];
  const own = (ctx.integration.account_label ?? "").toLowerCase();
  const add = (ev: string, email: string | null | undefined) => {
    const e = email?.trim().toLowerCase();
    if (!e || e === own || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
    const list = out.get(ev) ?? [];
    if (!list.includes(e)) list.push(e);
    out.set(ev, list);
  };
  const { data: staff } = await ctx.db.from("event_staff").select("event_id, user:users!event_staff_user_id_fkey(email)").eq("organisation_id", ctx.org.id).in("event_id", ids);
  for (const r of (staff ?? []) as unknown as { event_id: string; user: { email: string } | null }[]) add(r.event_id, r.user?.email);
  // Staff list people on the job, plus anyone set to be on every job (e.g. whoever does the rosters)
  const { data: crew } = await ctx.db.from("event_crew").select("event_id, member:crew_members(email, active)").eq("organisation_id", ctx.org.id).in("event_id", ids);
  for (const r of (crew ?? []) as unknown as { event_id: string; member: { email: string | null; active: boolean } | null }[]) if (r.member?.active) add(r.event_id, r.member.email);
  const { data: always } = await ctx.db.from("crew_members").select("email").eq("organisation_id", ctx.org.id).eq("active", true).eq("always_invite", true);
  for (const ev of ids) for (const m of (always ?? []) as { email: string | null }[]) add(ev, m.email);
  if (includeClients) {
    const { data: people } = await ctx.db.from("event_contacts").select("event_id, contact:contacts(email)").eq("organisation_id", ctx.org.id).in("event_id", ids);
    for (const r of (people ?? []) as unknown as { event_id: string; contact: { email: string | null } | null }[]) add(r.event_id, r.contact?.email);
    const { data: evs } = await ctx.db.from("events").select("id, contact:contacts!events_primary_contact_id_organisation_id_fkey(email)").eq("organisation_id", ctx.org.id).in("id", ids);
    for (const r of (evs ?? []) as unknown as { id: string; contact: { email: string | null } | null }[]) add(r.id, r.contact?.email);
  }
  for (const [k, v] of out) out.set(k, v.sort());
  return out;
}

export async function syncGoogleCalendar(ctx: SyncContext) {
  const logId = await startSyncLog(ctx, "calendar", "outbound");
  const s = (ctx.integration.settings ?? {}) as CalendarSettings;
  const kinds = [...new Set([...(s.sync_kinds?.length ? s.sync_kinds : DEFAULT_SYNC_KINDS), "task"])]; // follow-up reminders always go to the calendar
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
      .select("id, calendar_connection_id, event_id, title, starts_at, ends_at, all_day, location, kind, external_event_id, sync_status, last_synced_at, updated_at, attendees")
      .eq("organisation_id", ctx.org.id).in("calendar_connection_id", [...byId.keys()]).in("kind", kinds).gte("ends_at", since)
      .order("starts_at").limit(1000);
    if (rErr) throw new Error(`Could not load calendar entries: ${rErr.message}`);
    const toPush = ((rows ?? []) as CalRow[]).filter(needsPush);
    const r = await pushRows(ctx, s, byId, toPush, errors);
    pushed += r.pushed; failed += r.failed;

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


/** Push one calendar entry (e.g. a follow-up reminder) to Google straight away, rather than waiting for the next sync. */
export async function pushCalendarEntry(ctx: SyncContext, id: string, description?: string | null): Promise<void> {
  const { data: ce } = await ctx.db.from("calendar_events")
    .select("id, calendar_connection_id, event_id, title, starts_at, ends_at, all_day, location, kind, external_event_id, sync_status, last_synced_at, updated_at, attendees, conn:calendar_connections(external_calendar_id, sync_enabled, provider)")
    .eq("organisation_id", ctx.org.id).eq("id", id).maybeSingle();
  const row = ce as unknown as (CalRow & { conn: { external_calendar_id: string | null; sync_enabled: boolean; provider: string } | null }) | null;
  if (!row?.conn?.external_calendar_id || !row.conn.sync_enabled || row.conn.provider !== "google") return;
  const calId = row.conn.external_calendar_id;
  const body = eventBody(ctx, { ...row, description }, null);
  let g: GEvent | null = null;
  if (row.external_event_id) {
    try {
      g = await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(row.external_event_id)}?sendUpdates=none`,
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.patch");
      if (g.status === "cancelled") g = null;
    } catch (e) { if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) throw e; }
  }
  if (!g) {
    g = await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events?sendUpdates=none`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.insert");
  }
  await ctx.db.from("calendar_events").update({ external_event_id: g.id, sync_status: "synced", last_synced_at: new Date().toISOString() }).eq("id", row.id);
}

/** Remove an entry's event from Google (already gone is fine). */
export async function deleteGoogleEvent(ctx: SyncContext, calendarId: string, externalEventId: string): Promise<void> {
  try {
    await apiJSON(ctx, `${CAL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=none`, { method: "DELETE" }, "Google events.delete");
  } catch (e) { if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) throw e; }
}

/** Push calendar rows to Google: bookings get the job's title/description and guest invites; others a plain entry. */
async function pushRows(ctx: SyncContext, s: CalendarSettings, byId: Map<string, { id: string; name: string; external_calendar_id: string }>, toPush: CalRow[], errors: string[]) {
  let pushed = 0, failed = 0;
  const pushIds = toPush.filter((c) => c.kind === "event").map((c) => c.event_id).filter((x): x is string => !!x);
  const guests = await guestLists(ctx, toPush.map((c) => c.event_id).filter((x): x is string => !!x), s.invite_clients !== false);
  const jobs = await jobInfo(ctx, pushIds);
  const freeDays = Array.isArray(s.free_weekdays) ? s.free_weekdays : DEFAULT_FREE_WEEKDAYS;
  for (const ce of toPush) {
    const calId = byId.get(ce.calendar_connection_id)!.external_calendar_id;
    try {
      const want = ce.event_id && ce.kind === "event" ? guests.get(ce.event_id) ?? [] : [];
      const had = [...(ce.attendees ?? [])].sort();
      const changed = want.join(",") !== had.join(",");
      const job = ce.kind === "event" && ce.event_id ? jobs.get(ce.event_id) ?? null : null;
      const body = { ...eventBody(ctx, ce, job, freeDays), ...(want.length || had.length ? { attendees: want.map((email) => ({ email })) } : {}) };
      // Google only emails guests when the guest list changes — not on every time/venue tweak
      const notify = changed && want.length ? "all" : "none";
      let g: GEvent | null = null;
      if (ce.external_event_id) {
        try {
          g = await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ce.external_event_id)}?sendUpdates=${notify}`,
            { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.patch");
          if (g.status === "cancelled") g = null; // deleted in Google → recreate
        } catch (e) { if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) throw e; }
      }
      if (!g) {
        const found = await findByEventureId(ctx, calId, ce.id);
        g = found
          ? await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(found.id)}?sendUpdates=${notify}`,
              { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.patch")
          : await apiJSON<GEvent>(ctx, `${CAL}/calendars/${encodeURIComponent(calId)}/events?sendUpdates=${notify}`,
              { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, "Google events.insert");
      }
      const { error: uErr } = await ctx.db.from("calendar_events").update({ external_event_id: g.id, sync_status: "synced", last_synced_at: new Date().toISOString(), attendees: want }).eq("id", ce.id);
      if (uErr) throw new Error(uErr.message);
      pushed++;
    } catch (e) {
      failed++;
      errors.push(`${ce.title}: ${errMessage(e)}`);
      await ctx.db.from("calendar_events").update({ sync_status: "error" }).eq("id", ce.id);
    }
  }

  return { pushed, failed };
}

/** Push particular entries now (e.g. "Add to calendar" on an event) instead of waiting for the daily sync. */
export async function pushCalendarRowsNow(ctx: SyncContext, ids: string[]) {
  if (!ids.length) return { pushed: 0, failed: 0, errors: [] as string[] };
  const s = (ctx.integration.settings ?? {}) as CalendarSettings;
  const { data: conns } = await ctx.db.from("calendar_connections").select("id, name, external_calendar_id")
    .eq("organisation_id", ctx.org.id).eq("provider", "google").eq("sync_enabled", true).not("external_calendar_id", "is", null);
  const byId = new Map((conns ?? []).map((c) => [c.id as string, c as { id: string; name: string; external_calendar_id: string }]));
  const { data: rows } = await ctx.db.from("calendar_events")
    .select("id, calendar_connection_id, event_id, title, starts_at, ends_at, all_day, location, kind, external_event_id, sync_status, last_synced_at, updated_at, attendees")
    .eq("organisation_id", ctx.org.id).in("id", ids);
  const toPush = ((rows ?? []) as CalRow[]).filter((r) => byId.has(r.calendar_connection_id));
  const errors: string[] = [];
  const r = await pushRows(ctx, s, byId, toPush, errors);
  return { ...r, errors };
}
