"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { freeSlots, isFree, readApptSettings, zonedMs, type ApptKind, type ApptSettings, type DaySlots } from "@/lib/appointments/core";
import { busyBetween, createAppointment, emailClient, loadOrg, syncCalendar } from "@/lib/appointments/server";
import { searchClients, type ClientMatch } from "@/lib/nerdherd/from-enquiry";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const actor = (p: { full_name?: string | null; email?: string | null }) => p.full_name || p.email || "Someone";

async function office() {
  const ctx = await requireOrg();
  const org = await loadOrg(createServiceClient(), { id: ctx.org.id });
  if (!org) throw new Error("Organisation not found.");
  return { ...ctx, appt: org, db: createServiceClient() };
}

export async function apptFindClients(q: string): Promise<R<{ list: ClientMatch[] }>> {
  try { const { supabase, org } = await requireOrg(); return { ok: true, list: await searchClients(supabase, org.id, q) }; } catch (e) { return fail(e); }
}

export interface ClientContact { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; company: string }
export async function apptClientContacts(customerId: string): Promise<R<{ list: ClientContact[]; company: string; email: string | null; phone: string | null }>> {
  try {
    if (!UUID.test(customerId)) throw new Error("Choose a client.");
    const { supabase, org } = await requireOrg();
    const [{ data: c }, { data: list }] = await Promise.all([
      supabase.from("customers").select("name, email, phone").eq("id", customerId).eq("organisation_id", org.id).maybeSingle(),
      supabase.from("contacts").select("id, first_name, last_name, email, phone, is_primary").eq("customer_id", customerId).eq("organisation_id", org.id).order("is_primary", { ascending: false }).limit(20),
    ]);
    if (!c) throw new Error("That client no longer exists.");
    return { ok: true, company: c.name as string, email: (c.email as string | null) ?? null, phone: (c.phone as string | null) ?? null, list: (list ?? []).map((x) => ({ id: x.id as string, firstName: (x.first_name as string) ?? "", lastName: (x.last_name as string) ?? "", email: (x.email as string | null) ?? null, phone: (x.phone as string | null) ?? null, company: c.name as string })) };
  } catch (e) { return fail(e); }
}

/** Free times (your hours, notice and what's on) — suggestions only; the office can book outside them. */
export async function apptFreeTimes(duration: number, exceptId?: string | null): Promise<R<{ days: DaySlots[] }>> {
  try {
    const { appt, db } = await office();
    const s = { ...readApptSettings(appt.settings), notice_hours: 0 };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: appt.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const busy = await busyBetween(db, appt.id, new Date().toISOString(), new Date(Date.now() + (s.horizon_days + 2) * 86_400_000).toISOString(), exceptId && UUID.test(exceptId) ? exceptId : undefined);
    return { ok: true, days: freeSlots(s, { today, tz: appt.timezone, now: Date.now(), duration: Math.max(15, Math.min(240, Math.round(duration))), busy, days: Math.max(s.horizon_days, 45) }) };
  } catch (e) { return fail(e); }
}

export interface OfficeBookInput {
  customerId: string | null; contactId?: string | null; enquiryId?: string | null;
  client: { firstName: string; lastName: string; email: string; phone: string; company: string };
  title: string; kind: ApptKind; date: string; time: string; duration: number; notes: string; topic: string;
  location: string; meetingUrl: string; assignedTo: string | null;
  needsConfirm: boolean; // the client confirms (or suggests another time) from the email
  email: boolean;        // email the client the invite
}

/** Book a meeting from the office — picks an existing client or starts a new one in the CRM. */
export async function apptBook(i: OfficeBookInput): Promise<R<{ id: string; isNewClient: boolean; emailed: string | null }>> {
  try {
    const { appt, db, user } = await office();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || !/^\d{2}:\d{2}$/.test(i.time)) throw new Error("Choose the day and time.");
    const start = zonedMs(i.date, i.time, appt.timezone), end = start + Math.max(15, Math.min(480, Math.round(i.duration))) * 60_000;
    if (start < Date.now() - 3_600_000) throw new Error("That time has passed.");
    const r = await createAppointment(db, appt, {
      title: i.title || "Meeting", kind: i.kind, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString(), notes: i.notes, topic: i.topic,
      client: i.client, customerId: i.customerId && UUID.test(i.customerId) ? i.customerId : null, contactId: i.contactId && UUID.test(i.contactId) ? i.contactId : null, enquiryId: i.enquiryId && UUID.test(i.enquiryId) ? i.enquiryId : null, assignedTo: i.assignedTo && UUID.test(i.assignedTo) ? i.assignedTo : user.id,
      source: "office", status: i.needsConfirm ? "pending" : "confirmed", by: user.id, location: i.location || null, meetingUrl: /^https:\/\//.test(i.meetingUrl) ? i.meetingUrl : null, ignoreHours: true,
    });
    const emailed = i.email ? await emailClient(db, appt, r.id, i.needsConfirm ? "proposed" : "confirmed") : null;
    revalidatePath("/calendar"); revalidatePath("/calendar/appointments");
    return { ok: true, id: r.id, isNewClient: r.isNewClient, emailed };
  } catch (e) { return fail(e); }
}

export type OfficeAction = "approve" | "decline" | "approve_move" | "decline_move" | "cancel" | "complete";

