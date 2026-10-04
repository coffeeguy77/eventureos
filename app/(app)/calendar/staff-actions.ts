"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { localDate } from "@/lib/ai/classify";
import { fmtDate, todayISO } from "@/lib/format";
import { resyncJobCalendar } from "@/lib/crew/server";
import { removeShiftCalendar, syncShiftCalendar } from "@/lib/crew/custom-shifts";

/**
 * Staff on a calendar entry, from the calendar itself:
 *  - a job (EventureOS event) → its crew (offered → they accept in the staff app; past jobs → recorded as worked)
 *  - a Google Calendar booking with no job → a shift for each person (sent to their calendar if it's still to come)
 */
type R<T> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EntryStaffPerson { key: string; crewId: string; name: string; status: "offered" | "confirmed" | "interested" | "shift"; paid: boolean }
export interface EntryStaff {
  kind: "job" | "booking" | "none";
  /** why staff can't be added here (e.g. it's a staff shift or a to-do reminder) */
  note?: string;
  past: boolean;
  people: EntryStaffPerson[];
  options: { id: string; name: string }[];
}

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can roster staff.");
  return ctx;
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

/** What to roster: `job:<eventId>` (a job not on the calendar yet) or a calendar entry id. */
async function resolve(supabase: Awaited<ReturnType<typeof office>>["supabase"], orgId: string, ref: string) {
  if (ref.startsWith("job:")) {
    const id = ref.slice(4);
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    return { eventId: id, booking: null as null | { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null } };
  }
  if (!UUID.test(ref)) throw new Error("Refresh and try again.");
  const { data: ce, error } = await supabase.from("calendar_events").select("id, title, starts_at, ends_at, all_day, location, event_id, kind, staff_shift_id")
    .eq("organisation_id", orgId).eq("id", ref).maybeSingle();
  if (error && /staff_shift_id/.test(error.message)) throw new Error("Run the 0044 database update first.");
  if (!ce) throw new Error("That calendar entry no longer exists.");
  if (ce.event_id) return { eventId: ce.event_id as string, booking: null };
  if (ce.staff_shift_id || ce.kind === "shift") return { eventId: null, booking: null, note: "This is a staff shift — edit it under Wages → Shifts." };
  if (ce.kind === "task") return { eventId: null, booking: null, note: "This is a to-do reminder." };
  return { eventId: null, booking: ce as { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null } };
}

export async function loadEntryStaff(ref: string): Promise<R<EntryStaff>> {
  try {
    const { supabase, org } = await office();
    const r = await resolve(supabase, org.id, ref);
    const today = todayISO(org.timezone);
    const { data: staff } = await supabase.from("crew_members").select("id, name").eq("organisation_id", org.id).eq("active", true).order("rank").order("name");
    const options = (staff ?? []) as { id: string; name: string }[];
    if (r.eventId) {
      const [{ data: ev }, { data: crew }] = await Promise.all([
        supabase.from("events").select("event_date").eq("organisation_id", org.id).eq("id", r.eventId).maybeSingle(),
        supabase.from("event_crew").select("id, crew_member_id, status, payment_id, member:crew_members(name)").eq("organisation_id", org.id).eq("event_id", r.eventId),
      ]);
      const people = ((crew ?? []) as unknown as { id: string; crew_member_id: string; status: string; payment_id: string | null; member: { name: string } | null }[])
        .map((c) => ({ key: `e:${c.id}`, crewId: c.crew_member_id, name: c.member?.name ?? "?", status: (c.status as EntryStaffPerson["status"]) ?? "offered", paid: !!c.payment_id }));
      return { ok: true, data: { kind: "job", past: !!ev?.event_date && ev.event_date < today, people, options } };
    }
    if (r.booking) {
      const { data: shifts } = await supabase.from("staff_shifts").select("id, crew_member_id, payment_id, member:crew_members(name)").eq("organisation_id", org.id).eq("source_calendar_event_id", r.booking.id);
      const people = ((shifts ?? []) as unknown as { id: string; crew_member_id: string; payment_id: string | null; member: { name: string } | null }[])
        .map((s) => ({ key: `c:${s.id}`, crewId: s.crew_member_id, name: s.member?.name ?? "?", status: "shift" as const, paid: !!s.payment_id }));
      return { ok: true, data: { kind: "booking", past: localDate(r.booking.starts_at, org.timezone) < today, people, options } };
    }
    return { ok: true, data: { kind: "none", note: "note" in r ? r.note : undefined, past: false, people: [], options: [] } };
  } catch (e) { return fail(e); }
}

