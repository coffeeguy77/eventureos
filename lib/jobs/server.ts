import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { cleanEmail, cleanPhone } from "@/lib/bookings/core";
import { brandOf, publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { availabilitySummary, cleanInstagram, cleanWebsite, DAYS, fillLetter, km, publicName, readAvailability, readEquipment, readJobSettings, SKILLS, WORK_TYPES, type Availability, type Equipment, type JobSettings } from "./core";
import { employerLoginEmail, jobNoticeEmail, welcomeLetterEmail } from "./emails";

export type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
export const jobsUrl = (org: Pick<PublicOrg, "slug">, path = "") => `${appBaseUrl()}/jobs/${org.slug}${path}`;

export interface JobsOrg extends PublicOrg { jobs: JobSettings }
export async function jobsOrg(slug: string, db = createServiceClient()): Promise<JobsOrg | null> {
  const org = await publicOrg(slug, db);
  if (!org) return null;
  return { ...org, jobs: readJobSettings(org.rawSettings, org.name) };
}

/* ------------------------------------------------------------------ places */

/** Suburb → map position, via OpenStreetMap (cached). Returns null if it can't be found. */
export async function geocode(db: SupabaseClient, suburb: string, state?: string | null): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = `${suburb.trim()}${state ? ` ${state}` : ""}, Australia`.toLowerCase().replace(/\s+/g, " ").slice(0, 160);
  if (suburb.trim().length < 2) return null;
  const { data: hit } = await db.from("geo_cache").select("lat, lng, label").eq("query", q).maybeSingle();
  if (hit) return hit.lat == null ? null : { lat: Number(hit.lat), lng: Number(hit.lng), label: String(hit.label ?? suburb) };
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json"); u.searchParams.set("limit", "1"); u.searchParams.set("countrycodes", "au"); u.searchParams.set("q", q);
    const res = await fetch(u, { headers: { "User-Agent": "EventureOS job board (https://www.eventureos.com.au)", "Accept-Language": "en-AU" }, cache: "no-store" });
    const list = res.ok ? ((await res.json()) as { lat: string; lon: string; display_name: string }[]) : [];
    const p = list[0];
    const row = p ? { lat: Number(p.lat), lng: Number(p.lon), label: p.display_name.split(",").slice(0, 2).join(",").trim() } : null;
    await db.from("geo_cache").upsert({ query: q, lat: row?.lat ?? null, lng: row?.lng ?? null, label: row?.label ?? null });
    return row;
  } catch { return null; }
}

/* ------------------------------------------------------------------ baristas */

export interface Profile {
  id: string; student_id: string; status: "draft" | "active" | "hidden"; display_name: string | null; headline: string | null; bio: string | null; photo_url: string | null;
  suburb: string | null; state: string | null; postcode: string | null; lat: number | null; lng: number | null; travel_km: number; experience: string | null;
  skills: string[]; work_types: string[]; availability: Availability; availability_note: string | null; share_email: boolean; share_phone: boolean; show_certificates: boolean;
  activated_at: string | null; last_active_at: string | null;
}
export const PROFILE_COLS = "id, student_id, status, display_name, headline, bio, photo_url, suburb, state, postcode, lat, lng, travel_km, experience, skills, work_types, availability, availability_note, share_email, share_phone, show_certificates, activated_at, last_active_at";

export async function profileFor(db: SupabaseClient, orgId: string, studentId: string, create = true): Promise<Profile | null> {
  const { data } = await db.from("job_profiles").select(PROFILE_COLS).eq("student_id", studentId).maybeSingle();
  if (data) return { ...(data as Profile), availability: readAvailability((data as Profile).availability) };
  if (!create) return null;
  const { data: made, error } = await db.from("job_profiles").insert({ organisation_id: orgId, student_id: studentId }).select(PROFILE_COLS).single();
  if (error) { const { data: again } = await db.from("job_profiles").select(PROFILE_COLS).eq("student_id", studentId).maybeSingle(); return again as Profile | null; }
  return { ...(made as Profile), availability: {} };
}

export interface ProfileInput {
  display_name?: string; headline?: string; bio?: string; suburb?: string; state?: string; postcode?: string; travel_km?: number; experience?: string | null;
  skills?: string[]; work_types?: string[]; availability?: Availability; availability_note?: string; share_email?: boolean; share_phone?: boolean; show_certificates?: boolean;
  status?: "active" | "hidden"; photo_url?: string | null; phone?: string;
}