/** Approve or decline a request, approve or decline a new time the client suggested, cancel, or mark done. */
export async function apptRespond(id: string, what: OfficeAction, o: { email: boolean; note?: string }): Promise<R<{ emailed: string | null }>> {
  try {
    if (!UUID.test(id)) throw new Error("Meeting not found.");
    const { appt, db, supabase, org, user, profile } = await office();
    const { data: a } = await supabase.from("appointments").select("id, status, starts_at, ends_at, proposed_starts_at, proposed_ends_at, title, customer_id, enquiry_id, client_name").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!a) throw new Error("Meeting not found.");
    const now = new Date().toISOString();
    let patch: Record<string, unknown> = { updated_at: now }, notice: Parameters<typeof emailClient>[3] | null = null, log = "";
    if (what === "approve") { patch.status = "confirmed"; notice = "confirmed"; log = "confirmed"; }
    else if (what === "decline") { patch.status = "declined"; notice = "cancelled"; log = "declined"; }
    else if (what === "cancel") { patch.status = "cancelled"; notice = "cancelled"; log = "cancelled"; }
    else if (what === "complete") { patch.status = "completed"; log = "marked done"; }
    else if (what === "approve_move") {
      if (!a.proposed_starts_at) throw new Error("No new time was suggested.");
      const busy = await busyBetween(db, org.id, new Date(Date.parse(a.proposed_starts_at as string) - 86_400_000).toISOString(), new Date(Date.parse(a.proposed_ends_at as string) + 86_400_000).toISOString(), id);
      const clash = isFree(readApptSettings(appt.settings), { tz: appt.timezone, now: Date.now(), start: Date.parse(a.proposed_starts_at as string), end: Date.parse(a.proposed_ends_at as string), busy, ignoreHours: true });
      if (clash) throw new Error(`Can't move it: ${clash}`);
      patch = { ...patch, status: "confirmed", starts_at: a.proposed_starts_at, ends_at: a.proposed_ends_at, proposed_starts_at: null, proposed_ends_at: null, reminder_sent_at: null };
      notice = "moved"; log = "moved to the client's new time";
    } else if (what === "decline_move") {
      patch = { ...patch, status: "confirmed", proposed_starts_at: null, proposed_ends_at: null }; notice = "reschedule_declined"; log = "kept the original time";
    } else throw new Error("Unknown action.");
    if (o.note?.trim()) patch.notes = o.note.trim().slice(0, 4000);
    const { error } = await supabase.from("appointments").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await syncCalendar(db, appt, id);
    const emailed = o.email && notice ? await emailClient(db, appt, id, notice) : null;
    if (a.customer_id) await supabase.from("activity_logs").insert({ organisation_id: org.id, actor_type: "user", actor_id: user.id, action: `appointment.${what}`, entity_type: "customer", entity_id: a.customer_id, enquiry_id: a.enquiry_id, summary: `${actor(profile)} ${log}: ${a.title}${a.client_name ? ` with ${a.client_name}` : ""}` });
    revalidatePath("/calendar"); revalidatePath("/calendar/appointments");
    return { ok: true, emailed };
  } catch (e) { return fail(e); }
}

/** Move a meeting to a new time (the office's choice). */
export async function apptMove(id: string, date: string, time: string, o: { email: boolean; duration?: number }): Promise<R<{ emailed: string | null }>> {
  try {
    if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Choose the new day and time.");
    const { appt, db, supabase, org } = await office();
    const { data: a } = await supabase.from("appointments").select("starts_at, ends_at").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!a) throw new Error("Meeting not found.");
    const length = o.duration ? o.duration * 60_000 : Date.parse(a.ends_at as string) - Date.parse(a.starts_at as string);
    const start = zonedMs(date, time, appt.timezone), end = start + length;
    const busy = await busyBetween(db, org.id, new Date(start - 86_400_000).toISOString(), new Date(end + 86_400_000).toISOString(), id);
    const clash = isFree(readApptSettings(appt.settings), { tz: appt.timezone, now: Date.now(), start, end, busy, ignoreHours: true });
    if (clash) throw new Error(clash);
    const { error } = await supabase.from("appointments").update({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), proposed_starts_at: null, proposed_ends_at: null, status: "confirmed", reminder_sent_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await syncCalendar(db, appt, id);
    const emailed = o.email ? await emailClient(db, appt, id, "moved") : null;
    revalidatePath("/calendar"); revalidatePath("/calendar/appointments");
    return { ok: true, emailed };
  } catch (e) { return fail(e); }
}

/** Save the booking settings (hours, notice, blocked days…). Managers only. */
export async function saveApptSettings(s: ApptSettings): Promise<R<{ when?: string }>> {
  try {
    const { org, role } = await requireOrg();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change booking settings.");
    const clean = readApptSettings({ appointments: s });
    // managers may change booking settings (checked above); the organisations table itself only lets owners/admins write
    const db = createServiceClient();
    const { data: cur, error: rErr } = await db.from("organisations").select("settings").eq("id", org.id).single();
    if (rErr) throw new Error(rErr.message);
    const settings = { ...((cur?.settings as Record<string, unknown>) ?? {}), appointments: clean };
    const { data: done, error } = await db.from("organisations").update({ settings }).eq("id", org.id).select("id");
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error("Couldn't save — please try again.");
    revalidatePath("/calendar/appointments"); revalidatePath("/calendar/appointments/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

