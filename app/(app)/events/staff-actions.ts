"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

export type StaffResult = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function wrap(fn: () => Promise<void>): Promise<StaffResult> {
  try { await fn(); return { ok: true }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can change who's working an event.");
  return ctx;
}

async function eventName(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, eventId: string) {
  const { data } = await supabase.from("events").select("id, name, customer_id").eq("id", eventId).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That event no longer exists.");
  return data as { id: string; name: string; customer_id: string };
}

export async function addEventStaff(eventId: string, userId: string, role: string | null): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventId) || !UUID.test(userId)) throw new Error("Choose someone from the team.");
    const ev = await eventName(supabase, org.id, eventId);
    const { data: m } = await supabase.from("organisation_users").select("role, user:users!organisation_users_user_id_fkey(full_name, email)")
      .eq("organisation_id", org.id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!m || m.role === "customer") throw new Error("That person isn't on the team.");
    const { error } = await supabase.from("event_staff").insert({ organisation_id: org.id, event_id: eventId, user_id: userId, role: role?.trim().slice(0, 60) || null });
    if (error) throw new Error(error.code === "23505" ? "They're already on this event." : error.message);
    const u = m.user as unknown as { full_name: string | null; email: string } | null;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.staff_added", entityType: "event", entityId: eventId, eventId, customerId: ev.customer_id,
      summary: `${actorName(profile)} rostered ${u?.full_name ?? u?.email ?? "a team member"}${role ? ` (${role})` : ""} on ${ev.name}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", eventId).eq("organisation_id", org.id);
    revalidatePath(`/events/${eventId}`);
  });
}

export async function updateEventStaff(id: string, patch: { role?: string | null; sees_details?: boolean | null }): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh the page and try again.");
    const next: Record<string, unknown> = {};
    if ("role" in patch) next.role = patch.role?.trim().slice(0, 60) || null;
    if ("sees_details" in patch) next.sees_details = patch.sees_details === null ? null : !!patch.sees_details;
    const { data, error } = await supabase.from("event_staff").update(next).eq("id", id).eq("organisation_id", org.id).select("event_id").maybeSingle();
    if (error) throw new Error(error.message);
    if (data) revalidatePath(`/events/${data.event_id}`);
  });
}

export async function removeEventStaff(id: string): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh the page and try again.");
    const { data: row } = await supabase.from("event_staff").select("event_id, user:users!event_staff_user_id_fkey(full_name, email)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!row) return;
    const ev = await eventName(supabase, org.id, row.event_id as string);
    const { error } = await supabase.from("event_staff").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    const u = row.user as unknown as { full_name: string | null; email: string } | null;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.staff_removed", entityType: "event", entityId: ev.id, eventId: ev.id, customerId: ev.customer_id,
      summary: `${actorName(profile)} took ${u?.full_name ?? u?.email ?? "a team member"} off ${ev.name}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", ev.id).eq("organisation_id", org.id);
    revalidatePath(`/events/${ev.id}`);
  });
}

