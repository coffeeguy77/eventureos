import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { cleanEmail, cleanPhone, normCode, sessionWhen } from "./core";
import { caseManagerBookingEmail, caseManagerCertificateEmail, caseManagerLoginEmail } from "./emails";
import { bookUrl, brandOf, emailBits, loadBooking, orgById, type PublicOrg } from "./server";
import { listName, maskEmail, type CaseManagerInput } from "./agents-core";
export { listName, maskEmail, parseCaseManagerList, type CaseManagerInput } from "./agents-core";

/**
 * Employment agency case managers.
 * - After the agency code, a case manager picks their name from a list (or adds themselves) → a "book" session: they can book job seekers.
 * - Seeing their job seekers needs an emailed one-time link (only ever sent to the email on file) → a "portal" session.
 * Every booking they make is linked to them, so they get the course details to forward and the certificate afterwards.
 */

const LINK_MINUTES = 30;
const BOOK_DAYS = 30, PORTAL_DAYS = 30;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const agentCookie = (orgId: string) => `eos_agent_${orgId.slice(0, 8)}`;
export const portalUrl = (org: Pick<PublicOrg, "slug">) => bookUrl(org, "/agency");
export type R<T = string> = { ok: true; data: T } | { ok: false; error: string };

export interface Agency { id: string; name: string; code: string; price: number | null; po_required: boolean }
export interface CaseManager { id: string; agency_id: string; name: string; email: string; phone: string | null; site: string | null; active: boolean }
const CM_COLS = "id, agency_id, name, email, phone, site, active";
const AGENCY_COLS = "id, name, code, price, po_required";

export async function agencyByCode(db: SupabaseClient, orgId: string, code: string): Promise<Agency | null> {
  const c = normCode(code ?? "");
  if (c.length < 3) return null;
  const { data } = await db.from("booking_agencies").select(AGENCY_COLS).eq("organisation_id", orgId).eq("code", c).eq("active", true).maybeSingle();
  return (data as Agency) ?? null;
}

/** The pick-your-name list for an agency (most recently used first). */
export async function caseManagerList(db: SupabaseClient, agencyId: string) {
  const { data, error } = await db.from("booking_case_managers").select("id, name, site, last_used_at").eq("agency_id", agencyId).eq("active", true)
    .order("last_used_at", { ascending: false, nullsFirst: false }).order("name").limit(300);
  if (error) return null; // before the 0052 update
  return ((data ?? []) as { id: string; name: string; site: string | null }[]).map((c) => ({ id: c.id, label: listName(c.name), site: c.site }));
}

export async function caseManagerById(db: SupabaseClient, orgId: string, id: string, agencyId?: string): Promise<CaseManager | null> {
  if (!UUID.test(id)) return null;
  let q = db.from("booking_case_managers").select(CM_COLS).eq("organisation_id", orgId).eq("id", id);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data } = await q.maybeSingle();
  return (data as CaseManager) ?? null;
}


/**
 * Add a case manager (or find them by email). An existing person's name and email are never changed from the public form,
 * so nobody can take over someone else's entry; blank phone/office details are filled in.
 */
