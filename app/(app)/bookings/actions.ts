"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { newIntakeKey } from "@/lib/intake/keys";
import { zonedTimeUTC } from "@/lib/format";
import { cleanEmail, cleanPhone, normCode, readSettings, repeatDates, slugify, type Question } from "@/lib/bookings/core";
import { deliverGift, finalizeBooking, newGiftCode, orgById, refreshAgencyDraft, syncSessionBlock } from "@/lib/bookings/server";
import { importCsv, type CsvRow } from "@/lib/bookings/import";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_DB = "Run the 0049 database update (bookings) in Supabase first.";
const dbMsg = (m: string) => (/booking_|relation .* does not exist|schema cache|could not find the function/i.test(m) ? NEEDS_DB : m.replace(/^.*?ERROR:\s*/, ""));

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can do that.");
  return ctx;
}
async function manager() {
  const ctx = await office();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can do that.");
  return ctx;
}
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: dbMsg(e instanceof Error ? e.message : String(e)) }; }
}
const refresh = (...paths: string[]) => { revalidatePath("/bookings", "layout"); for (const p of paths) revalidatePath(p); };
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const money = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n * 100) / 100 : null; };

/* ------------------------------------------------------------------ courses */

export interface CourseInput {
  id?: string | null; name: string; slug?: string | null; summary?: string | null; description?: string | null; duration_minutes: number; price: number | string; capacity: number;
  location?: string | null; what_to_bring?: string | null; image_url?: string | null; colour?: string | null; calendar_connection_id?: string | null; active: boolean; public: boolean;
  max_seats_per_booking: number; waitlist: boolean; gift_enabled: boolean; agency_price?: number | string | null; xero_item_code?: string | null; xero_account_code?: string | null;
  invoice_title?: string | null; questions?: Question[]; external_names?: string[];
}

export async function saveCourse(c: CourseInput): Promise<Result<{ id: string }>> {
  return run(async () => {
    const { supabase, org, user, profile } = await office();
    const name = str(c.name, 120);
    if (!name) throw new Error("Give the course a name.");
    const price = money(c.price);
    if (price === null) throw new Error("Enter a price (0 for free).");
    const image = str(c.image_url, 500);
    if (image && !/^https:\/\//.test(image)) throw new Error("The image link must start with https://");
    const row = {
      name, slug: slugify(str(c.slug, 80) ?? name), summary: str(c.summary, 300), description: str(c.description, 8000),
      duration_minutes: Math.max(15, Math.min(1440, Math.round(Number(c.duration_minutes) || 120))), price, capacity: Math.max(1, Math.min(500, Math.round(Number(c.capacity) || 6))),
      location: str(c.location, 300), what_to_bring: str(c.what_to_bring, 1000), image_url: image, colour: c.colour && /^#[0-9a-f]{6}$/i.test(c.colour) ? c.colour : null,
      calendar_connection_id: c.calendar_connection_id && UUID.test(c.calendar_connection_id) ? c.calendar_connection_id : null,
      active: !!c.active, public: !!c.public, max_seats_per_booking: Math.max(1, Math.min(100, Math.round(Number(c.max_seats_per_booking) || 6))),
      waitlist: !!c.waitlist, gift_enabled: !!c.gift_enabled, agency_price: money(c.agency_price), xero_item_code: str(c.xero_item_code, 30), xero_account_code: str(c.xero_account_code, 30),
      invoice_title: str(c.invoice_title, 300),
      questions: (c.questions ?? []).filter((q) => q.label?.trim()).slice(0, 12).map((q, i) => ({ id: q.id && /^[a-z0-9_-]{1,40}$/i.test(q.id) ? q.id : `q${i + 1}`, label: q.label.trim().slice(0, 200), type: ["text", "textarea", "select", "checkbox"].includes(q.type) ? q.type : "text", required: !!q.required, options: q.type === "select" ? (q.options ?? []).map((o) => o.trim().slice(0, 80)).filter(Boolean).slice(0, 20) : undefined })),
      external_names: (c.external_names ?? []).map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 20),
    };
    if (c.id) {
      if (!UUID.test(c.id)) throw new Error("That course link isn't valid.");
      const { error } = await supabase.from("booking_courses").update(row).eq("organisation_id", org.id).eq("id", c.id);
      if (error) throw new Error(/booking_courses_organisation_id_slug_key|duplicate/.test(error.message) ? "Another course already uses that web address — change the link name." : error.message);
      refresh();
      return { id: c.id };
    }
    const { data, error } = await supabase.from("booking_courses").insert({ ...row, organisation_id: org.id, created_by: user.id }).select("id").single();
    if (error) throw new Error(/duplicate/.test(error.message) ? "Another course already uses that web address — change the link name." : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "booking_course.created", entityType: "booking_course", entityId: data.id as string, summary: `${actorName(profile)} added the course ${name}` });
    refresh();
    return { id: data.id as string };
  });
}

