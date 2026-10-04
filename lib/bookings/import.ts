import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeUTC } from "@/lib/format";
import { cleanEmail, cleanPhone, parseDate, parseTime, slugify } from "./core";
import { ensureStudent, orgById, syncSessionBlock } from "./server";

/**
 * Copy bookings from other systems into EventureOS:
 *  - Bookly (WordPress), sent by the EventureOS WordPress plugin, which reads Bookly's tables on the website's server
 *  - a spreadsheet (CSV) export, for anything else
 * Matching is by the other system's booking id (external_ref), so sending the same booking again updates it.
 * Imported bookings never trigger EventureOS emails (the other system already confirmed them).
 */

export interface BooklyService { id: number | string; title: string; duration?: number | null; price?: number | string | null; capacity_max?: number | null }
export interface BooklyAppointment {
  ca_id: number | string; appointment_id?: number | string; service_id?: number | string | null; service_title?: string | null;
  start: string; end?: string | null; tz?: string | null; persons?: number | null; status?: string | null; notes?: string | null; created?: string | null;
  customer?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  payment?: { total?: number | string | null; paid?: number | string | null; status?: string | null; type?: string | null } | null;
}
export interface BooklyPayload { services?: BooklyService[]; appointments?: BooklyAppointment[]; tz?: string }

const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;

interface Ctx { db: SupabaseClient; orgId: string; tz: string; contactEmail: string | null; courses: Map<string, { id: string; capacity: number; price: number; duration: number }>; sessions: Map<string, string>; touched: Set<string> }

async function courseFor(c: Ctx, key: string, svc: { title: string; duration?: number | null; price?: number; capacity?: number | null }) {
  const hit = c.courses.get(key) ?? c.courses.get(`name:${svc.title.toLowerCase()}`);
  if (hit) return hit;
  // A Bookly service we haven't seen: make a course for it (the office can rename, price and publish it)
  const duration = Math.max(15, Math.min(1440, Math.round((svc.duration ?? 7200) / 60)));
  let slug = slugify(svc.title);
  const { data: clash } = await c.db.from("booking_courses").select("slug").eq("organisation_id", c.orgId).like("slug", `${slug}%`);
  if (clash?.some((x) => x.slug === slug)) slug = `${slug}-${(clash?.length ?? 0) + 1}`;
  const { data, error } = await c.db.from("booking_courses").insert({
    organisation_id: c.orgId, slug, name: svc.title.slice(0, 120), duration_minutes: duration, price: Math.max(0, Number(svc.price ?? 0) || 0),
    capacity: Math.max(1, Math.min(500, Number(svc.capacity ?? 6) || 6)), public: false, external_names: [key, svc.title],
  }).select("id, capacity, price, duration_minutes").single();
  if (error) throw new Error(`Couldn't create a course for "${svc.title}": ${error.message}`);
  const row = { id: data.id as string, capacity: Number(data.capacity), price: Number(data.price), duration: Number(data.duration_minutes) };
  c.courses.set(key, row); c.courses.set(`name:${svc.title.toLowerCase()}`, row);
  return row;
}

async function sessionFor(c: Ctx, course: { id: string; capacity: number; duration: number }, startsAt: string, endsAt: string) {
  const k = `${course.id}|${startsAt}`;
  const hit = c.sessions.get(k);
  if (hit) return hit;
  const { data: found } = await c.db.from("booking_sessions").select("id").eq("course_id", course.id).eq("starts_at", startsAt).maybeSingle();
  if (found) { c.sessions.set(k, found.id as string); return found.id as string; }
  const { data, error } = await c.db.from("booking_sessions").insert({ organisation_id: c.orgId, course_id: course.id, starts_at: startsAt, ends_at: endsAt, capacity: course.capacity, status: "open" }).select("id").single();
  if (error) {
    const { data: again } = await c.db.from("booking_sessions").select("id").eq("course_id", course.id).eq("starts_at", startsAt).maybeSingle();
    if (again) { c.sessions.set(k, again.id as string); return again.id as string; }
    throw new Error(error.message);
  }
  c.sessions.set(k, data.id as string);
  return data.id as string;
}

async function loadCtx(db: SupabaseClient, orgId: string, tz?: string | null): Promise<Ctx> {
  const org = await orgById(db, orgId);
  const { data } = await db.from("booking_courses").select("id, name, capacity, price, duration_minutes, external_names").eq("organisation_id", orgId);
  const courses = new Map<string, { id: string; capacity: number; price: number; duration: number }>();
  for (const r of (data ?? []) as { id: string; name: string; capacity: number; price: number; duration_minutes: number; external_names: string[] }[]) {
    const v = { id: r.id, capacity: Number(r.capacity), price: Number(r.price), duration: Number(r.duration_minutes) };
    courses.set(`name:${r.name.toLowerCase()}`, v);
    for (const n of r.external_names ?? []) courses.set(/^[a-z]+:/.test(n) ? n : `name:${n.toLowerCase()}`, v);
  }
  return { db, orgId, tz: tz && /^[A-Za-z_]+\/[A-Za-z_/+-]+$/.test(tz) ? tz : org.timezone, contactEmail: org.contact_email?.toLowerCase() ?? null, courses, sessions: new Map(), touched: new Set() };
}

