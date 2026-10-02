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
    const { error } = await supabase.from("event_crew").insert({ organisation_id: org.id, event_id: eventId, crew_member_id: crewId, role: r });
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