export async function deleteCourse(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("course_id", id);
    if (count) throw new Error("This course has bookings, so it can't be deleted — switch it off instead (untick “Taking bookings”).");
    const { error } = await supabase.from("booking_courses").delete().eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return "Course deleted.";
  });
}

/* ------------------------------------------------------------------ sessions */

export async function generateSessions(o: { courseId: string; from: string; to: string; weekdays: number[]; times: string[]; every: number; skip?: string[] }): Promise<Result> {
  return run(async () => {
    const { supabase, org, user } = await office();
    if (!UUID.test(o.courseId)) throw new Error("Choose a course.");
    const { data: c } = await supabase.from("booking_courses").select("id, duration_minutes, capacity, name").eq("organisation_id", org.id).eq("id", o.courseId).single();
    if (!c) throw new Error("Course not found.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.from) || !/^\d{4}-\d{2}-\d{2}$/.test(o.to)) throw new Error("Choose the first and last dates.");
    const times = o.times.filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (!times.length) throw new Error("Add a start time.");
    if (!o.weekdays.length) throw new Error("Choose at least one day of the week.");
    const dates = o.weekdays.flatMap((w) => repeatDates(o.from, o.to, w, o.every, o.skip ?? [])).sort();
    const rows = dates.flatMap((d) => times.map((t) => {
      const starts = zonedTimeUTC(d, t, org.timezone);
      return { organisation_id: org.id, course_id: c.id, starts_at: starts, ends_at: new Date(Date.parse(starts) + Number(c.duration_minutes) * 60000).toISOString(), capacity: c.capacity, status: "open", created_by: user.id };
    })).filter((r) => Date.parse(r.starts_at) > Date.now()).slice(0, 300);
    if (!rows.length) throw new Error("No future dates match — check the dates and days.");
    const { data, error } = await supabase.from("booking_sessions").upsert(rows, { onConflict: "course_id,starts_at", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    refresh();
    const made = data?.length ?? 0;
    return `${made} session${made === 1 ? "" : "s"} added${rows.length - made ? ` (${rows.length - made} already existed)` : ""}.`;
  });
}

export async function updateSession(id: string, p: { capacity?: number; external_seats?: number; external_note?: string | null; status?: "open" | "closed" | "cancelled"; note?: string | null; price?: string | number | null }): Promise<Result> {
  return run(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("That session link isn't valid.");
    const patch: Record<string, unknown> = {};
    if (p.capacity !== undefined) patch.capacity = Math.max(0, Math.min(500, Math.round(Number(p.capacity) || 0)));
    if (p.external_seats !== undefined) patch.external_seats = Math.max(0, Math.min(500, Math.round(Number(p.external_seats) || 0)));
    if (p.external_note !== undefined) patch.external_note = str(p.external_note, 500);
    if (p.note !== undefined) patch.note = str(p.note, 1000);
    if (p.status && ["open", "closed", "cancelled"].includes(p.status)) patch.status = p.status;
    if (p.price !== undefined) patch.price = money(p.price);
    const { error } = await supabase.from("booking_sessions").update(patch).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    if (p.status) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `booking_session.${p.status}`, entityType: "booking_session", entityId: id, summary: `${actorName(profile)} ${p.status === "open" ? "opened" : p.status === "closed" ? "closed bookings for" : "cancelled"} a session` });
    const db = createServiceClient();
    await syncSessionBlock(db, await orgById(db, org.id), id).catch(() => undefined);
    refresh(`/bookings/sessions/${id}`);
    return "Saved.";
  });
}

