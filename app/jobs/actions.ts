"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanPhone } from "@/lib/bookings/core";
import { consumeLogin, currentStudent, requestLogin, setSessionCookie, signOut, startSessionFor } from "@/lib/bookings/student-auth";
import { JOB_KINDS } from "@/lib/jobs/core";
import {
  consumeEmployerLogin, currentEmployer, employerSignOut, geocode, jobsOrg, postMessage, profileFor, registerEmployer, requestEmployerLogin, saveProfile, startThread,
  employerExtras, THREAD_COLS, type EmployerDetails, type ProfileInput, type R, type Thread,
} from "@/lib/jobs/server";
import { cleanWebsite } from "@/lib/jobs/core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[jobs]", m);
  return { ok: false, error: /job_|relation .* does not exist|schema cache/i.test(m) ? "The job board is being set up — please try again soon." : "Something went wrong — please try again." };
};

async function barista(slug: string) {
  const org = await jobsOrg(slug);
  if (!org) throw new Error("Not found");
  const me = await currentStudent(org);
  return { org, me };
}

/* ------------------------------------------------------------------ baristas */

export async function jobsLoginAction(slug: string, email: string, name?: string): Promise<R> {
  try {
    const r = await requestLogin(slug, email, { target: "jobs", signupName: name?.trim() || null });
    return r.ok ? { ok: true, data: r.message } : r;
  } catch (e) { return fail(e); }
}

export async function jobsSignInAction(slug: string, token: string): Promise<{ ok: false; error: string } | void> {
  const org = await jobsOrg(slug);
  if (!org) return { ok: false, error: "Not found." };
  const r = await consumeLogin(org, token);
  if (!r.ok) return r;
  await setSessionCookie(org, r.session);
  redirect(`/jobs/${org.slug}/me`);
}

/** From the welcome letter: the invite link signs them in the first time (within 30 days of sending). */
export async function joinAction(slug: string, inviteToken: string): Promise<{ ok: false; error: string } | void> {
  const org = await jobsOrg(slug);
  if (!org || !/^[0-9a-f]{40}$/.test(inviteToken)) return { ok: false, error: "That link isn't valid." };
  const db = createServiceClient();
  const { data: inv } = await db.from("job_invites").select("id, student_id, sent_at, joined_at").eq("organisation_id", org.id).eq("token", inviteToken).maybeSingle();
  if (!inv) return { ok: false, error: "That link isn't valid." };
  const fresh = inv.sent_at && Date.now() - Date.parse(inv.sent_at as string) < 30 * 86400e3;
  if (!fresh || inv.joined_at) return { ok: false, error: "For your security this link has expired — enter your email below and we'll send you a new one." };
  await startSessionFor(org, inv.student_id as string);
  redirect(`/jobs/${org.slug}/me`);
}

export async function jobsSignOutAction(slug: string) {
  const org = await jobsOrg(slug);
  if (org) await signOut(org);
  redirect(`/jobs/${slug}`);
}

export async function saveProfileAction(slug: string, input: ProfileInput): Promise<R> {
  try {
    const { org, me } = await barista(slug);
    if (!me) return { ok: false, error: "Please sign in again." };
    const r = await saveProfile(createServiceClient(), org, me.id, input);
    if (!r.ok) return r;
    return { ok: true, data: input.status === "active" ? "You're on the board — employers can now find you." : input.status === "hidden" ? "Your profile is switched off." : "Saved." };
  } catch (e) { return fail(e); }
}

