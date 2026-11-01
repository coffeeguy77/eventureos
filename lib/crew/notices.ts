import "server-only";
import type { CrewSession } from "./server";
import { todayISO } from "@/lib/format";

/** The notice board in the staff app: news from the office to everyone, or to this person. */
export interface Notice { id: string; title: string; body: string | null; needs_ok: boolean; pinned: boolean; created_at: string; read: boolean; confirmed: boolean }

export async function myNotices(s: CrewSession): Promise<Notice[]> {
  const today = todayISO(s.org.timezone);
  const { data, error } = await s.db.from("staff_notices").select("id, title, body, needs_ok, pinned, created_at, member_ids, expires_on")
    .eq("organisation_id", s.org.id).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  if (error) return []; // before database update 0086
  const mine = ((data ?? []) as { id: string; title: string; body: string | null; needs_ok: boolean; pinned: boolean; created_at: string; member_ids: string[]; expires_on: string | null }[])
    .filter((n) => (!n.member_ids.length || n.member_ids.includes(s.member.id)) && (!n.expires_on || n.expires_on >= today));
  if (!mine.length) return [];
  const { data: reads } = await s.db.from("staff_notice_reads").select("notice_id, confirmed_at").eq("crew_member_id", s.member.id).in("notice_id", mine.map((n) => n.id));
  const r = new Map(((reads ?? []) as { notice_id: string; confirmed_at: string | null }[]).map((x) => [x.notice_id, x]));
  return mine.map((n) => ({ id: n.id, title: n.title, body: n.body, needs_ok: n.needs_ok, pinned: n.pinned, created_at: n.created_at, read: r.has(n.id), confirmed: !!r.get(n.id)?.confirmed_at }));
}

/** How many notices are new to them (the red dot), including ones still waiting for "Got it". */
export async function unreadNotices(s: CrewSession): Promise<number> {
  const list = await myNotices(s);
  return list.filter((n) => !n.read || (n.needs_ok && !n.confirmed)).length;
}

export async function markNoticesRead(s: CrewSession, ids: string[]) {
  if (!ids.length) return;
  await s.db.from("staff_notice_reads").upsert(ids.map((id) => ({ notice_id: id, crew_member_id: s.member.id, organisation_id: s.org.id })), { onConflict: "notice_id,crew_member_id", ignoreDuplicates: true });
}
