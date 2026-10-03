"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

/**
 * The staff list (people without an EventureOS login, e.g. casual baristas): who's on it, and who works each job.
 * People on a job — and anyone set to "always invite" — get the job's Google Calendar invite.
 */
export type CrewResult = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the staff list and rosters.");
  return ctx;
}
async function wrap(fn: () => Promise<void>): Promise<CrewResult> {
  try { await fn(); return { ok: true }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
/** Re-send the job's calendar invite on the next sync (guest list changed). */
async function resync(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, eventId?: string) {
  let q = supabase.from("calendar_events").update({ sync_status: "pending" }).eq("organisation_id", orgId).eq("kind", "event").neq("sync_status", "local");
  if (eventId) q = q.eq("event_id", eventId);
  else q = q.gte("ends_at", new Date().toISOString());
  await q;
}

export interface CrewInput { name: string; email: string | null; phone: string | null; role: string | null; always_invite: boolean; active?: boolean }

function clean(input: CrewInput) {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("Add a name.");
  const email = String(input.email ?? "").trim().toLowerCase() || null;
  if (email && !EMAIL.test(email)) throw new Error(`“${email}” isn't a valid email address.`);
  return {
    name, email, phone: String(input.phone ?? "").trim().slice(0, 40) || null, role: String(input.role ?? "").trim().slice(0, 60) || null,
    always_invite: !!input.always_invite, ...(input.active === undefined ? {} : { active: !!input.active }),
  };
}

export async function saveCrewMember(id: string | null, input: CrewInput): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    const row = clean(input);
    const res = id
      ? (UUID.test(id) ? await supabase.from("crew_members").update(row).eq("id", id).eq("organisation_id", org.id) : (() => { throw new Error("Refresh and try again."); })())
      : await supabase.from("crew_members").insert({ organisation_id: org.id, ...row });
    if (res.error) throw new Error(res.error.code === "23505" ? "Someone on the staff list already has that email." : res.error.message);
    // "Always invite" affects every upcoming job's invite
    await resync(supabase, org.id);
    revalidatePath("/settings/team");
  });
}

export async function addEventCrew(eventId: string, crewId: string, role: string | null): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(eventId) || !UUID.test(crewId)) throw new Error("Choose someone from the staff list.");
    const [{ data: ev }, { data: m }] = await Promise.all([
      supabase.from("events").select("id, name, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle(),
      supabase.from("crew_members").select("name, role").eq("id", crewId).eq("organisation_id", org.id).eq("active", true).maybeSingle(),
    ]);
    if (!ev) throw new Error("That event no longer exists.");
    if (!m) throw new Error("That person isn't on the staff list.");
    const r = role?.trim().slice(0, 60) || m.role || null;
    // A hand-up (TBC interest) becomes a real offer; otherwise a new offer waiting for them to accept
    const { data: had } = await supabase.from("event_crew").select("id, status").eq("event_id", eventId).eq("crew_member_id", crewId).maybeSingle();
    const { error } = had
      ? (had.status === "interested" ? await supabase.from("event_crew").update({ status: "offered" }).eq("id", had.id) : { error: { code: "23505", message: "" } })
      : await supabase.from("event_crew").insert({ organisation_id: org.id, event_id: eventId, crew_member_id: crewId, role: r });
    if (error) throw new Error(error.code === "23505" ? `${m.name} is already on this job.` : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_added", entityType: "event", entityId: eventId, eventId, customerId: ev.customer_id,
      summary: `${actorName(profile)} rostered ${m.name}${r ? ` (${r})` : ""} on ${ev.name}` });
    await resync(supabase, org.id, eventId);
    revalidatePath(`/events/${eventId}`);
  });
}

export async function removeEventCrew(id: string): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: row } = await supabase.from("event_crew").select("event_id, member:crew_members(name), event:events(name, customer_id)")
      .eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!row) return;
    const { error } = await supabase.from("event_crew").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    const r = row as unknown as { event_id: string; member: { name: string } | null; event: { name: string; customer_id: string } | null };
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_removed", entityType: "event", entityId: r.event_id, eventId: r.event_id,
      customerId: r.event?.customer_id, summary: `${actorName(profile)} took ${r.member?.name ?? "someone"} off ${r.event?.name ?? "the job"}` });
    await resync(supabase, org.id, r.event_id);
    revalidatePath(`/events/${r.event_id}`);
  });
}

// ---------------------------------------------------------------------------
// Staff app: pay rates, preference order, invites, shift status
// ---------------------------------------------------------------------------

export async function setStaffRate(crewId: string, rate: number | null): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    if (!UUID.test(crewId)) throw new Error("Refresh and try again.");
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 500)) throw new Error("Enter an hourly rate between $0 and $500.");
    const { error } = await supabase.from("crew_members").update({ hourly_rate: rate == null ? null : Math.round(rate * 100) / 100 }).eq("id", crewId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/team"); revalidatePath("/wages");
  });
}