export async function addCaseManager(db: SupabaseClient, orgId: string, agencyId: string, p: CaseManagerInput, source: "office" | "import" | "booking" | "self"): Promise<R<CaseManager>> {
  const name = (p.name ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const email = cleanEmail(p.email ?? "");
  if (name.length < 2) return { ok: false, error: "Enter the case manager's name." };
  if (!email) return { ok: false, error: "Enter the case manager's work email." };
  const phone = cleanPhone(p.phone ?? null), site = p.site?.trim().slice(0, 160) || null;
  const { data: found } = await db.from("booking_case_managers").select(CM_COLS).eq("agency_id", agencyId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (found) {
    const f = found as CaseManager;
    const patch: Record<string, unknown> = {};
    if (phone && !f.phone) patch.phone = phone;
    if (site && !f.site) patch.site = site;
    if (!f.active && (source === "office" || source === "import")) patch.active = true;
    if (source === "office" && name !== f.name) patch.name = name;
    if (!f.active && !patch.active) return { ok: false, error: "That email isn't set up to book — please contact us." };
    if (Object.keys(patch).length) await db.from("booking_case_managers").update(patch).eq("id", f.id);
    return { ok: true, data: { ...f, ...patch } as CaseManager };
  }
  const { data, error } = await db.from("booking_case_managers").insert({ organisation_id: orgId, agency_id: agencyId, name, email, phone, site, source }).select(CM_COLS).single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return addCaseManager(db, orgId, agencyId, p, source);
    return { ok: false, error: /booking_case_managers/.test(error.message) ? "Case manager sign-in is being set up — please try again soon." : error.message };
  }
  return { ok: true, data: data as CaseManager };
}

/* ------------------------------------------------------------------ sessions */

export async function startAgentSession(org: PublicOrg, caseManagerId: string, scope: "book" | "portal") {
  const db = createServiceClient();
  const token = randomBytes(32).toString("hex");
  const days = scope === "portal" ? PORTAL_DAYS : BOOK_DAYS;
  await db.from("booking_case_manager_sessions").insert({ organisation_id: org.id, case_manager_id: caseManagerId, scope, token_hash: sha(token), expires_at: new Date(Date.now() + days * 86400e3).toISOString() });
  await db.from("booking_case_managers").update({ last_used_at: new Date().toISOString() }).eq("id", caseManagerId);
  (await cookies()).set(agentCookie(org.id), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: days * 86400 });
}

export interface Agent { scope: "book" | "portal"; cm: CaseManager; agency: Agency }