// ---------------------------------------------------------------------------
// The client's people on a job (who to contact, who gets the calendar invite)
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function addJobPerson(eventId: string, input: { contactId?: string; first?: string; last?: string; email?: string; phone?: string; role?: string; sendInvite?: boolean }): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventId)) throw new Error("Refresh the page and try again.");
    const ev = await eventName(supabase, org.id, eventId);
    let contactId = input.contactId && UUID.test(input.contactId) ? input.contactId : null;
    let who = "";
    if (contactId) {
      const { data: c } = await supabase.from("contacts").select("id, first_name, last_name, customer_id").eq("id", contactId).eq("organisation_id", org.id).maybeSingle();
      if (!c || c.customer_id !== ev.customer_id) throw new Error("That person isn't a contact of this client.");
      who = `${c.first_name} ${c.last_name ?? ""}`.trim();
    } else {
      const first = input.first?.trim().slice(0, 100) ?? "";
      const email = input.email?.trim().toLowerCase() ?? "";
      if (!first) throw new Error("Enter their first name.");
      if (email && !EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
      if (email) {
        const { data: existing } = await supabase.from("contacts").select("id").eq("organisation_id", org.id).eq("customer_id", ev.customer_id).ilike("email", email).maybeSingle();
        contactId = existing?.id ?? null;
      }
      if (!contactId) {
        const { data: c, error } = await supabase.from("contacts").insert({
          organisation_id: org.id, customer_id: ev.customer_id, first_name: first, last_name: input.last?.trim().slice(0, 100) || null,
          email: email || null, phone: input.phone?.trim().slice(0, 40) || null, is_primary: false, created_by: user.id,
        }).select("id").single();
        if (error) throw new Error(error.message);
        contactId = c.id as string;
      }
      who = `${first} ${input.last ?? ""}`.trim();
    }
    const { data: link, error } = await supabase.from("event_contacts").upsert({ organisation_id: org.id, event_id: eventId, contact_id: contactId, role: input.role?.trim().slice(0, 60) || null },
      { onConflict: "event_id,contact_id" }).select("id").single();
    if (error) throw new Error(error.message);
    if (input.sendInvite) {
      const problem = await invitePerson(link.id as string);
      if (problem) throw new Error(`Added to the job, but the portal invite wasn't sent: ${problem}`);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.person_added", entityType: "event", entityId: eventId, eventId, customerId: ev.customer_id,
      summary: `${actorName(profile)} added ${who} to ${ev.name}${input.role ? ` (${input.role})` : ""}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", eventId).eq("organisation_id", org.id);
    revalidatePath(`/events/${eventId}`);
  });
}

export async function removeJobPerson(eventContactId: string): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventContactId)) throw new Error("Refresh the page and try again.");
    const { data: row } = await supabase.from("event_contacts").select("event_id, contact_id, contact:contacts(first_name, last_name)").eq("id", eventContactId).eq("organisation_id", org.id).maybeSingle();
    if (!row) return;
    const ev = await eventName(supabase, org.id, row.event_id as string);
    const { data: e } = await supabase.from("events").select("primary_contact_id").eq("id", ev.id).maybeSingle();
    if (e?.primary_contact_id === row.contact_id) throw new Error("Make someone else the main contact first.");
    const { error } = await supabase.from("event_contacts").delete().eq("id", eventContactId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    const c = row.contact as unknown as { first_name: string; last_name: string | null } | null;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.person_removed", entityType: "event", entityId: ev.id, eventId: ev.id, customerId: ev.customer_id,
      summary: `${actorName(profile)} took ${c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "a contact"} off ${ev.name}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", ev.id).eq("organisation_id", org.id);
    revalidatePath(`/events/${ev.id}`);
  });
}

/** Hand the job over: this person becomes the main contact. */
export async function makeMainContact(eventId: string, contactId: string): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventId) || !UUID.test(contactId)) throw new Error("Refresh the page and try again.");
    const ev = await eventName(supabase, org.id, eventId);
    const { data: c } = await supabase.from("contacts").select("first_name, last_name, customer_id").eq("id", contactId).eq("organisation_id", org.id).maybeSingle();
    if (!c || c.customer_id !== ev.customer_id) throw new Error("That person isn't a contact of this client.");
    const { error } = await supabase.from("events").update({ primary_contact_id: contactId }).eq("id", eventId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    await supabase.from("event_contacts").upsert({ organisation_id: org.id, event_id: eventId, contact_id: contactId }, { onConflict: "event_id,contact_id", ignoreDuplicates: true });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.main_contact", entityType: "event", entityId: eventId, eventId, customerId: ev.customer_id,
      summary: `${actorName(profile)} made ${`${c.first_name} ${c.last_name ?? ""}`.trim()} the main contact for ${ev.name}` });
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("event_id", eventId).eq("organisation_id", org.id);
    revalidatePath(`/events/${eventId}`);
  });
}

/** Email a job contact a link to the booking in the client portal. Returns a problem or null. */
async function invitePerson(eventContactId: string): Promise<string | null> {
  const { supabase, org, profile } = await office();
  const { data: row } = await supabase.from("event_contacts")
    .select("id, event:events(id, name, event_date), contact:contacts(first_name, email)").eq("id", eventContactId).eq("organisation_id", org.id).maybeSingle();
  const r = row as unknown as { id: string; event: { id: string; name: string; event_date: string | null } | null; contact: { first_name: string; email: string | null } | null } | null;
  if (!r?.event || !r.contact) return "that person is no longer on the job";
  if (!r.contact.email) return "they don't have an email address";
  const { sendPortalInvite } = await import("@/lib/email/portal-invite");
  const problem = await sendPortalInvite({ org, event: r.event, to: r.contact.email, firstName: r.contact.first_name,
    invitedBy: profile.full_name ? `${profile.full_name} from ${org.name}` : org.name, replyTo: profile.email });
  if (!problem) await supabase.from("event_contacts").update({ invited_at: new Date().toISOString() }).eq("id", r.id);
  return problem;
}

export async function sendJobPortalInvite(eventContactId: string): Promise<StaffResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(eventContactId)) throw new Error("Refresh the page and try again.");
    const problem = await invitePerson(eventContactId);
    if (problem) throw new Error(`The invite wasn't sent: ${problem}.`);
    const { data } = await supabase.from("event_contacts").select("event_id").eq("id", eventContactId).maybeSingle();
    if (data) {
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.portal_invite", entityType: "event", entityId: data.event_id as string, eventId: data.event_id as string,
        summary: `${actorName(profile)} emailed a client portal invite` });
      revalidatePath(`/events/${data.event_id}`);
    }
  });
}
