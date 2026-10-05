import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { artFor, certDate, hoursLabel, readDesign, type CertData, type CertDesign } from "./certificate";
import { certificatePdf, fetchImage } from "./certificate-pdf";
import { orgById, type PublicOrg } from "./server";

export interface CertRow {
  id: string; organisation_id: string; number: string; booking_id: string | null; student_id: string | null; course_id: string | null; person_name: string; course_name: string;
  completed_on: string; hours: number | null; attendee_index: number; verify_token: string; status: string; created_at: string;
  file_path?: string | null; // original file for certificates made before EventureOS
}
export const CERT_COLS = "id, organisation_id, number, booking_id, student_id, course_id, person_name, course_name, completed_on, hours, attendee_index, verify_token, status, created_at, file_path";

export async function loadTemplate(db: SupabaseClient, orgId: string): Promise<{ id: string; design: CertDesign; auto_issue: boolean } | null> {
  const { data, error } = await db.from("booking_certificate_templates").select("id, design, auto_issue").eq("organisation_id", orgId).eq("is_default", true).maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, design: readDesign(data.design), auto_issue: !!data.auto_issue };
}

export const verifyUrl = (org: Pick<PublicOrg, "slug">, token: string) => `${appBaseUrl()}/book/${org.slug}/certificate/${token}`;
export const pdfUrl = (token: string) => `${appBaseUrl()}/api/book/certificate/${token}`;

export function certData(org: PublicOrg, c: Pick<CertRow, "person_name" | "course_name" | "completed_on" | "hours" | "number" | "verify_token" | "course_id">, design?: CertDesign | null): CertData {
  return { name: c.person_name, course: c.course_name, date: certDate(c.completed_on), hours: c.hours ? hoursLabel(Number(c.hours) * 60) : null, number: c.number, business: org.name, verifyUrl: verifyUrl(org, c.verify_token),
    points: c.course_id ? design?.skills[c.course_id] ?? [] : [] };
}

async function nextNumber(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.rpc("next_org_number", { org: orgId, counter_key: "certificate", start_at: 1001 });
  if (error) throw new Error(error.message);
  return `C-${data}`;
}

interface BookingForCert {
  id: string; organisation_id: string; student_id: string | null; status: string; seats: number; attendees: { name: string }[]; contact_name: string; contact_email?: string | null;
  course: { id: string; name: string; duration_minutes: number } | null; session: { starts_at: string; ends_at: string } | null;
}

/** Certificates for everyone on a booking (one per person). Skips people who already have one. Returns how many were made. */
export async function issueForBooking(db: SupabaseClient, org: PublicOrg, b: BookingForCert, issuedBy: string | null = null) {
  if (!b.course || !b.session || !["confirmed", "attended"].includes(b.status)) return 0;
  // The business's own seat-filler bookings (booked under its own email) aren't people
  if (b.contact_email && org.contact_email && b.contact_email.toLowerCase() === org.contact_email.toLowerCase()) return 0;
  const { data: have } = await db.from("booking_certificates").select("attendee_index").eq("booking_id", b.id);
  const done = new Set(((have ?? []) as { attendee_index: number }[]).map((h) => h.attendee_index));
  const names = (b.attendees ?? []).map((a) => (a?.name ?? "").trim());
  const completed = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date(b.session.starts_at));
  let n = 0;
  for (let i = 0; i < Math.max(1, b.seats); i++) {
    if (done.has(i)) continue;
    const person = names[i] && !/^guest \d+$/i.test(names[i]) ? names[i] : i === 0 ? b.contact_name : null;
    if (!person) continue; // unnamed extra seats: the office can add the name and issue later
    const { error } = await db.from("booking_certificates").insert({
      organisation_id: org.id, number: await nextNumber(db, org.id), booking_id: b.id, student_id: i === 0 ? b.student_id : null, course_id: b.course.id,
      person_name: person.slice(0, 160), course_name: b.course.name.replace(/\s*\(\d+\s*hrs?\)\s*$/i, "").slice(0, 160), completed_on: completed,
      hours: Math.round((b.course.duration_minutes / 60) * 100) / 100, attendee_index: i, issued_by: issuedBy,
    });
    if (!error) n++;
    else if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  return n;
}

const BOOKING_COLS = "id, organisation_id, student_id, status, seats, attendees, contact_name, contact_email, course:booking_courses(id, name, duration_minutes), session:booking_sessions!inner(starts_at, ends_at)";

/** Everyone whose class has finished and who doesn't have a certificate yet (including imported history). */
export { BOOKING_COLS };

export async function issueDue(db: SupabaseClient, orgId: string, limit = 400) {
  const org = await orgById(db, orgId);
  const { data, error } = await db.from("bookings").select(BOOKING_COLS).eq("organisation_id", orgId).in("status", ["confirmed", "attended"])
    .lt("session.ends_at", new Date().toISOString()).order("created_at").limit(3000);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as unknown as BookingForCert[];
  if (!list.length) return 0;
  const ids = list.map((b) => b.id);
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: c } = await db.from("booking_certificates").select("booking_id").in("booking_id", ids.slice(i, i + 300));
    for (const r of c ?? []) have.add(r.booking_id as string);
  }
  let n = 0;
  for (const b of list.filter((x) => !have.has(x.id)).slice(0, limit)) n += await issueForBooking(db, org, b);
  return n;
}