export async function saveProfile(db: SupabaseClient, org: JobsOrg, studentId: string, p: ProfileInput): Promise<R<Profile>> {
  const prof = await profileFor(db, org.id, studentId);
  if (!prof) return { ok: false, error: "Couldn't load your profile." };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
  const patch: Record<string, unknown> = { last_active_at: new Date().toISOString() };
  if (p.display_name !== undefined) patch.display_name = str(p.display_name, 80);
  if (p.headline !== undefined) patch.headline = str(p.headline, 120);
  if (p.bio !== undefined) patch.bio = typeof p.bio === "string" ? p.bio.trim().slice(0, 1500) || null : null;
  if (p.travel_km !== undefined) patch.travel_km = Math.max(1, Math.min(500, Math.round(Number(p.travel_km) || 20)));
  if (p.experience !== undefined) patch.experience = ["new", "some", "experienced", "pro"].includes(p.experience ?? "") ? p.experience : null;
  if (p.skills !== undefined) patch.skills = p.skills.filter((s) => (SKILLS as readonly string[]).includes(s)).slice(0, 20);
  if (p.work_types !== undefined) patch.work_types = p.work_types.filter((w) => WORK_TYPES.some((x) => x.id === w));
  if (p.availability !== undefined) patch.availability = readAvailability(p.availability);
  if (p.availability_note !== undefined) patch.availability_note = str(p.availability_note, 300);
  if (p.share_email !== undefined) patch.share_email = !!p.share_email;
  if (p.share_phone !== undefined) patch.share_phone = !!p.share_phone;
  if (p.show_certificates !== undefined) patch.show_certificates = !!p.show_certificates;
  if (p.photo_url !== undefined) patch.photo_url = p.photo_url && /^https:\/\//.test(p.photo_url) ? p.photo_url : null;
  if (p.postcode !== undefined) patch.postcode = p.postcode && /^\d{4}$/.test(p.postcode.trim()) ? p.postcode.trim() : null;
  if (p.state !== undefined) patch.state = str(p.state, 10)?.toUpperCase() ?? null;
  if (p.suburb !== undefined) {
    patch.suburb = str(p.suburb, 80);
    if (patch.suburb !== prof.suburb || patch.state !== prof.state) {
      const g = patch.suburb ? await geocode(db, `${patch.suburb as string}${patch.postcode ? ` ${patch.postcode}` : ""}`, (patch.state as string | null) ?? prof.state) : null;
      patch.lat = g?.lat ?? null; patch.lng = g?.lng ?? null;
    }
  }
  if (p.status) {
    if (p.status === "active" && !(patch.suburb ?? prof.suburb)) return { ok: false, error: "Add your suburb first, so employers nearby can find you." };
    patch.status = p.status;
    if (p.status === "active" && !prof.activated_at) patch.activated_at = new Date().toISOString();
  }
  if (p.phone !== undefined) await db.from("booking_students").update({ phone: cleanPhone(p.phone) }).eq("id", studentId);
  const { data, error } = await db.from("job_profiles").update(patch).eq("id", prof.id).select(PROFILE_COLS).single();
  if (error) return { ok: false, error: error.message };
  if (p.status === "active" && !prof.activated_at) await db.from("job_invites").update({ joined_at: new Date().toISOString() }).eq("student_id", studentId).is("joined_at", null);
  return { ok: true, data: { ...(data as Profile), availability: readAvailability((data as Profile).availability) } };
}

/* ------------------------------------------------------------------ jobs */

export interface PostEmployer { business_name: string; suburb: string | null; address?: string | null; state?: string | null; postcode?: string | null; website?: string | null; instagram?: string | null; equipment?: unknown; about?: string | null }
export interface Post { id: string; employer_id: string; title: string; kind: string; description: string | null; suburb: string | null; lat: number | null; lng: number | null; starts_on: string | null; ends_on: string | null; times: string | null; pay: string | null; positions: number; status: string; created_at: string; employer?: PostEmployer | null }
export const POST_COLS = "id, employer_id, title, kind, description, suburb, lat, lng, starts_on, ends_on, times, pay, positions, status, created_at";

/** Open jobs (filled, closed and past ones are hidden). Nearest first when a position is given. */
export async function openPosts(db: SupabaseClient, orgId: string, near?: { lat: number; lng: number } | null) {
  const today = new Date().toISOString().slice(0, 10);
  const q = (cols: string) => db.from("job_posts").select(`${POST_COLS}, employer:job_employers!inner(${cols})`).eq("organisation_id", orgId).eq("status", "open")
    .eq("employer.status", "approved").or(`ends_on.is.null,ends_on.gte.${today}`).order("created_at", { ascending: false }).limit(200);
  let { data, error } = await q("business_name, suburb, status, website, about, address, state, postcode, instagram, equipment");
  if (error && missingCol(error.message)) ({ data } = await q("business_name, suburb, status, website, about"));
  const list = ((data ?? []) as unknown as (Post & { distance?: number | null })[]).filter((p) => !(p.kind === "one_off" || p.kind === "event") || !p.starts_on || (p.ends_on ?? p.starts_on) >= today);
  for (const p of list) p.distance = near && p.lat != null && p.lng != null ? Math.round(km(near, { lat: p.lat, lng: p.lng })) : null;
  if (near) list.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
  return list;
}

