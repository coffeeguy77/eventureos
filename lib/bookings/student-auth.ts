import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/integrations/runtime";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { cleanEmail } from "./core";
import { loginEmail } from "./emails";
import { bookUrl, brandOf, ensureStudent, publicOrg, type PublicOrg } from "./server";

/**
 * Student sign-in: a one-time link by email (no passwords, no EventureOS user account).
 * The link opens a page with a "Sign in" button (so email scanners that open links can't use it up);
 * signing in stores a random token in an http-only cookie for this business's booking pages. Only hashes are stored.
 */

const LINK_MINUTES = 30;
const SESSION_DAYS = 60;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
export const cookieName = (orgId: string) => `eos_student_${orgId.slice(0, 8)}`;

export type LoginResult = { ok: true; message: string } | { ok: false; error: string };

export async function requestLogin(orgSlug: string, rawEmail: string): Promise<LoginResult> {
  const db = createServiceClient();
  const org = await publicOrg(orgSlug, db);
  if (!org) return { ok: false, error: "Not found." };
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter the email address you booked with." };
  const sent = { ok: true as const, message: `If ${email} has booked with ${org.name}, a sign-in link is on its way. Check your inbox (and junk folder).` };

  let { data: st } = await db.from("booking_students").select("id, name").eq("organisation_id", org.id).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!st) {
    // Booked before students were tracked (e.g. a booking with this email but no student record)
    const { data: b } = await db.from("bookings").select("contact_name, contact_phone").eq("organisation_id", org.id).eq("contact_email", email).limit(1).maybeSingle();
    if (!b) return sent; // don't reveal who has booked
    const id = await ensureStudent(db, org.id, { name: b.contact_name as string, email, phone: (b.contact_phone as string) ?? null, source: "website" });
    st = { id, name: b.contact_name };
  }
  // At most 3 links in 15 minutes
  const { count } = await db.from("booking_student_logins").select("id", { count: "exact", head: true }).eq("student_id", st.id).gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 3) return { ok: false, error: "We've sent a few links already — check your inbox, or try again in 15 minutes." };
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("booking_student_logins").insert({ organisation_id: org.id, student_id: st.id, token_hash: sha(token), expires_at: new Date(Date.now() + LINK_MINUTES * 60e3).toISOString() });
  if (error) return { ok: false, error: /booking_student_logins/.test(error.message) ? "Sign-in is being set up — please try again soon." : error.message };
  if (!emailConfigured()) return { ok: false, error: "Email isn't set up yet — please contact us." };
  const m = loginEmail(brandOf(org), { firstName: String(st.name).split(/\s+/)[0] || "there", url: bookUrl(org, `/account/verify?t=${token}`), minutes: LINK_MINUTES });
  try { await sendEmail({ to: email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name }); }
  catch { return { ok: false, error: "We couldn't send the email just now — please try again." }; }
  return sent;
}

/** Use a sign-in link: returns a session token to put in the cookie, or why it didn't work. */
export async function consumeLogin(org: PublicOrg, token: string): Promise<{ ok: true; session: string } | { ok: false; error: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That sign-in link isn't valid." };
  const db = createServiceClient();
  const { data: l } = await db.from("booking_student_logins").select("id, student_id, expires_at, used_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (!l) return { ok: false, error: "That sign-in link isn't valid." };
  if (l.used_at) return { ok: false, error: "That link has already been used — ask for a new one." };
  if (Date.parse(l.expires_at as string) < Date.now()) return { ok: false, error: "That link has expired — ask for a new one." };
  const { data: claimed } = await db.from("booking_student_logins").update({ used_at: new Date().toISOString() }).eq("id", l.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has already been used — ask for a new one." };
  const session = randomBytes(32).toString("hex");
  await db.from("booking_student_sessions").insert({ organisation_id: org.id, student_id: l.student_id, token_hash: sha(session), expires_at: new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString() });
  return { ok: true, session };
}

export async function setSessionCookie(org: PublicOrg, session: string) {
  (await cookies()).set(cookieName(org.id), session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/book/${org.slug}`, maxAge: SESSION_DAYS * 86400 });
}

export interface Student { id: string; name: string; email: string | null; phone: string | null; marketing_ok: boolean; certificate_requested_at: string | null }

/** The signed-in student on this business's pages, or null. */
export async function currentStudent(org: PublicOrg): Promise<Student | null> {
  const token = (await cookies()).get(cookieName(org.id))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createServiceClient();
  const { data: s } = await db.from("booking_student_sessions").select("id, student_id, expires_at, last_seen_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (!s || Date.parse(s.expires_at as string) < Date.now()) return null;
  if (Date.now() - Date.parse(s.last_seen_at as string) > 3600e3) await db.from("booking_student_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  const { data: st } = await db.from("booking_students").select("id, name, email, phone, marketing_ok, certificate_requested_at").eq("id", s.student_id).maybeSingle();
  return (st as Student) ?? null;
}

export async function signOut(org: PublicOrg) {
  const jar = await cookies();
  const token = jar.get(cookieName(org.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await createServiceClient().from("booking_student_sessions").delete().eq("organisation_id", org.id).eq("token_hash", sha(token));
  jar.set(cookieName(org.id), "", { path: `/book/${org.slug}`, maxAge: 0 });
}