/** Background: issue certificates for every business that has switched them on. */
export async function runCertificateJobs(db: SupabaseClient) {
  const { data } = await db.from("booking_certificate_templates").select("organisation_id").eq("is_default", true).eq("auto_issue", true);
  let n = 0;
  for (const t of (data ?? []) as { organisation_id: string }[]) n += await issueDue(db, t.organisation_id, 200).catch(() => 0);
  return n;
}

export async function certificateByToken(token: string, db = createServiceClient()) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await db.from("booking_certificates").select(CERT_COLS).eq("verify_token", token).maybeSingle();
  return data as CertRow | null;
}

/** PDF bytes for a certificate (uses the business's current design). */
export async function renderCertificate(db: SupabaseClient, c: CertRow) {
  const org = await orgById(db, c.organisation_id);
  const tpl = await loadTemplate(db, c.organisation_id);
  const design = tpl?.design ?? readDesign({ accent: org.brand_colour ?? undefined });
  const art = artFor(design);
  const [logo, background, photo, artBytes] = await Promise.all([design.showLogo ? fetchImage(org.logo_url) : null, design.background ? fetchImage(design.background) : null, design.photo ? fetchImage(design.photo) : null, art ? fetchImage(art) : null]);
  return { bytes: await certificatePdf(design, certData(org, c, design), logo, background, photo, artBytes), org };
}

/** Certificates for a student: theirs by student id, plus any issued on their bookings. */
export async function certificatesForStudent(db: SupabaseClient, orgId: string, studentId: string, bookingIds: string[]) {
  const q = db.from("booking_certificates").select(CERT_COLS).eq("organisation_id", orgId).eq("status", "issued");
  const { data } = bookingIds.length ? await q.or(`student_id.eq.${studentId},booking_id.in.(${bookingIds.join(",")})`) : await q.eq("student_id", studentId);
  return ((data ?? []) as CertRow[]).sort((a, b) => b.completed_on.localeCompare(a.completed_on));
}

/**
 * Same-day certificate emails: about an hour after a class, each booking with new certificates gets a thank-you email
 * with the PDFs attached (any booking source — website, office, Bookly, ClassBento). Never for imported history.
 */
export async function sendCertificateEmails(db: SupabaseClient) {
  const { emailConfigured, sendEmail } = await import("@/lib/email/send");
  const { thankYouEmail } = await import("./emails");
  const { bookUrl, brandOf } = await import("./server");
  if (!emailConfigured()) return 0;
  const since = new Date(Date.now() - 3 * 86400e3).toISOString(), until = new Date(Date.now() - 45 * 60e3).toISOString();
  const { data } = await db.from("booking_certificates").select(`${CERT_COLS}, booking:bookings!inner(id, contact_name, contact_email, followup_sent_at, session:booking_sessions!inner(ends_at), course:booking_courses(gift_enabled))`)
    .is("emailed_at", null).eq("status", "issued").gt("booking.session.ends_at", since).lt("booking.session.ends_at", until).limit(200);
  type Row = CertRow & { booking: { id: string; contact_name: string; contact_email: string | null; followup_sent_at: string | null; course: { gift_enabled: boolean } | null } };
  const byBooking = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) byBooking.set(r.booking.id, [...(byBooking.get(r.booking.id) ?? []), r]);
  let sent = 0;
  // Only for businesses that have switched on "Email certificates automatically"
  const on = new Map<string, boolean>();
  for (const [bookingId, certs] of byBooking) {
    const orgId = certs[0].organisation_id;
    if (!on.has(orgId)) on.set(orgId, !!(await loadTemplate(db, orgId))?.design.emailAuto);
    if (!on.get(orgId)) continue;
    const b = certs[0].booking;
    const ids = certs.map((c) => c.id);
    if (!b.contact_email) { await db.from("booking_certificates").update({ emailed_at: new Date().toISOString() }).in("id", ids); continue; }
    const org = await orgById(db, certs[0].organisation_id);
    const attachments: { filename: string; content: string }[] = [];
    for (const c of certs) {
      try { const { bytes } = await renderCertificate(db, c); attachments.push({ filename: `${c.course_name} - ${c.person_name}.pdf`.replace(/[^\w\s.-]+/g, ""), content: Buffer.from(bytes).toString("base64") }); }
      catch (e) { console.error("certificate attach", e); }
    }
    const m = thankYouEmail(brandOf(org), {
      firstName: b.contact_name.split(/\s+/)[0], course: certs[0].course_name, reviewUrl: org.settings.review_url, bookUrl: bookUrl(org),
      giftUrl: b.course?.gift_enabled ? bookUrl(org, "/gift") : null, social: org.settings.social,
      certificateUrl: bookUrl(org, `/certificate/${certs[0].verify_token}`), accountUrl: bookUrl(org, "/account"),
    });
    try {
      await sendEmail({ to: b.contact_email, subject: certs.length > 1 ? `Your certificates — ${certs[0].course_name}` : `Your certificate — ${certs[0].course_name}`,
        html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name, attachments });
      const now = new Date().toISOString();
      await db.from("booking_certificates").update({ emailed_at: now }).in("id", ids);
      // This is the thank-you email too
      if (!b.followup_sent_at) await db.from("bookings").update({ followup_sent_at: now }).eq("id", bookingId);
      sent++;
    } catch (e) { console.error("certificate email", e); }
  }
  return sent;
}