/* ------------------------------------------------------------------ employers: sign-in */

const EMP_LINK_MIN = 30, EMP_SESSION_DAYS = 60;
export const employerCookie = (orgId: string) => `eos_employer_${orgId.slice(0, 8)}`;
export interface Employer {
  id: string; business_name: string; contact_name: string; email: string; phone: string | null; website: string | null; suburb: string | null; lat: number | null; lng: number | null; about: string | null;
  status: "pending" | "approved" | "blocked"; address: string | null; state: string | null; postcode: string | null; instagram: string | null; equipment: Equipment[];
}
const EMP_BASE = "id, business_name, contact_name, email, phone, website, suburb, lat, lng, about, status";
const EMP_COLS = `${EMP_BASE}, address, state, postcode, instagram, equipment`;
const missingCol = (m?: string) => !!m && /column .* does not exist|schema cache/i.test(m);
/** Load an employer (works before the 0053 update too — the newer details are then blank). */
async function employerRow(db: SupabaseClient, id: string): Promise<Employer | null> {
  let { data, error } = await db.from("job_employers").select(EMP_COLS).eq("id", id).maybeSingle();
  if (error && missingCol(error.message)) ({ data, error } = await db.from("job_employers").select(EMP_BASE).eq("id", id).maybeSingle());
  if (!data) return null;
  const e = data as Record<string, unknown>;
  return { ...(e as unknown as Employer), address: (e.address as string) ?? null, state: (e.state as string) ?? null, postcode: (e.postcode as string) ?? null, instagram: (e.instagram as string) ?? null, equipment: readEquipment(e.equipment) };
}
export { employerRow };

export interface EmployerDetails { address?: string; state?: string; postcode?: string; website?: string; instagram?: string; equipment?: unknown }
/** The newer business details, cleaned (address, Instagram username, website, gear). */
export function employerExtras(f: EmployerDetails) {
  return {
    address: f.address?.trim().replace(/\s+/g, " ").slice(0, 200) || null,
    state: f.state?.trim().toUpperCase().slice(0, 10) || null,
    postcode: f.postcode && /^\d{4}$/.test(f.postcode.trim()) ? f.postcode.trim() : null,
    instagram: cleanInstagram(f.instagram),
    equipment: readEquipment(f.equipment),
  };
}

async function emailEmployerLink(db: SupabaseClient, org: JobsOrg, emp: { id: string; contact_name: string; email: string }) {
  const { count } = await db.from("job_employer_logins").select("id", { count: "exact", head: true }).eq("employer_id", emp.id).gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 3) return "We've sent a few links already — check your inbox, or try again in 15 minutes.";
  const token = randomBytes(32).toString("hex");
  await db.from("job_employer_logins").insert({ organisation_id: org.id, employer_id: emp.id, token_hash: sha(token), expires_at: new Date(Date.now() + EMP_LINK_MIN * 60e3).toISOString() });
  if (!emailConfigured()) return "Email isn't set up yet — please contact us.";
  const m = employerLoginEmail(brandOf(org), { firstName: emp.contact_name.split(/\s+/)[0], board: org.jobs.name, url: jobsUrl(org, `/employers/verify?t=${token}`), minutes: EMP_LINK_MIN });
  await sendEmail({ to: emp.email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name });
  return null;
}