export async function addSession(o: { courseId: string; date: string; time: string; capacity?: number }): Promise<Result<{ id: string }>> {
  return run(async () => {
    const { supabase, org, user } = await office();
    const { data: c } = await supabase.from("booking_courses").select("id, duration_minutes, capacity").eq("organisation_id", org.id).eq("id", o.courseId).single();
    if (!c) throw new Error("Choose a course.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !/^\d{2}:\d{2}$/.test(o.time)) throw new Error("Choose a date and start time.");
    const starts = zonedTimeUTC(o.date, o.time, org.timezone);
    const { data, error } = await supabase.from("booking_sessions").insert({ organisation_id: org.id, course_id: c.id, starts_at: starts, ends_at: new Date(Date.parse(starts) + Number(c.duration_minutes) * 60000).toISOString(),
      capacity: o.capacity ?? c.capacity, status: "open", created_by: user.id }).select("id").single();
    if (error) throw new Error(/duplicate/.test(error.message) ? "There's already a session for this course at that time." : error.message);
    refresh();
    return { id: data.id as string };
  });
}

export async function deleteSession(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("session_id", id);
    if (count) throw new Error("This session has bookings — cancel it instead, so the bookings are kept.");
    const db = createServiceClient();
    await supabase.from("booking_sessions").update({ status: "cancelled" }).eq("organisation_id", org.id).eq("id", id);
    await syncSessionBlock(db, await orgById(db, org.id), id).catch(() => undefined);
    const { error } = await supabase.from("booking_sessions").delete().eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return "Session deleted.";
  });
}

/* ------------------------------------------------------------------ bookings */

export interface OfficeBookingInput {
  sessionId: string; name: string; email?: string | null; phone?: string | null; seats: number; attendees?: string[]; notes?: string | null;
  payment: "office" | "free" | "external" | "agency"; amountPaid?: number | string | null; priceEach?: number | string | null;
  agencyId?: string | null; poNumber?: string | null; poSite?: string | null; poContact?: string | null; sendConfirmation: boolean; force: boolean;
}

export async function officeBooking(i: OfficeBookingInput): Promise<Result<{ id: string; message: string }>> {
  return run(async () => {
    const { org, user, profile, supabase } = await office();
    if (!UUID.test(i.sessionId)) throw new Error("Choose a session.");
    const name = str(i.name, 160);
    if (!name) throw new Error("Enter the person's name.");
    const email = i.email?.trim() ? cleanEmail(i.email) : null;
    if (i.email?.trim() && !email) throw new Error("That email doesn't look right.");
    if (i.payment === "agency" && (!i.agencyId || !UUID.test(i.agencyId))) throw new Error("Choose the agency.");
    const db = createServiceClient();
    const { ensureStudent } = await import("@/lib/bookings/server");
    const studentId = await ensureStudent(db, org.id, { name, email, phone: cleanPhone(i.phone), source: "office" });
    const seats = Math.max(1, Math.min(100, Math.round(Number(i.seats) || 1)));
    const attendees = (i.attendees ?? []).map((a) => a.trim()).slice(0, seats);
    while (attendees.length < seats) attendees.push(attendees.length === 0 ? name : `Guest ${attendees.length + 1}`);
    let priceEach = money(i.priceEach);
    if (i.payment === "agency" && priceEach === null) {
      const { data: a } = await db.from("booking_agencies").select("price").eq("id", i.agencyId!).maybeSingle();
      const { data: s } = await db.from("booking_sessions").select("price, course:booking_courses(price, agency_price)").eq("id", i.sessionId).single();
      const ss = s as unknown as { price: number | null; course: { price: number; agency_price: number | null } };
      priceEach = Number(a?.price ?? ss.course.agency_price ?? ss.price ?? ss.course.price);
    }
    const { data: id, error } = await db.rpc("booking_reserve", {
      p_org: org.id, p_session: i.sessionId, p_seats: seats, p_hold_minutes: 0, p_force: !!i.force, p_waitlist: false, p_gift_code: null,
      p_booking: { student_id: studentId, contact_name: name, contact_email: email, contact_phone: cleanPhone(i.phone), attendees: attendees.map((n) => ({ name: n })), notes: str(i.notes, 2000),
        ...(priceEach !== null ? { price_each: priceEach } : {}), payment_method: i.payment, source: "office", agency_id: i.payment === "agency" ? i.agencyId : null,
        po_number: str(i.poNumber, 60), po_site: str(i.poSite, 160), po_contact: str(i.poContact, 160), created_by: user.id },
    });
    if (error) throw new Error(dbMsg(error.message));
    const bookingId = id as string;
    const { data: b } = await db.from("bookings").select("total, reference").eq("id", bookingId).single();
    const paid = i.payment === "free" ? 0 : i.payment === "external" ? money(i.amountPaid) ?? Number(b?.total ?? 0) : money(i.amountPaid) ?? 0;
    await db.from("bookings").update({ amount_paid: paid, ...(i.sendConfirmation && email ? {} : { confirmation_sent_at: new Date().toISOString() }) }).eq("id", bookingId);
    await finalizeBooking(db, bookingId);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "booking.created", entityType: "booking", entityId: bookingId, summary: `${actorName(profile)} booked ${name} in (${b?.reference ?? ""}, ${seats} seat${seats === 1 ? "" : "s"})` });
    refresh(`/bookings/sessions/${i.sessionId}`);
    return { id: bookingId, message: `${b?.reference ?? "Booking"} added${i.sendConfirmation && email ? " — confirmation emailed" : ""}${i.payment === "agency" ? " — draft invoice made for you to check" : ""}.` };
  });
}

