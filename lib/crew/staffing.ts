import type { SupabaseClient } from "@supabase/supabase-js";
import { isRosterOnly, isVanJob, staffNeededFromLines } from "./skills";

/**
 * Upcoming confirmed jobs that aren't properly staffed: not enough people, people who haven't accepted,
 * people who declined the Google Calendar invite (bypassing the app), shifts on the job board waiting for cover,
 * or a coffee van job with nobody rostered who can drive it.
 * "Rosters only" people (office) are never counted as working the job.
 * How many are needed: the job's own number, else the accepted quote's staff lines, else 1.
 */
export interface StaffingIssue {
  eventId: string; name: string; date: string | null; needed: number; accepted: number;
  short: number; waiting: string[]; declined: string[]; cover: string[];
  /** Coffee van job and nobody rostered has "Licence" ticked (only checked once someone on the staff list has it ticked) */
  noDriver?: boolean;
}

type Crew = { status: string; calendar_response: string | null; board_posted_at: string | null; member: { name: string; skills?: string[] | null } | null };

export async function staffingIssues(db: SupabaseClient, orgId: string, from: string, to: string): Promise<StaffingIssue[] | null> {
  const base = "id, name, event_date, crew_needed";
  let { data, error } = await db.from("events")
    .select(`${base}, crew:event_crew(status, calendar_response, board_posted_at, member:crew_members(name, skills))`)
    .eq("organisation_id", orgId).eq("status", "confirmed").gte("event_date", from).lte("event_date", to).order("event_date").limit(200);
  if (error && /skills/.test(error.message)) ({ data, error } = await db.from("events")
    .select(`${base}, crew:event_crew(status, calendar_response, board_posted_at, member:crew_members(name))`)
    .eq("organisation_id", orgId).eq("status", "confirmed").gte("event_date", from).lte("event_date", to).order("event_date").limit(200));
  if (error) return null; // before the staff-app database update
  type Row = { id: string; name: string; event_date: string | null; crew_needed: number | null; crew: Crew[] };
  const rows = (data ?? []) as unknown as Row[];

  // The accepted quote's lines (staff numbers, and whether it's a van job)
  const lines = new Map<string, { name: string; details: unknown }[]>();
  if (rows.length) {
    const { data: qs } = await db.from("quotes").select("event_id, items:quote_items(name, details)").eq("organisation_id", orgId).eq("status", "accepted").in("event_id", rows.map((r) => r.id));
    for (const q of (qs ?? []) as unknown as { event_id: string; items: { name: string; details: unknown }[] }[]) lines.set(q.event_id, [...(lines.get(q.event_id) ?? []), ...(q.items ?? [])]);
  }
  const { count: drivers } = await db.from("crew_members").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("active", true).contains("skills", ["driver"]);
  const checkDrivers = (drivers ?? 0) > 0;

  return rows.map((e) => {
    const ls = lines.get(e.id) ?? [];
    const on = e.crew.filter((c) => (c.status === "offered" || c.status === "confirmed") && !isRosterOnly(c.member?.skills));
    const declined = on.filter((c) => c.calendar_response === "declined").map((c) => c.member?.name ?? "?");
    const accepted = on.filter((c) => c.status === "confirmed" && c.calendar_response !== "declined").length;
    const needed = e.crew_needed ?? staffNeededFromLines(ls) ?? 1;
    const working = on.filter((c) => c.calendar_response !== "declined");
    const noDriver = checkDrivers && needed > 0 && working.length > 0 && isVanJob([e.name, ...ls.map((l) => l.name)]) && !working.some((c) => c.member?.skills?.includes("driver"));
    return {
      eventId: e.id, name: e.name, date: e.event_date, needed, accepted,
      short: Math.max(0, needed - working.length),
      waiting: on.filter((c) => c.status === "offered" && c.calendar_response !== "declined").map((c) => c.member?.name ?? "?"),
      declined, cover: on.filter((c) => c.board_posted_at).map((c) => c.member?.name ?? "?"), noDriver,
    };
  }).filter((i) => i.needed > 0 && (i.short > 0 || i.waiting.length || i.declined.length || i.cover.length || i.noDriver));
}

/** How many people a job needs from its accepted quote (null when the quote doesn't say). */
export async function staffNeededForJob(db: SupabaseClient, eventId: string): Promise<number | null> {
  const { data } = await db.from("quotes").select("items:quote_items(details)").eq("event_id", eventId).eq("status", "accepted");
  const items = ((data ?? []) as unknown as { items: { details: unknown }[] }[]).flatMap((q) => q.items ?? []);
  return staffNeededFromLines(items);
}