export async function registerEmployer(slug: string, f: { business: string; name: string; email: string; phone?: string; website?: string; suburb?: string; about?: string } & EmployerDetails): Promise<R> {
  const db = createServiceClient();
  const org = await jobsOrg(slug, db);
  if (!org?.jobs.enabled) return { ok: false, error: "The job board isn't open." };
  const email = cleanEmail(f.email);
  const business = f.business?.trim().slice(0, 120), name = f.name?.trim().slice(0, 120);
  if (!business || business.length < 2) return { ok: false, error: "Enter your business name." };
  if (!name || name.length < 2) return { ok: false, error: "Enter your name." };
  if (!email) return { ok: false, error: "Enter a valid email address." };
  const { data: existing } = await db.from("job_employers").select("id, contact_name, email, status").eq("organisation_id", org.id).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  type Emp = { id: string; contact_name: string; email: string; status: string };
  let emp = existing as Emp | null;
  if (!emp) {
    const extras = employerExtras(f);
    const suburb = f.suburb?.trim().slice(0, 80) || null;
    // Map position from the street address when there is one, else the suburb
    const g = suburb ? await geocode(db, [extras.address, suburb, extras.postcode].filter(Boolean).join(" "), extras.state) ?? await geocode(db, suburb, extras.state) : null;
    const needsApproval = org.jobs.employerApproval;
    const base = { organisation_id: org.id, business_name: business, contact_name: name, email, phone: cleanPhone(f.phone), website: cleanWebsite(f.website),
      suburb, lat: g?.lat ?? null, lng: g?.lng ?? null, about: f.about?.trim().slice(0, 1500) || null,
      status: needsApproval ? "pending" : "approved", approved_at: needsApproval ? null : new Date().toISOString() };
    let { data, error } = await db.from("job_employers").insert({ ...base, ...extras }).select("id, contact_name, email, status").single();
    if (error && missingCol(error.message)) ({ data, error } = await db.from("job_employers").insert(base).select("id, contact_name, email, status").single());
    if (error) return { ok: false, error: /job_employers/.test(error.message) ? "The job board is being set up — try again soon." : error.message };
    emp = data as Emp;
    await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Barista jobs", action: "jobs.employer_signed_up", entity_type: "job_employer", entity_id: emp!.id,
      summary: `${business} (${name}) signed up as an employer${needsApproval ? " — waiting for approval" : ""}` });
    const to = org.settings.notify_email ?? org.contact_email;
    if (to && emailConfigured()) {
      const where = [extras.address, suburb, extras.state, extras.postcode].filter(Boolean).join(", ");
      const m = jobNoticeEmail(brandOf(org), { heading: needsApproval ? `New employer to approve: ${business}` : `New employer on the job board: ${business}`,
        lines: [`${name} · ${email}${f.phone ? ` · ${f.phone}` : ""}`, where ? `Address: ${where}` : "", base.website ? `Website: ${base.website}` : "", extras.instagram ? `Instagram: @${extras.instagram}` : "", f.about ?? "",
          needsApproval ? "" : "They can search and post straight away. You can block them from Bookings → Barista jobs."].filter(Boolean),
        button: { label: needsApproval ? "Review in EventureOS" : "Open in EventureOS", url: `${appBaseUrl()}/bookings/jobs` } });
      await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, fromName: "EventureOS" }).catch(() => undefined);
    }
  }
  if (emp!.status === "blocked") return { ok: true, data: "Thanks — we'll be in touch." };
  const err = await emailEmployerLink(db, org, emp!);
  return err ? { ok: false, error: err } : { ok: true, data: `Check your inbox — we've emailed ${email} a link to sign in.` };
}

export async function requestEmployerLogin(slug: string, rawEmail: string): Promise<R> {
  const db = createServiceClient();
  const org = await jobsOrg(slug, db);
  const email = cleanEmail(rawEmail);
  if (!org || !email) return { ok: false, error: "Enter your email address." };
  const done = { ok: true as const, data: `If ${email} is registered, a sign-in link is on its way.` };
  const { data: emp } = await db.from("job_employers").select("id, contact_name, email, status").eq("organisation_id", org.id).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!emp || emp.status === "blocked") return done;
  const err = await emailEmployerLink(db, org, emp as { id: string; contact_name: string; email: string });
  return err ? { ok: false, error: err } : done;
}

export async function consumeEmployerLogin(org: JobsOrg, token: string): Promise<R> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That sign-in link isn't valid." };
  const db = createServiceClient();
  const { data: l } = await db.from("job_employer_logins").select("id, employer_id, expires_at, used_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (!l || l.used_at) return { ok: false, error: l ? "That link has already been used — ask for a new one." : "That sign-in link isn't valid." };
  if (Date.parse(l.expires_at as string) < Date.now()) return { ok: false, error: "That link has expired — ask for a new one." };
  const { data: claimed } = await db.from("job_employer_logins").update({ used_at: new Date().toISOString() }).eq("id", l.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has already been used." };
  const session = randomBytes(32).toString("hex");
  await db.from("job_employer_sessions").insert({ organisation_id: org.id, employer_id: l.employer_id, token_hash: sha(session), expires_at: new Date(Date.now() + EMP_SESSION_DAYS * 86400e3).toISOString() });
  (await cookies()).set(employerCookie(org.id), session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: EMP_SESSION_DAYS * 86400 });
  return { ok: true, data: "Signed in." };
}