export async function setBookingStatus(id: string, status: "confirmed" | "attended" | "no_show" | "cancelled", reason?: string): Promise<Result> {
  return run(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("That booking link isn't valid.");
    const { data: b } = await supabase.from("bookings").select("id, reference, status, session_id, contact_name, amount_paid").eq("organisation_id", org.id).eq("id", id).single();
    if (!b) throw new Error("Booking not found.");
    const patch: Record<string, unknown> = { status };
    if (status === "attended") patch.checked_in_at = new Date().toISOString();
    if (status === "confirmed") { patch.checked_in_at = null; patch.cancelled_at = null; patch.cancel_reason = null; patch.hold_expires_at = null; }
    if (status === "cancelled") { patch.cancelled_at = new Date().toISOString(); patch.cancel_reason = str(reason, 500) ?? `Cancelled by ${actorName(profile)}`; patch.hold_expires_at = null; }
    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (status === "cancelled" || b.status === "cancelled") {
      await refreshAgencyDraft(createServiceClient(), id).catch(() => undefined);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `booking.${status}`, entityType: "booking", entityId: id, summary: `${actorName(profile)} ${status === "cancelled" ? "cancelled" : "restored"} ${b.reference} (${b.contact_name})${status === "cancelled" && Number(b.amount_paid) > 0 ? " — refund or credit to sort out" : ""}` });
      const db = createServiceClient();
      await syncSessionBlock(db, await orgById(db, org.id), b.session_id as string).catch(() => undefined);
    }
    refresh(`/bookings/sessions/${b.session_id}`);
    return status === "attended" ? "Checked in." : status === "no_show" ? "Marked as a no-show." : status === "cancelled" ? `Cancelled.${Number(b.amount_paid) > 0 ? " If they paid, refund them in Stripe or give a credit (gift certificate)." : ""}` : "Booking restored.";
  });
}

export async function moveBooking(id: string, sessionId: string, force: boolean): Promise<Result> {
  return run(async () => {
    const { supabase, org, user, profile } = await office();
    const { data: b } = await supabase.from("bookings").select("session_id, reference, contact_email").eq("organisation_id", org.id).eq("id", id).single();
    if (!b) throw new Error("Booking not found.");
    const db = createServiceClient();
    const { error } = await db.rpc("booking_move", { p_org: org.id, p_booking: id, p_session: sessionId, p_force: force });
    if (error) throw new Error(dbMsg(error.message));
    await refreshAgencyDraft(db, id).catch(() => undefined);
    const o = await orgById(db, org.id);
    await syncSessionBlock(db, o, b.session_id as string).catch(() => undefined);
    await syncSessionBlock(db, o, sessionId).catch(() => undefined);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "booking.moved", entityType: "booking", entityId: id, summary: `${actorName(profile)} moved ${b.reference} to another session` });
    refresh(`/bookings/sessions/${b.session_id}`, `/bookings/sessions/${sessionId}`);
    return "Moved.";
  });
}

export async function resendConfirmation(id: string): Promise<Result> {
  return run(async () => {
    const { org } = await office();
    const db = createServiceClient();
    const { data: b } = await db.from("bookings").select("id, contact_email, status").eq("organisation_id", org.id).eq("id", id).single();
    if (!b?.contact_email) throw new Error("This booking has no email address.");
    if (!["confirmed", "waitlist"].includes(b.status as string)) throw new Error("Only current bookings can be re-sent.");
    await db.from("bookings").update({ confirmation_sent_at: null }).eq("id", id);
    await finalizeBooking(db, id);
    return `Confirmation sent to ${b.contact_email}.`;
  });
}