function mapStatus(s: string | null | undefined, past: boolean) {
  const v = (s ?? "approved").toLowerCase();
  if (["cancelled", "rejected", "canceled"].includes(v)) return "cancelled";
  if (v === "waitlisted") return "waitlist";
  return past ? "attended" : "confirmed";
}

async function nextRef(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.rpc("next_org_number", { org: orgId, counter_key: "booking", start_at: 1001 });
  if (error) throw new Error(error.message);
  return `BK-${data}`;
}

interface Row {
  externalRef: string; source: "bookly" | "classbento" | "woocommerce" | "import"; courseKey: string; courseTitle: string; serviceDuration?: number | null; servicePrice?: number; serviceCapacity?: number | null;
  startsAt: string; endsAt: string | null; seats: number; status: string; name: string; email: string | null; phone: string | null; notes: string | null; paid: number; createdAt: string | null;
}

async function upsertRows(c: Ctx, rows: Row[]) {
  const out = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const refs = rows.map((r) => r.externalRef);
  const existing = new Map<string, { id: string; status: string; session_id: string; seats: number }>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await c.db.from("bookings").select("id, status, session_id, seats, external_ref").eq("organisation_id", c.orgId).in("external_ref", refs.slice(i, i + 200));
    for (const b of (data ?? []) as { id: string; status: string; session_id: string; seats: number; external_ref: string }[]) existing.set(b.external_ref, b);
  }
  for (const r of rows) {
    try {
      const course = await courseFor(c, r.courseKey, { title: r.courseTitle, duration: r.serviceDuration, price: r.servicePrice, capacity: r.serviceCapacity });
      const endsAt = r.endsAt ?? new Date(Date.parse(r.startsAt) + course.duration * 60000).toISOString();
      const sessionId = await sessionFor(c, course, r.startsAt, endsAt);
      const past = Date.parse(endsAt) < Date.now();
      const status = r.status === "cancelled" || r.status === "waitlist" ? r.status : past ? "attended" : "confirmed";
      const prev = existing.get(r.externalRef);
      if (prev) {
        // Don't undo what the office has done in EventureOS (check-in, no-show) — only follow Bookly cancellations and moves
        const patch: Record<string, unknown> = {};
        if (prev.session_id !== sessionId) { patch.session_id = sessionId; patch.course_id = course.id; }
        if (prev.seats !== r.seats) patch.seats = r.seats;
        if (status === "cancelled" && prev.status !== "cancelled") { patch.status = "cancelled"; patch.cancelled_at = new Date().toISOString(); patch.cancel_reason = `Cancelled in ${r.source}`; }
        if (status !== "cancelled" && prev.status === "cancelled") patch.status = status;
        if (Object.keys(patch).length) {
          await c.db.from("bookings").update(patch).eq("id", prev.id);
          out.updated++; c.touched.add(sessionId); if (patch.session_id) c.touched.add(prev.session_id);
        } else out.skipped++;
        continue;
      }
      const own = !!r.email && r.email === c.contactEmail; // the business's own placeholder bookings (e.g. "FULL")
      const studentId = own ? null : await ensureStudent(c.db, c.orgId, { name: r.name, email: r.email, phone: r.phone, source: r.source });
      const stamp = new Date().toISOString();
      const { error } = await c.db.from("bookings").insert({
        organisation_id: c.orgId, reference: await nextRef(c.db, c.orgId), session_id: sessionId, course_id: course.id, student_id: studentId, status, seats: r.seats,
        attendees: [{ name: r.name }], contact_name: r.name.slice(0, 160) || "Guest", contact_email: r.email, contact_phone: r.phone, notes: r.notes?.slice(0, 2000) || null,
        price_each: course.price, total: Math.round(course.price * r.seats * 100) / 100, amount_paid: r.paid, payment_method: "external", source: r.source,
        external_ref: r.externalRef, confirmed_at: status === "cancelled" ? null : r.createdAt ?? stamp, cancelled_at: status === "cancelled" ? stamp : null,
        // Already confirmed and reminded by the other system — EventureOS stays quiet
        confirmation_sent_at: stamp, reminder_sent_at: stamp, followup_sent_at: stamp,
        ...(r.createdAt ? { created_at: r.createdAt } : {}),
      });
      if (error) { if (/duplicate|unique/i.test(error.message)) { out.skipped++; continue; } throw new Error(error.message); }
      out.created++; c.touched.add(sessionId);
    } catch (e) {
      if (out.errors.length < 20) out.errors.push(`${r.externalRef}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

async function finish(c: Ctx) {
  // Busy entries on the calendar for upcoming sessions that are now full (so other platforms stop selling them)
  if (!c.touched.size) return;
  const org = await orgById(c.db, c.orgId);
  const { data } = await c.db.from("booking_sessions").select("id").in("id", [...c.touched]).gt("starts_at", new Date().toISOString()).limit(40);
  for (const s of (data ?? []) as { id: string }[]) await syncSessionBlock(c.db, org, s.id).catch(() => undefined);
}

export async function importBookly(db: SupabaseClient, orgId: string, p: BooklyPayload) {
  const c = await loadCtx(db, orgId, p.tz);
  const services = new Map((p.services ?? []).map((s) => [String(s.id), s]));
  const rows: Row[] = [];
  let ignored = 0;
  for (const a of (p.appointments ?? []).slice(0, 2000)) {
    const m = LOCAL.exec(String(a.start ?? ""));
    const name = String(a.customer?.name ?? "").trim();
    if (!m || !a.ca_id || !name || /^n\/?a$/i.test(name)) { ignored++; continue; } // Google Calendar blocks have no customer
    const tz = a.tz && /^[A-Za-z_]+\/[A-Za-z_/+-]+$/.test(a.tz) ? a.tz : c.tz;
    const startsAt = zonedTimeUTC(m[1], `${m[2]}:${m[3]}`, tz);
    const e = LOCAL.exec(String(a.end ?? ""));
    const endsAt = e ? zonedTimeUTC(e[1], `${e[2]}:${e[3]}`, tz) : null;
    const svc = a.service_id != null ? services.get(String(a.service_id)) : undefined;
    const title = (svc?.title ?? a.service_title ?? "").trim();
    if (!title) { ignored++; continue; }
    const paid = a.payment && /complete|paid/i.test(String(a.payment.status ?? "")) ? Number(a.payment.paid ?? a.payment.total ?? 0) || 0 : 0;
    const classBento = /class\s*bento/i.test(name) || /class\s*bento/i.test(String(a.notes ?? ""));
    rows.push({
      externalRef: `bookly:${a.ca_id}`, source: classBento ? "classbento" : "bookly", courseKey: a.service_id != null ? `bookly:${a.service_id}` : `name:${title.toLowerCase()}`, courseTitle: title,
      serviceDuration: svc?.duration ?? null, servicePrice: svc?.price != null ? Number(svc.price) : undefined, serviceCapacity: svc?.capacity_max ?? null,
      startsAt, endsAt, seats: Math.max(1, Math.min(100, Number(a.persons ?? 1) || 1)), status: mapStatus(a.status, endsAt ? Date.parse(endsAt) < Date.now() : false),
      name: name.replace(/\s*\(class\s*bento\)\s*/i, " ").trim().slice(0, 160) || name, email: cleanEmail(a.customer?.email), phone: cleanPhone(a.customer?.phone),
      notes: a.notes ? String(a.notes) : null, paid, createdAt: a.created && LOCAL.test(a.created) ? new Date(zonedTimeUTC(a.created.slice(0, 10), a.created.slice(11, 16), tz)).toISOString() : null,
    });
  }
  const r = await upsertRows(c, rows);
  await finish(c);
  return { ...r, ignored, received: (p.appointments ?? []).length };
}

/** CSV rows (already parsed in the browser): date, time, course, name, email, phone, seats, status, reference. */
export interface CsvRow { date: string; time: string; course: string; name: string; email?: string; phone?: string; seats?: string; status?: string; ref?: string; source?: string; paid?: string }

export async function importCsv(db: SupabaseClient, orgId: string, list: CsvRow[]) {
  const c = await loadCtx(db, orgId);
  const rows: Row[] = [];
  let ignored = 0;
  for (const [i, x] of list.slice(0, 3000).entries()) {
    const d = parseDate(x.date);
    const t = parseTime(x.time);
    const name = (x.name ?? "").trim();
    const course = (x.course ?? "").trim();
    if (!d || !t || !name || !course) { ignored++; continue; }
    const startsAt = zonedTimeUTC(d, t, c.tz);
    const src = /bento/i.test(x.source ?? "") ? "classbento" : /bookly/i.test(x.source ?? "") ? "bookly" : /woo/i.test(x.source ?? "") ? "woocommerce" : "import";
    rows.push({
      externalRef: x.ref?.trim() ? `${src}:${x.ref.trim().slice(0, 100)}` : `import:${d}:${t}:${course.toLowerCase()}:${(cleanEmail(x.email) ?? name).toLowerCase()}:${i}`.slice(0, 120),
      source: src, courseKey: `name:${course.toLowerCase()}`, courseTitle: course, startsAt, endsAt: null,
      seats: Math.max(1, Math.min(100, parseInt(x.seats ?? "1", 10) || 1)), status: mapStatus(x.status, Date.parse(startsAt) < Date.now()),
      name: name.slice(0, 160), email: cleanEmail(x.email), phone: cleanPhone(x.phone), notes: null, paid: Number(String(x.paid ?? "").replace(/[^\d.]/g, "")) || 0, createdAt: null,
    });
  }
  const r = await upsertRows(c, rows);
  await finish(c);
  return { ...r, ignored, received: list.length };
}