export async function currentEmployer(org: PublicOrg): Promise<Employer | null> {
  const token = (await cookies()).get(employerCookie(org.id))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createServiceClient();
  const { data: s } = await db.from("job_employer_sessions").select("id, employer_id, expires_at, last_seen_at").eq("organisation_id", org.id).eq("token_hash", sha(token)).maybeSingle();
  if (!s || Date.parse(s.expires_at as string) < Date.now()) return null;
  const e = await employerRow(db, s.employer_id as string);
  if (!e || e.status === "blocked") return null;
  if (Date.now() - Date.parse(s.last_seen_at as string) > 3600e3) {
    await db.from("job_employer_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
    await db.from("job_employers").update({ last_active_at: new Date().toISOString() }).eq("id", e.id);
  }
  return e;
}

export async function employerSignOut(org: PublicOrg) {
  const jar = await cookies();
  const token = jar.get(employerCookie(org.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await createServiceClient().from("job_employer_sessions").delete().eq("organisation_id", org.id).eq("token_hash", sha(token));
  jar.set(employerCookie(org.id), "", { path: "/", maxAge: 0 });
}

/* ------------------------------------------------------------------ employer: search */

export interface Card { id: string; name: string; photo_url: string | null; headline: string | null; suburb: string | null; distance: number | null; experience: string | null; skills: string[]; work_types: string[]; availability: Availability; summary: string; certified: string[] }

export async function searchBaristas(db: SupabaseClient, org: JobsOrg, q: { suburb?: string; radius?: number; days?: string[]; skills?: string[]; types?: string[]; text?: string }) {
  const { data } = await db.from("job_profiles").select(`${PROFILE_COLS}, student:booking_students!inner(name)`).eq("organisation_id", org.id).eq("status", "active").limit(3000);
  let list = (data ?? []) as unknown as (Profile & { student: { name: string } })[];
  const center = q.suburb?.trim() ? await geocode(db, q.suburb) : null;
  const radius = Math.max(1, Math.min(500, q.radius ?? 25));
  const days = (q.days ?? []).filter((d) => (DAYS as readonly string[]).includes(d));
  list = list.filter((p) => {
    const av = readAvailability(p.availability);
    if (days.length && !days.every((d) => (av[d as keyof Availability] ?? []).length)) return false;
    if (q.skills?.length && !q.skills.every((s) => p.skills.includes(s))) return false;
    if (q.types?.length && !q.types.some((t) => p.work_types.includes(t))) return false;
    if (q.text?.trim()) { const t = q.text.trim().toLowerCase(); if (![p.headline, p.bio, p.suburb, ...p.skills].some((x) => x?.toLowerCase().includes(t))) return false; }
    if (center) { if (p.lat == null || p.lng == null) return false; if (km(center, { lat: p.lat, lng: p.lng }) > radius) return false; }
    return true;
  });
  // Bean Culture certificates (only if the barista shows them)
  const ids = list.filter((p) => p.show_certificates).map((p) => p.student_id);
  const certs = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: c } = await db.from("booking_certificates").select("student_id, course_name").in("student_id", ids.slice(i, i + 300)).eq("status", "issued");
    for (const r of (c ?? []) as { student_id: string; course_name: string }[]) certs.set(r.student_id, [...new Set([...(certs.get(r.student_id) ?? []), r.course_name])]);
  }
  const cards: Card[] = list.map((p) => {
    const av = readAvailability(p.availability);
    return { id: p.id, name: publicName(p.student.name, p.display_name), photo_url: p.photo_url, headline: p.headline, suburb: p.suburb,
      distance: center && p.lat != null && p.lng != null ? Math.round(km(center, { lat: p.lat, lng: p.lng })) : null,
      experience: p.experience, skills: p.skills, work_types: p.work_types, availability: av, summary: availabilitySummary(av), certified: certs.get(p.student_id) ?? [] };
  });
  cards.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999) || b.certified.length - a.certified.length);
  return { cards, center };
}

/** A barista's profile as an employer sees it. Contact only if shared (on the profile or in a conversation with this employer). */
export async function profileForEmployer(db: SupabaseClient, org: JobsOrg, profileId: string, employerId: string) {
  if (!UUID.test(profileId)) return null;
  const { data } = await db.from("job_profiles").select(`${PROFILE_COLS}, student:booking_students!inner(name, email, phone)`).eq("organisation_id", org.id).eq("id", profileId).eq("status", "active").maybeSingle();
  if (!data) return null;
  const p = data as unknown as Profile & { student: { name: string; email: string | null; phone: string | null } };
  const { data: threads } = await db.from("job_threads").select("id, contact_shared, contact_requested, post_id").eq("profile_id", p.id).eq("employer_id", employerId);
  const shared = (threads ?? []).some((t) => t.contact_shared);
  const { data: certs } = p.show_certificates ? await db.from("booking_certificates").select("course_name, completed_on, verify_token").eq("student_id", p.student_id).eq("status", "issued") : { data: [] };
  return {
    profile: { ...p, availability: readAvailability(p.availability) }, name: publicName(p.student.name, p.display_name),
    email: p.share_email || shared ? p.student.email : null, phone: p.share_phone || shared ? p.student.phone : null,
    threads: (threads ?? []) as { id: string; contact_shared: boolean; contact_requested: boolean; post_id: string | null }[],
    certificates: (certs ?? []) as { course_name: string; completed_on: string; verify_token: string }[],
  };
}