export async function updateBookingDetails(id: string, p: { contact_name?: string; contact_email?: string | null; contact_phone?: string | null; notes?: string | null; attendees?: string[]; amount_paid?: string | number | null }): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await office();
    const patch: Record<string, unknown> = {};
    if (p.contact_name !== undefined) { const n = str(p.contact_name, 160); if (!n) throw new Error("Name can't be empty."); patch.contact_name = n; }
    if (p.contact_email !== undefined) { const e = p.contact_email?.trim() ? cleanEmail(p.contact_email) : null; if (p.contact_email?.trim() && !e) throw new Error("That email doesn't look right."); patch.contact_email = e; }
    if (p.contact_phone !== undefined) patch.contact_phone = cleanPhone(p.contact_phone);
    if (p.notes !== undefined) patch.notes = str(p.notes, 2000);
    if (p.attendees !== undefined) patch.attendees = p.attendees.map((a) => ({ name: a.trim().slice(0, 160) })).filter((a) => a.name);
    if (p.amount_paid !== undefined) patch.amount_paid = money(p.amount_paid) ?? 0;
    const { data, error } = await supabase.from("bookings").update(patch).eq("organisation_id", org.id).eq("id", id).select("session_id").single();
    if (error) throw new Error(error.message);
    await refreshAgencyDraft(createServiceClient(), id).catch(() => undefined);
    refresh(`/bookings/sessions/${data.session_id}`);
    return "Saved.";
  });
}

/* ------------------------------------------------------------------ gift certificates */

export async function createOfficeGift(g: { amount: string | number; courseId?: string | null; recipientName?: string | null; purchaserName?: string | null; purchaserEmail?: string | null; recipientEmail?: string | null; message?: string | null; email: boolean; paid: boolean }): Promise<Result<{ code: string }>> {
  return run(async () => {
    const { supabase, org, user, profile } = await office();
    const amount = money(g.amount);
    if (!amount || amount <= 0) throw new Error("Enter the gift amount.");
    const db = createServiceClient();
    const o = await orgById(db, org.id);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
    const exp = new Date(today + "T00:00:00Z"); exp.setUTCMonth(exp.getUTCMonth() + o.settings.gift_expiry_months);
    let row: { id: string; code: string } | null = null;
    for (let i = 0; i < 4 && !row; i++) {
      const { data, error } = await supabase.from("booking_gifts").insert({
        organisation_id: org.id, code: newGiftCode(), course_id: g.courseId && UUID.test(g.courseId) ? g.courseId : null, amount, balance: amount, status: "active",
        purchaser_name: str(g.purchaserName, 160), purchaser_email: g.purchaserEmail?.trim() ? cleanEmail(g.purchaserEmail) : null,
        recipient_name: str(g.recipientName, 160), recipient_email: g.recipientEmail?.trim() ? cleanEmail(g.recipientEmail) : null, message: str(g.message, 1000),
        expires_on: exp.toISOString().slice(0, 10), source: "office", created_by: user.id,
      }).select("id, code").single();
      if (!error) row = data as { id: string; code: string };
      else if (!/duplicate/.test(error.message)) throw new Error(error.message);
    }
    if (!row) throw new Error("Couldn't make a unique code — try again.");
    if (g.email) await deliverGift(db, o, row.id, true);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "gift.created", entityType: "booking_gift", entityId: row.id, summary: `${actorName(profile)} made gift certificate ${row.code} (${amount.toFixed(2)})${g.paid ? "" : " — complimentary"}` });
    refresh();
    return { code: row.code };
  });
}

export async function voidGift(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org, user, profile } = await manager();
    const { data, error } = await supabase.from("booking_gifts").update({ status: "void" }).eq("organisation_id", org.id).eq("id", id).select("code").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "gift.voided", entityType: "booking_gift", entityId: id, summary: `${actorName(profile)} voided gift certificate ${data.code}` });
    refresh();
    return "Voided.";
  });
}

