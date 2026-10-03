import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upcoming confirmed jobs that aren't properly staffed: not enough people, people who haven't accepted,
 * people who declined the Google Calendar invite (bypassing the app), or shifts on the job board waiting for cover.
 */
export interface StaffingIssue {
  eventId: string; name: string; date: string | null; needed: number; accepted: number;
  short: number; waiting: string[]; declined: string[]; cover: string[];
}

export async function staffingIssues(db: SupabaseClient, orgId: string, from: string, to: string): Promise<StaffingIssue[] | null> {
  const { data, error } = await db.from("events")
    .select("id, name, event_date, crew_needed, crew:event_crew(status, calendar_response, board_posted_at, member:crew_members(name))")
    .eq("organisation_id", orgId).eq("status", "confirmed").gte("event_date", from).lte("event_date", to).order("event_date").limit(200);
  if (error) return null; // before the staff-app database update
  type Row = { id: string; name: string; event_date: string | null; crew_needed: number | null; crew: { status: string; calendar_response: string | null; board_posted_at: string | null; member: { name: string } | null }[] };
  return ((data ?? []) as unknown as Row[]).map((e) => {
    const on = e.crew.filter((c) => c.status === "offered" || c.status === "confirmed");
    const declined = on.filter((c) => c.calendar_response === "declined").map((c) => c.member?.name ?? "?");
    const accepted = on.filter((c) => c.status === "confirmed" && c.calendar_response !== "declined").length;
    const needed = e.crew_needed ?? 1;
    return {
      eventId: e.id, name: e.name, date: e.event_date, needed, accepted,
      short: Math.max(0, needed - on.filter((c) => c.calendar_response !== "declined").length),
      waiting: on.filter((c) => c.status === "offered" && c.calendar_response !== "declined").map((c) => c.member?.name ?? "?"),
      declined, cover: on.filter((c) => c.board_posted_at).map((c) => c.member?.name ?? "?"),
    };
  }).filter((i) => i.needed > 0 && (i.short > 0 || i.waiting.length || i.declined.length || i.cover.length));
}