export async function addEntryStaff(ref: string, crewId: string): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(crewId)) throw new Error("Choose someone from the staff list.");
    const r = await resolve(supabase, org.id, ref);
    const { data: m } = await supabase.from("crew_members").select("name, role").eq("organisation_id", org.id).eq("id", crewId).eq("active", true).maybeSingle();
    if (!m) throw new Error("That person isn't on the staff list.");
    const today = todayISO(org.timezone);

    if (r.eventId) {
      const { data: ev } = await supabase.from("events").select("id, name, customer_id, event_date").eq("organisation_id", org.id).eq("id", r.eventId).maybeSingle();
      if (!ev) throw new Error("That job no longer exists.");
      const past = !!ev.event_date && ev.event_date < today;
      const { data: had } = await supabase.from("event_crew").select("id, status").eq("event_id", ev.id).eq("crew_member_id", crewId).maybeSingle();
      if (had && had.status !== "interested") return { ok: true, data: `${m.name} is already on this job.` };
      // Past jobs: they worked it (confirmed, so the hours go to Wages). Upcoming: an offer they accept in the staff app.
      const status = past ? "confirmed" : "offered";
      const { error } = had
        ? await supabase.from("event_crew").update({ status, ...(past ? { responded_at: new Date().toISOString() } : {}) }).eq("id", had.id)
        : await supabase.from("event_crew").insert({ organisation_id: org.id, event_id: ev.id, crew_member_id: crewId, role: m.role, status, ...(past ? { responded_at: new Date().toISOString() } : {}) });
      if (error) throw new Error(error.message);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_added", entityType: "event", entityId: ev.id, eventId: ev.id, customerId: ev.customer_id,
        summary: past ? `${actorName(profile)} recorded that ${m.name} worked ${ev.name}` : `${actorName(profile)} rostered ${m.name} on ${ev.name}` });
      if (!past) await resyncJobCalendar(supabase, org.id, ev.id).catch(() => undefined);
      revalidatePath(`/events/${ev.id}`);
      revalidatePath("/calendar");
      revalidatePath("/wages");
      return { ok: true, data: past ? `${m.name} added — their hours are now in Wages.` : `${m.name} offered the shift — they'll see it in the staff app.` };
    }

    if (r.booking) {
      const b = r.booking;
      const { data: dup } = await supabase.from("staff_shifts").select("id").eq("source_calendar_event_id", b.id).eq("crew_member_id", crewId).limit(1);
      if (dup?.length) return { ok: true, data: `${m.name} is already on it.` };
      const tz = org.timezone;
      const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
      const date = localDate(b.starts_at, tz);
      const { data: made, error } = await supabase.from("staff_shifts").insert({
        organisation_id: org.id, crew_member_id: crewId, title: (b.title || "Booking").slice(0, 120), shift_date: date,
        start_time: b.all_day ? null : hm(b.starts_at), finish_time: b.all_day ? null : hm(b.ends_at), location: b.location?.slice(0, 300) ?? null,
        source_calendar_event_id: b.id, created_by: user.id,
      }).select("id").single();
      if (error) throw new Error(/staff_shifts/.test(error.message) ? "Run the 0044 database update first." : error.message);
      // Still to come: it goes to their Google Calendar so their phone reminds them
      if (date >= today && made) await syncShiftCalendar(supabase, org.id, tz, [made.id as string]).catch(() => undefined);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.shift_added", entityType: "crew_member", entityId: crewId,
        summary: `${actorName(profile)} put ${m.name} on “${b.title}” (${fmtDate(date)})` });
      revalidatePath("/calendar");
      revalidatePath("/wages");
      return { ok: true, data: date < today ? `${m.name} added — their hours are now in Wages.` : `${m.name} added — it's in their staff app and calendar.` };
    }
    throw new Error("note" in r && r.note ? r.note : "Staff can't be added to this entry.");
  } catch (e) { return fail(e); }
}

export async function removeEntryStaff(key: string): Promise<R<string>> {
  try {
    const { supabase, org } = await office();
    const [kind, id] = [key.slice(0, 2), key.slice(2)];
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    if (kind === "e:") {
      const { data: c } = await supabase.from("event_crew").select("event_id, payment_id").eq("organisation_id", org.id).eq("id", id).maybeSingle();
      if (!c) return { ok: true, data: "Removed." };
      if (c.payment_id) throw new Error("That shift has been paid — undo the payment in Wages first.");
      await supabase.from("event_crew").delete().eq("organisation_id", org.id).eq("id", id);
      await resyncJobCalendar(supabase, org.id, c.event_id as string).catch(() => undefined);
      revalidatePath(`/events/${c.event_id}`);
    } else if (kind === "c:") {
      const { data: s } = await supabase.from("staff_shifts").select("payment_id").eq("organisation_id", org.id).eq("id", id).maybeSingle();
      if (!s) return { ok: true, data: "Removed." };
      if (s.payment_id) throw new Error("That shift has been paid — undo the payment in Wages first.");
      await removeShiftCalendar(supabase, org.id, [id]);
      await supabase.from("staff_shifts").delete().eq("organisation_id", org.id).eq("id", id);
    } else throw new Error("Refresh and try again.");
    revalidatePath("/calendar");
    revalidatePath("/wages");
    return { ok: true, data: "Removed." };
  } catch (e) { return fail(e); }
}