export async function setDefaultStaffRate(rate: number): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org, role } = await manager();
    if (role === "manager") throw new Error("Only owners and admins can change the default pay rate.");
    if (!Number.isFinite(rate) || rate < 0 || rate > 500) throw new Error("Enter an hourly rate between $0 and $500.");
    const { error } = await supabase.from("organisations").update({ staff_hourly_rate: Math.round(rate * 100) / 100 }).eq("id", org.id);
    if (error) throw new Error(/staff_hourly_rate/.test(error.message) ? "Run the staff-app database update first." : error.message);
    revalidatePath("/settings/team"); revalidatePath("/wages");
  });
}

/** Move someone up or down the preference list (top = first pick for TBC jobs). */
export async function moveCrewRank(crewId: string, dir: -1 | 1): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    const { data, error } = await supabase.from("crew_members").select("id, rank, name").eq("organisation_id", org.id).eq("active", true).order("rank").order("name");
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.id as string);
    const i = ids.indexOf(crewId), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await Promise.all(ids.map((id, n) => supabase.from("crew_members").update({ rank: (n + 1) * 10 }).eq("id", id).eq("organisation_id", org.id)));
    revalidatePath("/settings/team");
  });
}

/** Email someone the link to the staff app. */
export async function inviteCrewToApp(crewId: string): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org, profile } = await manager();
    if (!UUID.test(crewId)) throw new Error("Refresh and try again.");
    const { data: m } = await supabase.from("crew_members").select("name, email, active").eq("id", crewId).eq("organisation_id", org.id).maybeSingle();
    if (!m) throw new Error("That person isn't on the staff list.");
    if (!m.email) throw new Error(`Add ${m.name}'s email first.`);
    const { data: o } = await supabase.from("organisations").select("slug, brand_colour, logo_url, contact_email").eq("id", org.id).single();
    const { emailConfigured, sendEmail } = await import("@/lib/email/send");
    if (!emailConfigured()) throw new Error("Email isn't set up (RESEND_API_KEY).");
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    const { staffAppInviteEmail } = await import("@/lib/email/templates");
    const msg = staffAppInviteEmail({ businessName: org.name, firstName: m.name.split(" ")[0], inviterName: profile.full_name ?? null, url: `${appBaseUrl()}/crew/${o!.slug}`, brand: o!.brand_colour, logoUrl: o!.logo_url });
    await sendEmail({ to: m.email, ...msg, replyTo: profile.email ?? o!.contact_email, fromName: org.name });
    await supabase.from("crew_members").update({ app_invited_at: new Date().toISOString() }).eq("id", crewId);
    revalidatePath("/settings/team");
  });
}

/** Office decides a shift: give a TBC hand-up the shift, or mark someone as confirmed (e.g. they said yes by text). */
export async function setCrewStatus(eventCrewId: string, status: "offered" | "confirmed"): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(eventCrewId)) throw new Error("Refresh and try again.");
    const { data: row } = await supabase.from("event_crew").select("event_id, status, member:crew_members(name), event:events(name, customer_id)").eq("id", eventCrewId).eq("organisation_id", org.id).maybeSingle();
    if (!row) throw new Error("That shift no longer exists.");
    const { error } = await supabase.from("event_crew").update({ status, ...(status === "confirmed" ? { responded_at: new Date().toISOString() } : {}) }).eq("id", eventCrewId);
    if (error) throw new Error(error.message);
    const r = row as unknown as { event_id: string; status: string; member: { name: string } | null; event: { name: string; customer_id: string } | null };
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "event.crew_status", entityType: "event", entityId: r.event_id, eventId: r.event_id, customerId: r.event?.customer_id,
      summary: `${actorName(profile)} ${status === "confirmed" ? "marked" : "gave"} ${r.member?.name ?? "someone"} ${status === "confirmed" ? "as confirmed on" : "the shift on"} ${r.event?.name ?? "the job"}` });
    await resync(supabase, org.id, r.event_id);
    revalidatePath(`/events/${r.event_id}`);
  });
}

export async function setCrewNeeds(eventId: string, needed: number | null, notes: string | null): Promise<CrewResult> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    if (!UUID.test(eventId)) throw new Error("Refresh and try again.");
    if (needed != null && (!Number.isInteger(needed) || needed < 0 || needed > 50)) throw new Error("Enter how many staff (0–50).");
    const { error } = await supabase.from("events").update({ crew_needed: needed, crew_notes: notes?.trim().slice(0, 4000) || null }).eq("id", eventId).eq("organisation_id", org.id);
    if (error) throw new Error(/crew_needed|crew_notes/.test(error.message) ? "Run the staff-app database update first." : error.message);
    revalidatePath(`/events/${eventId}`);
  });
}