/* ------------------------------------------------------------------ conversations */

export interface Thread { id: string; employer_id: string; profile_id: string; post_id: string | null; started_by: string; contact_requested: boolean; contact_shared: boolean; employer_unread: number; barista_unread: number; last_message_at: string; employer_notified_at: string | null; barista_notified_at: string | null }
export const THREAD_COLS = "id, employer_id, profile_id, post_id, started_by, contact_requested, contact_shared, employer_unread, barista_unread, last_message_at, employer_notified_at, barista_notified_at";

export async function startThread(db: SupabaseClient, org: JobsOrg, o: { employerId: string; profileId: string; postId?: string | null; by: "employer" | "barista"; body: string; requestContact?: boolean }): Promise<R<{ threadId: string }>> {
  const body = o.body.trim().slice(0, 3000);
  if (body.length < 2) return { ok: false, error: "Write a short message." };
  let q = db.from("job_threads").select(THREAD_COLS).eq("employer_id", o.employerId).eq("profile_id", o.profileId);
  q = o.postId ? q.eq("post_id", o.postId) : q.is("post_id", null);
  let { data: t } = await q.maybeSingle();
  if (!t) {
    const { data, error } = await db.from("job_threads").insert({ organisation_id: org.id, employer_id: o.employerId, profile_id: o.profileId, post_id: o.postId ?? null, started_by: o.by, contact_requested: !!o.requestContact }).select(THREAD_COLS).single();
    if (error) return { ok: false, error: error.message };
    t = data;
  } else if (o.requestContact && !t.contact_requested) await db.from("job_threads").update({ contact_requested: true }).eq("id", t.id);
  const r = await postMessage(db, org, t as Thread, o.by, body);
  return r.ok ? { ok: true, data: { threadId: (t as Thread).id } } : r;
}

export async function postMessage(db: SupabaseClient, org: JobsOrg, t: Thread, by: "employer" | "barista" | "system", body: string): Promise<R> {
  const { error } = await db.from("job_messages").insert({ organisation_id: org.id, thread_id: t.id, sender: by, body: body.slice(0, 3000) });
  if (error) return { ok: false, error: error.message };
  const now = new Date().toISOString();
  const to: "employer" | "barista" = by === "employer" ? "barista" : "employer";
  const patch: Record<string, unknown> = { last_message_at: now };
  if (by !== "system") patch[`${to}_unread`] = (to === "employer" ? t.employer_unread : t.barista_unread) + 1;
  // Email the other side (at most every 10 minutes per conversation)
  const last = to === "employer" ? t.employer_notified_at : t.barista_notified_at;
  if (by !== "system" && (!last || Date.now() - Date.parse(last) > 10 * 60e3)) {
    patch[`${to}_notified_at`] = now;
    await notify(db, org, t, to, body).catch((e) => console.error("job notify", e));
  }
  await db.from("job_threads").update(patch).eq("id", t.id);
  return { ok: true, data: "Sent." };
}

async function notify(db: SupabaseClient, org: JobsOrg, t: Thread, to: "employer" | "barista", body: string) {
  if (!emailConfigured()) return;
  const [{ data: emp }, { data: prof }] = await Promise.all([
    db.from("job_employers").select("business_name, contact_name, email").eq("id", t.employer_id).single(),
    db.from("job_profiles").select("display_name, student:booking_students!inner(name, email, jobs_unsubscribed_at)").eq("id", t.profile_id).single(),
  ]);
  const p = prof as unknown as { display_name: string | null; student: { name: string; email: string | null; jobs_unsubscribed_at: string | null } };
  const e = emp as { business_name: string; contact_name: string; email: string };
  const preview = body.length > 280 ? `${body.slice(0, 280)}…` : body;
  if (to === "barista") {
    if (!p.student.email) return;
    const m = jobNoticeEmail(brandOf(org), { heading: `${e.business_name} sent you a message`, lines: [`“${preview}”`, t.contact_requested && !t.contact_shared ? "They'd like your contact details — you choose whether to share them." : ""].filter(Boolean),
      button: { label: "Read and reply", url: jobsUrl(org, `/messages?t=${t.id}`) }, footer: `${org.jobs.name} — your phone and email stay private unless you share them.` });
    await sendEmail({ to: p.student.email, subject: m.subject, html: m.html, text: m.text, fromName: org.jobs.name, replyTo: org.settings.reply_to ?? org.contact_email });
  } else {
    const m = jobNoticeEmail(brandOf(org), { heading: `${publicName(p.student.name, p.display_name)} replied`, lines: [`“${preview}”`], button: { label: "Open messages", url: jobsUrl(org, `/employers/messages?t=${t.id}`) }, footer: org.jobs.name });
    await sendEmail({ to: e.email, subject: m.subject, html: m.html, text: m.text, fromName: org.jobs.name, replyTo: org.settings.reply_to ?? org.contact_email });
  }
}

