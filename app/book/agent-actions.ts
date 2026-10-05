"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { cleanPhone } from "@/lib/bookings/core";
import { confirmationEmail } from "@/lib/bookings/emails";
import { brandOf, emailBits, loadBooking, publicOrg } from "@/lib/bookings/server";
import {
  addCaseManager, agencyByCode, agentSignOut, caseManagerById, caseManagerList, consumeAgentLink, currentAgent, notifyCaseManager, requestAgentLink, startAgentSession,
  type CaseManagerInput, type R,
} from "@/lib/bookings/agents";

const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  console.error("[agency]", m);
  return { ok: false, error: /booking_case_manager|relation .* does not exist|schema cache/i.test(m) ? "Case manager sign-in is being set up — please try again soon." : "Something went wrong — please try again." };
};

async function orgAndAgency(slug: string, code: string) {
  const org = await publicOrg(slug);
  if (!org) return null;
  const agency = await agencyByCode(createServiceClient(), org.id, code);
  return agency ? { org, agency } : null;
}

export type AgencyCheck = { name: string; poRequired: boolean; price: number | null; managers: { id: string; label: string; site: string | null }[]; ready: boolean };

/** Agency code → the agency and its list of case managers to pick from. */
export async function agencyCodeAction(slug: string, code: string): Promise<R<AgencyCheck>> {
  try {
    const x = await orgAndAgency(slug, code);
    if (!x) return { ok: false, error: "That agency code isn't recognised. Check it, or contact us." };
    const managers = await caseManagerList(createServiceClient(), x.agency.id);
    return { ok: true, data: { name: x.agency.name, poRequired: x.agency.po_required, price: x.agency.price === null ? null : Number(x.agency.price), managers: managers ?? [], ready: managers !== null } };
  } catch (e) { return fail(e); }
}

/** A case manager picks their name: they can book job seekers straight away (seeing past ones needs the emailed link). */
export async function agentPickAction(slug: string, code: string, caseManagerId: string): Promise<R> {
  try {
    const x = await orgAndAgency(slug, code);
    if (!x) return { ok: false, error: "That agency code isn't recognised." };
    const cm = await caseManagerById(createServiceClient(), x.org.id, caseManagerId, x.agency.id);
    if (!cm || !cm.active) return { ok: false, error: "Choose your name from the list." };
    await startAgentSession(x.org, cm.id, "book");
    return { ok: true, data: cm.name.split(/\s+/)[0] };
  } catch (e) { return fail(e); }
}

/** Not on the list yet: add yourself (next time you just pick your name). */
export async function agentJoinAction(slug: string, code: string, p: CaseManagerInput): Promise<R> {
  try {
    const x = await orgAndAgency(slug, code);
    if (!x) return { ok: false, error: "That agency code isn't recognised." };
    const db = createServiceClient();
    const r = await addCaseManager(db, x.org.id, x.agency.id, p, "self");
    if (!r.ok) return r;
    await db.from("activity_logs").insert({ organisation_id: x.org.id, actor_type: "system", actor_label: "Bookings", action: "agency.case_manager_self_added", entity_type: "booking_case_manager", entity_id: r.data.id,
      summary: `${r.data.name} (${r.data.email}) signed in as a case manager for ${x.agency.name}` });
    await startAgentSession(x.org, r.data.id, "book");
    return { ok: true, data: r.data.name.split(/\s+/)[0] };
  } catch (e) { return fail(e); }
}

/** Email a sign-in link to see your job seekers — to the signed-in case manager, or the one picked from the list. */
export async function agentLinkAction(slug: string, code?: string, caseManagerId?: string): Promise<R> {
  try {
    const org = await publicOrg(slug);
    if (!org) return { ok: false, error: "Not found." };
    let id = (await currentAgent(org).catch(() => null))?.cm.id;
    if (code && caseManagerId) {
      const x = await orgAndAgency(slug, code);
      const cm = x ? await caseManagerById(createServiceClient(), org.id, caseManagerId, x.agency.id) : null;
      if (!cm) return { ok: false, error: "Choose your name from the list." };
      id = cm.id;
    }
    if (!id) return { ok: false, error: "Enter your agency code and choose your name first." };
    return await requestAgentLink(org, id);
  } catch (e) { return fail(e); }
}