/** The case manager using these booking pages (if any). */
export async function currentAgent(org: PublicOrg): Promise<Agent | null> {
  const token = (await cookies()).get(agentCookie(org.id))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createServiceClient();
  const { data: s, error } = await db.from("booking_case_manager_sessions").select("id, case_manager_id, scope, expires_at, last_seen_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (error || !s || Date.parse(s.expires_at as string) < Date.now()) return null;
  const { data: cm } = await db.from("booking_case_managers").select(CM_COLS).eq("id", s.case_manager_id).maybeSingle();
  if (!cm || !(cm as CaseManager).active) return null;
  const { data: a } = await db.from("booking_agencies").select(AGENCY_COLS).eq("id", (cm as CaseManager).agency_id).eq("active", true).maybeSingle();
  if (!a) return null;
  if (Date.now() - Date.parse(s.last_seen_at as string) > 3600e3) await db.from("booking_case_manager_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  return { scope: s.scope as "book" | "portal", cm: cm as CaseManager, agency: a as Agency };
}

export async function agentSignOut(org: PublicOrg) {
  const jar = await cookies();
  const token = jar.get(agentCookie(org.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await createServiceClient().from("booking_case_manager_sessions").delete().eq("organisation_id", org.id).eq("token_hash", sha(token));
  jar.set(agentCookie(org.id), "", { path: "/", maxAge: 0 });
}

/** Email a one-time sign-in link to the case manager's own email address (the one on file — never one typed in). */
export async function requestAgentLink(org: PublicOrg, caseManagerId: string): Promise<R> {
  const db = createServiceClient();
  const cm = await caseManagerById(db, org.id, caseManagerId);
  if (!cm || !cm.active) return { ok: false, error: "Please choose your name again." };
  const masked = maskEmail(cm.email);
  const { count } = await db.from("booking_case_manager_logins").select("id", { count: "exact", head: true }).eq("case_manager_id", cm.id).gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 3) return { ok: false, error: `We've sent a few links to ${masked} already — check that inbox (and junk), or try again in 15 minutes.` };
  if (!emailConfigured()) return { ok: false, error: "Email isn't set up yet — please contact us." };
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("booking_case_manager_logins").insert({ organisation_id: org.id, case_manager_id: cm.id, token_hash: sha(token), expires_at: new Date(Date.now() + LINK_MINUTES * 60e3).toISOString() });
  if (error) return { ok: false, error: "Couldn't create your link — please try again." };
  const { data: a } = await db.from("booking_agencies").select("name").eq("id", cm.agency_id).single();
  const m = caseManagerLoginEmail(brandOf(org), { firstName: cm.name.split(/\s+/)[0], agency: String(a?.name ?? "agency"), url: bookUrl(org, `/agency/verify?t=${token}`), minutes: LINK_MINUTES });
  try { await sendEmail({ to: cm.email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name }); }
  catch { return { ok: false, error: "We couldn't send the email just now — please try again." }; }
  return { ok: true, data: `We've emailed a sign-in link to ${masked}. It works once, for ${LINK_MINUTES} minutes.` };
}

export async function consumeAgentLink(org: PublicOrg, token: string): Promise<R> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That sign-in link isn't valid." };
  const db = createServiceClient();
  const { data: l } = await db.from("booking_case_manager_logins").select("id, case_manager_id, expires_at, used_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (!l) return { ok: false, error: "That sign-in link isn't valid." };
  if (l.used_at) return { ok: false, error: "That link has already been used — ask for a new one." };
  if (Date.parse(l.expires_at as string) < Date.now()) return { ok: false, error: "That link has expired — ask for a new one." };
  const { data: claimed } = await db.from("booking_case_manager_logins").update({ used_at: new Date().toISOString() }).eq("id", l.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has already been used — ask for a new one." };
  await startAgentSession(org, l.case_manager_id as string, "portal");
  return { ok: true, data: "Signed in." };
}

/* ------------------------------------------------------------------ the portal */

export interface JobSeeker {
  id: string; reference: string; status: string; name: string; email: string | null; phone: string | null; po: string | null; site: string | null; manageToken: string;
  course: string; startsAt: string; endsAt: string; when: string; time: string; state: "upcoming" | "waitlist" | "completed" | "no_show" | "cancelled";
  certificates: { number: string; token: string; name: string }[];
}

export async function agentJobSeekers(db: SupabaseClient, org: PublicOrg, caseManagerId: string): Promise<JobSeeker[]> {
  const { data } = await db.from("bookings").select("id, reference, status, contact_name, contact_email, contact_phone, po_number, po_site, manage_token, session:booking_sessions(starts_at, ends_at), course:booking_courses(name)")
    .eq("organisation_id", org.id).eq("case_manager_id", caseManagerId).in("status", ["confirmed", "attended", "waitlist", "no_show", "cancelled"]).order("created_at", { ascending: false }).limit(1000);
  type B = { id: string; reference: string; status: string; contact_name: string; contact_email: string | null; contact_phone: string | null; po_number: string | null; po_site: string | null; manage_token: string;
    session: { starts_at: string; ends_at: string } | null; course: { name: string } | null };
  const rows = ((data ?? []) as unknown as B[]).filter((b) => b.session && b.course);
  const certs = new Map<string, { number: string; token: string; name: string }[]>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data: c } = await db.from("booking_certificates").select("booking_id, number, verify_token, person_name").in("booking_id", rows.slice(i, i + 200).map((r) => r.id)).eq("status", "issued");
    for (const x of (c ?? []) as { booking_id: string; number: string; verify_token: string; person_name: string }[]) certs.set(x.booking_id, [...(certs.get(x.booking_id) ?? []), { number: x.number, token: x.verify_token, name: x.person_name }]);
  }
  const now = Date.now();
  return rows.map((b) => {
    const w = sessionWhen(b.session!.starts_at, b.session!.ends_at, org.timezone);
    const ended = Date.parse(b.session!.ends_at) < now;
    const state: JobSeeker["state"] = b.status === "cancelled" ? "cancelled" : b.status === "no_show" ? "no_show" : b.status === "waitlist" ? "waitlist" : b.status === "attended" || ended ? "completed" : "upcoming";
    return { id: b.id, reference: b.reference, status: b.status, name: b.contact_name, email: b.contact_email, phone: b.contact_phone, po: b.po_number, site: b.po_site, manageToken: b.manage_token,
      course: b.course!.name, startsAt: b.session!.starts_at, endsAt: b.session!.ends_at, when: w.day, time: w.time, state, certificates: certs.get(b.id) ?? [] };
  });
}

/* ------------------------------------------------------------------ emails to the case manager */

/** After an agency booking is confirmed or waitlisted: the course details for the case manager to forward. Once per booking. */
export async function notifyCaseManager(db: SupabaseClient, bookingId: string, force = false): Promise<boolean> {
  const { data: link, error } = await db.from("bookings").select("case_manager_id, case_manager_notified_at").eq("id", bookingId).maybeSingle();
  if (error || !link?.case_manager_id || (link.case_manager_notified_at && !force)) return false;
  const b = await loadBooking(db, bookingId);
  if (!b || !["confirmed", "waitlist"].includes(b.status)) return false;
  const org = await orgById(db, b.organisation_id);
  const cm = await caseManagerById(db, org.id, link.case_manager_id as string);
  if (!cm || !emailConfigured()) return false;
  const { data: a } = await db.from("booking_agencies").select("name").eq("id", cm.agency_id).single();
  const bits = emailBits(org, b);
  const m = caseManagerBookingEmail(brandOf(org), {
    firstName: cm.name.split(/\s+/)[0], student: b.contact_name, studentEmail: b.contact_email, course: b.course.name, reference: b.reference, when: bits.w.day, time: bits.w.time,
    location: b.course.location, whatToBring: b.course.what_to_bring, po: b.po_number, agency: String(a?.name ?? "your agency"), manageUrl: bits.manageUrl, googleUrl: bits.googleUrl,
    portalUrl: portalUrl(org), waitlist: b.status === "waitlist",
  });
  try {
    await sendEmail({ to: cm.email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name });
    await db.from("bookings").update({ case_manager_notified_at: new Date().toISOString() }).eq("id", bookingId);
    return true;
  } catch (e) { console.error("case manager email", e); return false; }
}

/** Background: each finished job seeker's certificate goes to their case manager too (PDF attached). */
export async function sendCaseManagerCertificates(db: SupabaseClient) {
  if (!emailConfigured()) return 0;
  const since = new Date(Date.now() - 7 * 86400e3).toISOString(), until = new Date(Date.now() - 45 * 60e3).toISOString();
  const { data, error } = await db.from("booking_certificates")
    .select("id, organisation_id, number, booking_id, student_id, course_id, person_name, course_name, completed_on, hours, attendee_index, verify_token, status, created_at, booking:bookings!inner(case_manager_id, session:booking_sessions!inner(ends_at))")
    .is("case_manager_emailed_at", null).eq("status", "issued").not("booking.case_manager_id", "is", null).gt("booking.session.ends_at", since).lt("booking.session.ends_at", until).limit(100);
  if (error) return 0;
  const { renderCertificate } = await import("./certificates");
  const { certDate } = await import("./certificate");
  type Row = Parameters<typeof renderCertificate>[1] & { booking: { case_manager_id: string } };
  let sent = 0;
  for (const c of (data ?? []) as unknown as Row[]) {
    const org = await orgById(db, c.organisation_id);
    const cm = await caseManagerById(db, org.id, c.booking.case_manager_id);
    const now = new Date().toISOString();
    if (!cm) { await db.from("booking_certificates").update({ case_manager_emailed_at: now }).eq("id", c.id); continue; }
    try {
      const { bytes } = await renderCertificate(db, c);
      const m = caseManagerCertificateEmail(brandOf(org), { firstName: cm.name.split(/\s+/)[0], student: c.person_name, course: c.course_name, date: certDate(c.completed_on),
        certificateUrl: bookUrl(org, `/certificate/${c.verify_token}`), portalUrl: portalUrl(org) });
      await sendEmail({ to: cm.email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name,
        attachments: [{ filename: `${c.course_name} - ${c.person_name}.pdf`.replace(/[^\w\s.-]+/g, ""), content: Buffer.from(bytes).toString("base64") }] });
      await db.from("booking_certificates").update({ case_manager_emailed_at: now }).eq("id", c.id);
      sent++;
    } catch (e) {
      console.error("case manager certificate", e);
      if (/429|rate/i.test(String(e))) break;
    }
  }
  return sent;
}

