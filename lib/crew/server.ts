import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { staffMinHours } from "./shifts";

/**
 * The staff app (/crew/[slug]). Staff aren't EventureOS users of the organisation: they sign in with an emailed code,
 * and every read/write here goes through the server with the service role, scoped to their own crew record.
 */
export interface CrewOrg {
  id: string; name: string; slug: string; logo_url: string | null; brand_colour: string | null; timezone: string; currency: string;
  contact_email: string | null; contact_phone: string | null; staff_hourly_rate: number; staff_min_hours: number;
}
export interface CrewMember { id: string; name: string; email: string | null; phone: string | null; role: string | null; hourly_rate: number | null; rank: number }
export interface CrewSession { db: SupabaseClient; org: CrewOrg; member: CrewMember; userId: string }

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

export async function crewOrg(slug: string): Promise<CrewOrg | null> {
  if (!SLUG.test(slug)) return null;
  const db = createServiceClient();
  const { data, error } = await db.from("organisations")
    .select("id, name, slug, logo_url, brand_colour, timezone, currency, contact_email, contact_phone, staff_hourly_rate, settings").eq("slug", slug).maybeSingle();
  if (error && /staff_hourly_rate/.test(error.message)) {
    const { data: d2 } = await db.from("organisations").select("id, name, slug, logo_url, brand_colour, timezone, currency, contact_email, contact_phone").eq("slug", slug).maybeSingle();
    return d2 ? { ...(d2 as Omit<CrewOrg, "staff_hourly_rate" | "staff_min_hours">), staff_hourly_rate: 30, staff_min_hours: 3 } : null;
  }
  if (!data) return null;
  const { settings, ...rest } = data as CrewOrg & { settings?: Record<string, unknown> };
  return { ...rest, staff_hourly_rate: Number(rest.staff_hourly_rate ?? 30), staff_min_hours: staffMinHours(settings) };
}

/** The signed-in staff member for this organisation, linking their login to their staff record the first time. */
export async function crewSession(slug: string): Promise<CrewSession | null> {
  const org = await crewOrg(slug);
  if (!org) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const db = createServiceClient();
  const cols = "id, name, email, phone, role, hourly_rate, rank, user_id, app_last_seen_at";
  let { data: m } = await db.from("crew_members").select(cols).eq("organisation_id", org.id).eq("active", true).eq("user_id", user.id).maybeSingle();
  if (!m) {
    // Signed in with their main email or one of their extra emails
    const id = await crewIdForEmail(db, org.id, user.email);
    if (id) {
      const { data: byEmail } = await db.from("crew_members").select(cols).eq("id", id).maybeSingle();
      if (byEmail) {
        if (!byEmail.user_id) await db.from("crew_members").update({ user_id: user.id }).eq("id", byEmail.id);
        m = byEmail;
      }
    }
  }
  if (!m) return null;
  const seen = m.app_last_seen_at ? Date.parse(m.app_last_seen_at as string) : 0;
  if (Date.now() - seen > 15 * 60_000) await db.from("crew_members").update({ app_last_seen_at: new Date().toISOString() }).eq("id", m.id);
  return {
    db, org, userId: user.id,
    member: { id: m.id, name: m.name, email: m.email, phone: m.phone, role: m.role, hourly_rate: m.hourly_rate == null ? null : Number(m.hourly_rate), rank: Number(m.rank ?? 100) },
  };
}

const likeExact = (e: string) => e.replace(/[%_\\]/g, "\\$&");

/** The active staff member an email belongs to (their main email, or an extra email added in Settings → Team). */
export async function crewIdForEmail(db: SupabaseClient, orgId: string, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  const { data: main } = await db.from("crew_members").select("id").eq("organisation_id", orgId).eq("active", true).ilike("email", likeExact(e)).maybeSingle();
  if (main) return main.id as string;
  const { data: extra, error } = await db.from("crew_member_emails").select("crew_member_id, member:crew_members!inner(active)").eq("organisation_id", orgId).ilike("email", likeExact(e)).eq("member.active", true).maybeSingle();
  if (error) return null; // before the database update
  return (extra?.crew_member_id as string | undefined) ?? null;
}

export async function requireCrew(slug: string): Promise<CrewSession> {
  const s = await crewSession(slug);
  if (!s) redirect(`/crew/${slug}/login`);
  return s;
}

/** Tell the office (bell notifications + activity log). */
export async function tellOffice(s: CrewSession, o: { type: string; title: string; body?: string | null; eventId?: string | null; link?: string | null; summary?: string }) {
  await s.db.from("notifications").insert({
    organisation_id: s.org.id, type: o.type, title: o.title.slice(0, 200), body: o.body?.slice(0, 500) ?? null,
    link: o.link ?? (o.eventId ? `/events/${o.eventId}` : "/wages"), entity_type: o.eventId ? "event" : "crew_member", entity_id: o.eventId ?? s.member.id,
  });
  await s.db.from("activity_logs").insert({
    organisation_id: s.org.id, actor_type: "system", actor_label: `${s.member.name} (staff app)`, action: o.type, entity_type: o.eventId ? "event" : "crew_member",
    entity_id: o.eventId ?? s.member.id, event_id: o.eventId ?? null, summary: (o.summary ?? o.title).slice(0, 500),
  });
}

/** The job's calendar invite changed (who's working it) — update Google now if we can, else on the next sync. */
export async function resyncJobCalendar(db: SupabaseClient, orgId: string, eventId: string) {
  const { data: rows } = await db.from("calendar_events").update({ sync_status: "pending" })
    .eq("organisation_id", orgId).eq("event_id", eventId).eq("kind", "event").neq("sync_status", "local").select("id");
  const ids = (rows ?? []).map((r) => r.id as string);
  if (!ids.length) return;
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { pushCalendarRowsNow } = await import("@/lib/integrations/google-calendar");
    const ctx = await buildContext(db, "service", orgId, "google_calendar", null);
    await pushCalendarRowsNow(ctx, ids);
  } catch { /* the nightly sync will send it */ }
}