export async function loadThreads(db: SupabaseClient, side: "employer" | "barista", id: string) {
  const { data } = await db.from("job_threads").select(`${THREAD_COLS}, employer:job_employers!inner(business_name, suburb), profile:job_profiles!inner(display_name, photo_url, suburb, student:booking_students!inner(name)), post:job_posts(title)`)
    .eq(side === "employer" ? "employer_id" : "profile_id", id).order("last_message_at", { ascending: false }).limit(200);
  return (data ?? []) as unknown as (Thread & { employer: { business_name: string; suburb: string | null }; profile: { display_name: string | null; photo_url: string | null; suburb: string | null; student: { name: string } }; post: { title: string } | null })[];
}

export async function loadMessages(db: SupabaseClient, threadId: string) {
  const { data } = await db.from("job_messages").select("id, sender, body, created_at").eq("thread_id", threadId).order("created_at").limit(500);
  return (data ?? []) as { id: string; sender: "employer" | "barista" | "system"; body: string; created_at: string }[];
}

/* ------------------------------------------------------------------ welcome letter */

export interface InviteStats { total: number; withEmail: number; unsubscribed: number; queued: number; sent: number; opened: number; clicked: number; joined: number; active: number; hidden: number; employersPending: number; employersApproved: number; openJobs: number; filledJobs: number }

export async function jobStats(db: SupabaseClient, orgId: string): Promise<InviteStats> {
  type F = [op: "eq" | "notnull", col: string, val?: string];
  const c = async (table: string, f?: F) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("organisation_id", orgId);
    if (f?.[0] === "eq") q = q.eq(f[1], f[2]!);
    if (f?.[0] === "notnull") q = q.not(f[1], "is", null);
    const { count } = await q;
    return count ?? 0;
  };
  const [total, withEmail, unsubscribed, queued, sent, opened, clicked, joined, active, hidden, ep, ea, oj, fj] = await Promise.all([
    c("booking_students"), c("booking_students", ["notnull", "email"]), c("booking_students", ["notnull", "jobs_unsubscribed_at"]),
    c("job_invites", ["eq", "status", "queued"]), c("job_invites", ["eq", "status", "sent"]), c("job_invites", ["notnull", "opened_at"]),
    c("job_invites", ["notnull", "clicked_at"]), c("job_invites", ["notnull", "joined_at"]),
    c("job_profiles", ["eq", "status", "active"]), c("job_profiles", ["eq", "status", "hidden"]),
    c("job_employers", ["eq", "status", "pending"]), c("job_employers", ["eq", "status", "approved"]),
    c("job_posts", ["eq", "status", "open"]), c("job_posts", ["eq", "status", "filled"]),
  ]);
  return { total, withEmail, unsubscribed, queued, sent, opened, clicked, joined, active, hidden, employersPending: ep, employersApproved: ea, openJobs: oj, filledJobs: fj };
}