/** Profile photo: the browser shrinks it to a small JPEG first; stored in the business's public "branding" bucket. */
export async function uploadPhotoAction(slug: string, dataUrl: string | null): Promise<R<string | null>> {
  try {
    const { org, me } = await barista(slug);
    if (!me) return { ok: false, error: "Please sign in again." };
    const db = createServiceClient();
    const prof = await profileFor(db, org.id, me.id);
    if (!prof) return { ok: false, error: "Couldn't load your profile." };
    if (!dataUrl) { await db.from("job_profiles").update({ photo_url: null }).eq("id", prof.id); return { ok: true, data: null }; }
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return { ok: false, error: "Use a JPG or PNG photo." };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 900_000) return { ok: false, error: "That photo is too big — try another." };
    const path = `${org.id}/jobs/${prof.id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    const { error } = await db.storage.from("branding").upload(path, bytes, { contentType: `image/${m[1]}`, cacheControl: "31536000", upsert: false });
    if (error) { console.error("[jobs] photo upload", error.message); return { ok: false, error: "Couldn't upload — please try again." }; }
    const url = db.storage.from("branding").getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await db.from("job_profiles").update({ photo_url: url }).eq("id", prof.id);
    if (e2) { console.error("[jobs] photo", e2.message); return { ok: false, error: "Couldn't save your photo — please try again." }; }
    return { ok: true, data: url };
  } catch (e) { return fail(e); }
}

export async function interestedAction(slug: string, postId: string, body: string): Promise<R> {
  try {
    const { org, me } = await barista(slug);
    if (!me) return { ok: false, error: "Please sign in again." };
    if (!UUID.test(postId)) return { ok: false, error: "Job not found." };
    const db = createServiceClient();
    const prof = await profileFor(db, org.id, me.id);
    if (!prof || prof.status !== "active") return { ok: false, error: "Switch your profile on first (My profile), so the employer can see who you are." };
    const { data: post } = await db.from("job_posts").select("id, employer_id, status").eq("organisation_id", org.id).eq("id", postId).maybeSingle();
    if (!post || post.status !== "open") return { ok: false, error: "Sorry — this job has just been filled." };
    const r = await startThread(db, org, { employerId: post.employer_id as string, profileId: prof.id, postId, by: "barista", body });
    return r.ok ? { ok: true, data: r.data.threadId } : r;
  } catch (e) { return fail(e); }
}

async function myThread(slug: string, threadId: string, side: "barista" | "employer") {
  const org = await jobsOrg(slug);
  if (!org || !UUID.test(threadId)) return null;
  const db = createServiceClient();
  const { data: t } = await db.from("job_threads").select(THREAD_COLS).eq("organisation_id", org.id).eq("id", threadId).maybeSingle();
  if (!t) return null;
  if (side === "barista") {
    const me = await currentStudent(org);
    const prof = me ? await profileFor(db, org.id, me.id, false) : null;
    if (!prof || prof.id !== t.profile_id) return null;
  } else {
    const emp = await currentEmployer(org);
    if (!emp || emp.status !== "approved" || emp.id !== t.employer_id) return null;
  }
  return { org, db, t: t as Thread };
}

export async function baristaReplyAction(slug: string, threadId: string, body: string): Promise<R> {
  try {
    const x = await myThread(slug, threadId, "barista");
    if (!x) return { ok: false, error: "Please sign in again." };
    if (body.trim().length < 1) return { ok: false, error: "Write a message." };
    return await postMessage(x.db, x.org, x.t, "barista", body.trim());
  } catch (e) { return fail(e); }
}

/** The barista chooses to share their phone and email with this employer. */
export async function shareContactAction(slug: string, threadId: string): Promise<R> {
  try {
    const x = await myThread(slug, threadId, "barista");
    if (!x) return { ok: false, error: "Please sign in again." };
    if (x.t.contact_shared) return { ok: true, data: "Already shared." };
    await x.db.from("job_threads").update({ contact_shared: true }).eq("id", x.t.id);
    await postMessage(x.db, x.org, x.t, "system", "Contact details shared — the employer can now see your phone number and email.");
    // Let the employer know
    await postMessage(x.db, x.org, { ...x.t, contact_shared: true }, "barista", "I've shared my contact details with you.");
    return { ok: true, data: "Shared." };
  } catch (e) { return fail(e); }
}

export async function unsubscribeAction(slug: string, inviteToken: string): Promise<R> {
  try {
    const org = await jobsOrg(slug);
    if (!org || !/^[0-9a-f]{40}$/.test(inviteToken)) return { ok: false, error: "That link isn't valid." };
    const db = createServiceClient();
    const { data: inv } = await db.from("job_invites").select("id, student_id, status").eq("organisation_id", org.id).eq("token", inviteToken).maybeSingle();
    if (!inv) return { ok: false, error: "That link isn't valid." };
    await db.from("booking_students").update({ jobs_unsubscribed_at: new Date().toISOString() }).eq("id", inv.student_id);
    if (inv.status === "queued") await db.from("job_invites").update({ status: "skipped" }).eq("id", inv.id);
    return { ok: true, data: "You're unsubscribed — we won't send you job board emails." };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ employers */

export async function employerRegisterAction(slug: string, f: { business: string; name: string; email: string; phone?: string; website?: string; suburb?: string; about?: string } & EmployerDetails): Promise<R> {
  try { return await registerEmployer(slug, f); } catch (e) { return fail(e); }
}

export async function employerLoginAction(slug: string, email: string): Promise<R> {
  try { return await requestEmployerLogin(slug, email); } catch (e) { return fail(e); }
}

export async function employerSignInAction(slug: string, token: string): Promise<{ ok: false; error: string } | void> {
  const org = await jobsOrg(slug);
  if (!org) return { ok: false, error: "Not found." };
  const r = await consumeEmployerLogin(org, token);
  if (!r.ok) return r;
  redirect(`/jobs/${org.slug}/employers`);
}

export async function employerSignOutAction(slug: string) {
  const org = await jobsOrg(slug);
  if (org) await employerSignOut(org);
  redirect(`/jobs/${slug}/employers`);
}

async function employer(slug: string, needApproved = true) {
  const org = await jobsOrg(slug);
  if (!org) throw new Error("Not found");
  const emp = await currentEmployer(org);
  if (!emp) return { org, emp: null, error: "Please sign in again." };
  if (needApproved && emp.status !== "approved") return { org, emp: null, error: "Your account is waiting for approval — we'll email you as soon as it's ready." };
  return { org, emp, error: null };
}

export async function saveEmployerAction(slug: string, f: { business: string; name: string; phone: string; website: string; suburb: string; about: string } & EmployerDetails): Promise<R> {
  try {
    const { org, emp, error } = await employer(slug, false);
    if (!emp) return { ok: false, error: error! };
    const business = f.business.trim().slice(0, 120), name = f.name.trim().slice(0, 120);
    if (business.length < 2 || name.length < 2) return { ok: false, error: "Enter your business and your name." };
    const db = createServiceClient();
    const suburb = f.suburb.trim().slice(0, 80) || null;
    const extras = employerExtras(f);
    if (f.website?.trim() && !cleanWebsite(f.website)) return { ok: false, error: "That website doesn't look right — e.g. beanculture.com.au" };
    if (f.instagram?.trim() && !extras.instagram) return { ok: false, error: "Enter just your Instagram username, e.g. beanculture" };
    const moved = suburb !== emp.suburb || extras.address !== emp.address || extras.postcode !== emp.postcode;
    const g = moved && suburb ? await geocode(db, [extras.address, suburb, extras.postcode].filter(Boolean).join(" "), extras.state) ?? await geocode(db, suburb, extras.state) : null;
    const base = { business_name: business, contact_name: name, phone: cleanPhone(f.phone), website: cleanWebsite(f.website), suburb,
      about: f.about.trim().slice(0, 1500) || null, ...(moved ? { lat: g?.lat ?? null, lng: g?.lng ?? null } : {}) };
    let { error: e } = await db.from("job_employers").update({ ...base, ...extras }).eq("id", emp.id).eq("organisation_id", org.id);
    if (e && /column .* does not exist|schema cache/i.test(e.message)) ({ error: e } = await db.from("job_employers").update(base).eq("id", emp.id).eq("organisation_id", org.id));
    return e ? fail(e) : { ok: true, data: "Saved." };
  } catch (e) { return fail(e); }
}

export interface PostInput { title: string; kind: string; description: string; suburb: string; starts_on: string; ends_on: string; times: string; pay: string; positions: number }

export async function postJobAction(slug: string, f: PostInput, postId?: string | null): Promise<R> {
  try {
    const { org, emp, error } = await employer(slug);
    if (!emp) return { ok: false, error: error! };
    const title = f.title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (title.length < 3) return { ok: false, error: "Give the job a short title (e.g. “Weekend barista — Saturday markets”)." };
    if (!JOB_KINDS.some((k) => k.id === f.kind)) return { ok: false, error: "Choose the type of job." };
    const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const starts = date(f.starts_on), ends = date(f.ends_on) ?? starts;
    if ((f.kind === "one_off" || f.kind === "event") && !starts) return { ok: false, error: "Add the date of the shift or event." };
    if (starts && ends && ends < starts) return { ok: false, error: "The end date is before the start date." };
    const db = createServiceClient();
    const suburb = f.suburb.trim().slice(0, 80) || emp.suburb;
    const g = suburb ? (suburb === emp.suburb && emp.lat != null ? { lat: emp.lat, lng: emp.lng! } : await geocode(db, suburb)) : null;
    const row = { title, kind: f.kind, description: f.description.trim().slice(0, 3000) || null, suburb, lat: g?.lat ?? null, lng: g?.lng ?? null, starts_on: starts, ends_on: ends,
      times: f.times.trim().slice(0, 120) || null, pay: f.pay.trim().slice(0, 80) || null, positions: Math.max(1, Math.min(50, Math.round(Number(f.positions) || 1))) };
    if (postId) {
      if (!UUID.test(postId)) return { ok: false, error: "Job not found." };
      const { error: e } = await db.from("job_posts").update(row).eq("id", postId).eq("employer_id", emp.id);
      return e ? fail(e) : { ok: true, data: postId };
    }
    const { data, error: e } = await db.from("job_posts").insert({ ...row, organisation_id: org.id, employer_id: emp.id }).select("id").single();
    if (e) return fail(e);
    await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Barista jobs", action: "jobs.posted", entity_type: "job_post", entity_id: data.id, summary: `${emp.business_name} posted a job: ${title}` });
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

/** Filled or closed jobs disappear from the board straight away. */
export async function setPostStatusAction(slug: string, postId: string, status: "open" | "filled" | "closed"): Promise<R> {
  try {
    const { emp, error } = await employer(slug);
    if (!emp) return { ok: false, error: error! };
    if (!UUID.test(postId) || !["open", "filled", "closed"].includes(status)) return { ok: false, error: "Job not found." };
    const { error: e } = await createServiceClient().from("job_posts").update({ status, filled_at: status === "filled" ? new Date().toISOString() : null }).eq("id", postId).eq("employer_id", emp.id).neq("status", "removed");
    return e ? fail(e) : { ok: true, data: status === "filled" ? "Marked as filled — it's off the board." : status === "closed" ? "Closed — it's off the board." : "Back on the board." };
  } catch (e) { return fail(e); }
}

export async function contactBaristaAction(slug: string, profileId: string, body: string, requestContact: boolean, postId?: string | null): Promise<R> {
  try {
    const { org, emp, error } = await employer(slug);
    if (!emp) return { ok: false, error: error! };
    if (!UUID.test(profileId)) return { ok: false, error: "Barista not found." };
    const db = createServiceClient();
    const { data: p } = await db.from("job_profiles").select("id, status").eq("organisation_id", org.id).eq("id", profileId).maybeSingle();
    if (!p || p.status !== "active") return { ok: false, error: "This barista isn't on the board any more." };
    let post: string | null = null;
    if (postId && UUID.test(postId)) { const { data: own } = await db.from("job_posts").select("id").eq("id", postId).eq("employer_id", emp.id).maybeSingle(); post = own?.id ?? null; }
    const r = await startThread(db, org, { employerId: emp.id, profileId, postId: post, by: "employer", body, requestContact });
    if (!r.ok) return r;
    if (requestContact) {
      const { data: t } = await db.from("job_threads").select(THREAD_COLS).eq("id", r.data.threadId).single();
      if (t && !(t as Thread).contact_shared) await postMessage(db, org, t as Thread, "system", `${emp.business_name} asked for your contact details. Only share them if you're happy to.`);
    }
    return { ok: true, data: r.data.threadId };
  } catch (e) { return fail(e); }
}

export async function employerReplyAction(slug: string, threadId: string, body: string): Promise<R> {
  try {
    const x = await myThread(slug, threadId, "employer");
    if (!x) return { ok: false, error: "Please sign in again." };
    if (body.trim().length < 1) return { ok: false, error: "Write a message." };
    return await postMessage(x.db, x.org, x.t, "employer", body.trim());
  } catch (e) { return fail(e); }
}

export async function requestContactAction(slug: string, threadId: string): Promise<R> {
  try {
    const x = await myThread(slug, threadId, "employer");
    if (!x) return { ok: false, error: "Please sign in again." };
    if (x.t.contact_shared) return { ok: true, data: "Already shared." };
    if (x.t.contact_requested) return { ok: true, data: "You've asked — it's up to them." };
    await x.db.from("job_threads").update({ contact_requested: true }).eq("id", x.t.id);
    await postMessage(x.db, x.org, { ...x.t, contact_requested: true }, "employer", "Would you be happy to share your phone number and email so we can chat?");
    return { ok: true, data: "Asked." };
  } catch (e) { return fail(e); }
}