export async function agentSignInAction(slug: string, token: string): Promise<{ ok: false; error: string } | void> {
  const org = await publicOrg(slug);
  if (!org) return { ok: false, error: "Not found." };
  const r = await consumeAgentLink(org, token).catch(fail);
  if (!r.ok) return r;
  redirect(`/book/${org.slug}/agency`);
}

export async function agentSignOutAction(slug: string) {
  const org = await publicOrg(slug);
  if (org) await agentSignOut(org);
  redirect(`/book/${slug}/agency`);
}

async function portalAgent(slug: string) {
  const org = await publicOrg(slug);
  const agent = org ? await currentAgent(org).catch(() => null) : null;
  if (!org || !agent || agent.scope !== "portal") return null;
  return { org, agent };
}

/** From the portal: send the course details again — to me (to forward) or to the job seeker. */
export async function agentResendAction(slug: string, bookingId: string, to: "me" | "student"): Promise<R> {
  try {
    const x = await portalAgent(slug);
    if (!x) return { ok: false, error: "Please sign in again." };
    const db = createServiceClient();
    const { data: own } = await db.from("bookings").select("id").eq("id", bookingId).eq("case_manager_id", x.agent.cm.id).maybeSingle();
    if (!own) return { ok: false, error: "Booking not found." };
    if (!emailConfigured()) return { ok: false, error: "Email isn't set up yet." };
    if (to === "me") return (await notifyCaseManager(db, bookingId, true)) ? { ok: true, data: `Sent to ${x.agent.cm.email}.` } : { ok: false, error: "Couldn't send it — is the booking still active?" };
    const b = await loadBooking(db, bookingId);
    if (!b || b.status !== "confirmed") return { ok: false, error: "Only confirmed bookings can be resent." };
    if (!b.contact_email) return { ok: false, error: "We don't have an email for them — send it to yourself and forward it." };
    const m = confirmationEmail(brandOf(x.org), emailBits(x.org, b).input);
    await sendEmail({ to: b.contact_email, subject: m.subject, html: m.html, text: m.text, replyTo: x.org.settings.reply_to ?? x.org.contact_email, fromName: x.org.name });
    return { ok: true, data: `Sent to ${b.contact_email}.` };
  } catch (e) { return fail(e); }
}

/** From the portal: add or fix a job seeker's email/phone (so reminders and their certificate reach them). */
export async function agentUpdateSeekerAction(slug: string, bookingId: string, p: { email: string; phone: string }): Promise<R> {
  try {
    const x = await portalAgent(slug);
    if (!x) return { ok: false, error: "Please sign in again." };
    const db = createServiceClient();
    const { cleanEmail } = await import("@/lib/bookings/core");
    const email = p.email.trim() ? cleanEmail(p.email) : null;
    if (p.email.trim() && !email) return { ok: false, error: "That email doesn't look right." };
    const { data, error } = await db.from("bookings").update({ contact_email: email, contact_phone: cleanPhone(p.phone) }).eq("id", bookingId).eq("case_manager_id", x.agent.cm.id).select("student_id").maybeSingle();
    if (error || !data) return { ok: false, error: "Couldn't save — please try again." };
    if (data.student_id && email) {
      const { error: e2 } = await db.from("booking_students").update({ email }).eq("id", data.student_id).is("email", null);
      if (e2) console.error("[agency] student email", e2.message);
    }
    return { ok: true, data: "Saved." };
  } catch (e) { return fail(e); }
}

export async function agentDetailsAction(slug: string, p: { phone: string; site: string }): Promise<R> {
  try {
    const org = await publicOrg(slug);
    const agent = org ? await currentAgent(org) : null;
    if (!agent || agent.scope !== "portal") return { ok: false, error: "Please sign in with your emailed link first." };
    const { error } = await createServiceClient().from("booking_case_managers").update({ phone: cleanPhone(p.phone), site: p.site.trim().slice(0, 160) || null }).eq("id", agent.cm.id);
    return error ? { ok: false, error: "Couldn't save." } : { ok: true, data: "Saved." };
  } catch (e) { return fail(e); }
}