/** Everyone on the list who'd get the welcome letter: has an email, hasn't unsubscribed, isn't already invited or on the board. */
export async function welcomeEligible(db: SupabaseClient, orgId: string) {
  const out: { id: string; email: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("booking_students").select("id, email").eq("organisation_id", orgId).not("email", "is", null).is("jobs_unsubscribed_at", null).order("created_at").order("id").range(from, from + 999);
    const rows = (data ?? []) as { id: string; email: string }[];
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const skip = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const part = ids.slice(i, i + 300);
      const [{ data: inv }, { data: prof }] = await Promise.all([
        db.from("job_invites").select("student_id").in("student_id", part),
        db.from("job_profiles").select("student_id").in("student_id", part).eq("status", "active"),
      ]);
      for (const r of [...(inv ?? []), ...(prof ?? [])]) skip.add(r.student_id as string);
    }
    // One letter per email address (some people have more than one record)
    for (const r of rows) if (!skip.has(r.id) && r.email.includes("@")) out.push(r);
    if (rows.length < 1000) break;
  }
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("job_invites").select("email").eq("organisation_id", orgId).range(from, from + 999);
    for (const r of data ?? []) seen.add(String(r.email).trim().toLowerCase());
    if ((data ?? []).length < 1000) break;
  }
  return out.filter((r) => { const k = r.email.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Put everyone eligible in the send queue. */
export async function queueWelcome(db: SupabaseClient, orgId: string) {
  const list = await welcomeEligible(db, orgId);
  let queued = 0;
  for (let i = 0; i < list.length; i += 300) {
    const { error } = await db.from("job_invites").insert(list.slice(i, i + 300).map((r) => ({ organisation_id: orgId, student_id: r.id, email: r.email.trim() })));
    if (error) throw error;
    queued += Math.min(300, list.length - i);
  }
  return queued;
}

export async function welcomeEmailFor(org: JobsOrg, v: { name: string; token: string }) {
  const first = v.name.split(/\s+/)[0] || "there";
  return welcomeLetterEmail(brandOf(org), {
    subject: fillLetter(org.jobs.welcomeSubject, { first_name: first, name: v.name, business: org.name }),
    body: fillLetter(org.jobs.welcomeBody, { first_name: first, name: v.name, business: org.name }),
    button: { label: "Set up my free profile", url: `${appBaseUrl()}/api/jobs/c/${v.token}` },
    pixel: `${appBaseUrl()}/api/jobs/o/${v.token}.gif`,
    unsubscribe: jobsUrl(org, `/unsubscribe?i=${v.token}`), board: org.jobs.name,
  });
}

/** Background: send the next batch of queued welcome letters for each organisation (spread out to protect sending limits). */
export async function sendWelcomeBatch(db: SupabaseClient) {
  if (!emailConfigured()) return 0;
  const { data: orgs } = await db.from("job_invites").select("organisation_id").eq("status", "queued").limit(1000);
  const ids = [...new Set((orgs ?? []).map((o) => o.organisation_id as string))];
  let sent = 0;
  for (const orgId of ids) {
    const { data: o } = await db.from("organisations").select("slug").eq("id", orgId).single();
    const org = o ? await jobsOrg(o.slug as string, db) : null;
    if (!org) continue;
    if (!org.jobs.enabled) continue;
    const since = new Date(Date.now() - 86400e3).toISOString();
    const { count: today } = await db.from("job_invites").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("status", "sent").gt("sent_at", since);
    const room = Math.min(org.jobs.batchSize, org.jobs.dailyLimit - (today ?? 0));
    if (room <= 0) continue;
    const { data: batch } = await db.from("job_invites").select("id, email, token, student:booking_students!inner(name, jobs_unsubscribed_at)").eq("organisation_id", orgId).eq("status", "queued").order("queued_at").limit(room);
    for (const inv of (batch ?? []) as unknown as { id: string; email: string; token: string; student: { name: string; jobs_unsubscribed_at: string | null } }[]) {
      if (inv.student.jobs_unsubscribed_at) { await db.from("job_invites").update({ status: "skipped" }).eq("id", inv.id); continue; }
      const m = await welcomeEmailFor(org, { name: inv.student.name, token: inv.token });
      try {
        await sendEmail({ to: inv.email, subject: m.subject, html: m.html, text: m.text, fromName: org.jobs.name, replyTo: org.settings.reply_to ?? org.contact_email,
          headers: { "List-Unsubscribe": `<${jobsUrl(org, `/unsubscribe?i=${inv.token}`)}>` } });
        await db.from("job_invites").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", inv.id);
        sent++;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        // Rate limited: stop this run and try again next time
        if (/429|rate/i.test(msg)) break;
        await db.from("job_invites").update({ status: "failed", error: msg }).eq("id", inv.id);
      }
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ housekeeping */

/** Jobs whose dates have passed are closed automatically. */
export async function closePastJobs(db: SupabaseClient) {
  const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const { data } = await db.from("job_posts").update({ status: "closed" }).eq("status", "open").in("kind", ["one_off", "event"]).lt("ends_on", yesterday).select("id");
  return data?.length ?? 0;
}

export async function runJobBoardJobs(db: SupabaseClient) {
  const out = { welcome: 0, closed: 0 };
  try { out.welcome = await sendWelcomeBatch(db); } catch { /* before the 0051 update */ }
  try { out.closed = await closePastJobs(db); } catch { /* before the 0051 update */ }
  return out;
}

/** Unread messages for the nav badge. */
export async function unreadFor(db: SupabaseClient, side: "employer" | "barista", id: string | null | undefined) {
  if (!id) return 0;
  const col = side === "employer" ? "employer_unread" : "barista_unread";
  const { data } = await db.from("job_threads").select(col).eq(side === "employer" ? "employer_id" : "profile_id", id).gt(col, 0).limit(200);
  return ((data ?? []) as Record<string, number>[]).reduce((n, r) => n + (r[col] ?? 0), 0);
}
