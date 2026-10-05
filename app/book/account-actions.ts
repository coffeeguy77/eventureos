"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { cleanPhone } from "@/lib/bookings/core";
import { certificateRequestEmail } from "@/lib/bookings/emails";
import { brandOf, publicOrg } from "@/lib/bookings/server";
import { consumeLogin, currentStudent, requestLogin, setSessionCookie, signOut, type LoginResult } from "@/lib/bookings/student-auth";

export async function requestLoginAction(orgSlug: string, email: string): Promise<LoginResult> {
  try { return await requestLogin(orgSlug, email); } catch { return { ok: false, error: "Something went wrong — please try again." }; }
}

export async function signInAction(orgSlug: string, token: string): Promise<{ ok: false; error: string } | void> {
  const org = await publicOrg(orgSlug);
  if (!org) return { ok: false, error: "Not found." };
  const r = await consumeLogin(org, token);
  if (!r.ok) return r;
  await setSessionCookie(org, r.session);
  redirect(`/book/${org.slug}/account`);
}

export async function signOutAction(orgSlug: string) {
  const org = await publicOrg(orgSlug);
  if (org) await signOut(org);
  redirect(`/book/${orgSlug}/account`);
}

export async function saveDetailsAction(orgSlug: string, p: { name: string; phone: string; marketing: boolean }): Promise<LoginResult> {
  const org = await publicOrg(orgSlug);
  const me = org ? await currentStudent(org) : null;
  if (!org || !me) return { ok: false, error: "Please sign in again." };
  const name = p.name.trim().replace(/\s+/g, " ").slice(0, 160);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  const { error } = await createServiceClient().from("booking_students").update({ name, phone: cleanPhone(p.phone), marketing_ok: !!p.marketing }).eq("id", me.id);
  return error ? { ok: false, error: "Couldn't save — please try again." } : { ok: true, message: "Saved." };
}

/** A past student whose course isn't on record asks for their certificate — the office gets an email. */
export async function requestCertificateAction(orgSlug: string, note: string): Promise<LoginResult> {
  const org = await publicOrg(orgSlug);
  const me = org ? await currentStudent(org) : null;
  if (!org || !me) return { ok: false, error: "Please sign in again." };
  if (me.certificate_requested_at && Date.now() - Date.parse(me.certificate_requested_at) < 86400e3) return { ok: true, message: "Thanks — we've got your request and will be in touch." };
  const db = createServiceClient();
  await db.from("booking_students").update({ certificate_requested_at: new Date().toISOString(), notes: note.trim() ? `Certificate request: ${note.trim().slice(0, 500)}` : undefined }).eq("id", me.id);
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: "certificate.requested", entity_type: "booking_student", entity_id: me.id,
    summary: `${me.name} asked for their course certificate${note.trim() ? ` — “${note.trim().slice(0, 200)}”` : ""}` });
  const to = org.settings.notify_email ?? org.contact_email;
  if (to && emailConfigured()) {
    const m = certificateRequestEmail(brandOf(org), { name: me.name, email: me.email ?? "", url: `${appBaseUrl()}/bookings/certificates` });
    await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, fromName: "EventureOS" }).catch(() => undefined);
  }
  return { ok: true, message: "Thanks — we'll check our records and send your certificate." };
}