export async function resendGift(id: string): Promise<Result> {
  return run(async () => {
    const { org } = await office();
    const db = createServiceClient();
    await db.from("booking_gifts").update({ sent_at: null }).eq("organisation_id", org.id).eq("id", id).eq("status", "active");
    await deliverGift(db, await orgById(db, org.id), id, true);
    return "Sent again.";
  });
}

/* ------------------------------------------------------------------ agencies */

export async function saveAgency(a: { id?: string | null; name: string; code: string; customer_id?: string | null; price?: string | number | null; contact_label?: string; po_label?: string; site_label?: string; po_required: boolean; notify_email?: string | null; active: boolean }): Promise<Result> {
  return run(async () => {
    const { supabase, org, user } = await manager();
    const name = str(a.name, 160);
    const code = normCode(a.code ?? "");
    if (!name) throw new Error("Enter the agency's name.");
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("The code needs 3–40 letters or numbers (no spaces).");
    const row = { name, code, customer_id: a.customer_id && UUID.test(a.customer_id) ? a.customer_id : null, price: money(a.price),
      contact_label: str(a.contact_label, 60) ?? "Contact", po_label: str(a.po_label, 60) ?? "Purchase Order :", site_label: str(a.site_label, 60) ?? "Purchasing Site",
      po_required: !!a.po_required, notify_email: a.notify_email?.trim() ? cleanEmail(a.notify_email) : null, active: !!a.active };
    const q = a.id ? supabase.from("booking_agencies").update(row).eq("organisation_id", org.id).eq("id", a.id) : supabase.from("booking_agencies").insert({ ...row, organisation_id: org.id, created_by: user.id });
    const { error } = await q;
    if (error) throw new Error(/duplicate/.test(error.message) ? "Another agency already uses that code." : error.message);
    refresh();
    return "Saved.";
  });
}

/** The office has checked a draft invoice from an agency booking: make it a real invoice, which then goes to Xero on the next sync. */
export async function approveDraftInvoice(invoiceId: string): Promise<Result> {
  return run(async () => {
    const { supabase, org, user, profile } = await manager();
    const { data, error } = await supabase.from("invoices").update({ status: "awaiting_payment" }).eq("organisation_id", org.id).eq("id", invoiceId).eq("status", "draft").is("xero_invoice_id", null).select("number").single();
    if (error) throw new Error(error.code === "PGRST116" ? "That invoice isn't a draft any more." : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.approved", entityType: "invoice", entityId: invoiceId, summary: `${actorName(profile)} approved draft invoice ${data.number}` });
    refresh("/invoices", `/invoices/${invoiceId}`);
    return `${data.number} approved — it goes to Xero with the next sync (within a few minutes).`;
  });
}

/* ------------------------------------------------------------------ settings, website & plugin */

export async function saveBookingSettings(s: Record<string, unknown>): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { data: o, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const current = (o.settings ?? {}) as Record<string, unknown>;
    const merged = { ...((current.booking as Record<string, unknown>) ?? {}), ...s };
    const clean = readSettings({ booking: merged });
    const { error } = await supabase.from("organisations").update({ settings: { ...current, booking: clean } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    refresh();
    return "Settings saved.";
  });
}

export async function createPluginKey(label: string): Promise<Result<{ key: string }>> {
  return run(async () => {
    const { supabase, org, user, role } = await office();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can make plugin keys.");
    const k = newIntakeKey();
    const { error } = await supabase.from("inbound_connections").insert({ organisation_id: org.id, provider: "wordpress", label: str(label, 80) ?? "WordPress website", key_prefix: k.prefix, key_hash: k.hash, created_by: user.id });
    if (error) throw new Error(/provider_check/.test(error.message) ? NEEDS_DB : error.message);
    refresh();
    return { key: k.key };
  });
}

export async function revokePluginKey(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org, role } = await office();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can revoke plugin keys.");
    const { error } = await supabase.from("inbound_connections").update({ active: false, revoked_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return "Key revoked.";
  });
}

export async function importCsvAction(rows: CsvRow[]): Promise<Result> {
  return run(async () => {
    const { org } = await manager();
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import.");
    const r = await importCsv(createServiceClient(), org.id, rows.slice(0, 3000));
    refresh();
    return `${r.created} added, ${r.updated} updated, ${r.skipped} already there${r.ignored ? `, ${r.ignored} rows skipped (missing date, time, course or name)` : ""}.${r.errors.length ? ` Problems: ${r.errors.slice(0, 3).join("; ")}` : ""}`;
  });
}
