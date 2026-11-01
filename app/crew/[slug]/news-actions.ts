"use server";

import { revalidatePath } from "next/cache";
import { crewSession } from "@/lib/crew/server";
import { markNoticesRead } from "@/lib/crew/notices";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** They've seen these (the red dot goes). */
export async function seenNotices(slug: string, ids: string[]) {
  const s = await crewSession(slug);
  if (!s) return;
  const list = ids.filter((x) => UUID.test(x)).slice(0, 100);
  if (!list.length) return;
  const { data } = await s.db.from("staff_notices").select("id").eq("organisation_id", s.org.id).in("id", list);
  await markNoticesRead(s, ((data ?? []) as { id: string }[]).map((n) => n.id));
  revalidatePath(`/crew/${slug}`, "layout");
}

/** "Got it" on a notice that asks for it. */
export async function confirmNotice(slug: string, id: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const s = await crewSession(slug);
  if (!s) return { ok: false, error: "You've been signed out — sign in again." };
  if (!UUID.test(id)) return { ok: false, error: "Refresh and try again." };
  const { data: n } = await s.db.from("staff_notices").select("id").eq("id", id).eq("organisation_id", s.org.id).maybeSingle();
  if (!n) return { ok: false, error: "That notice has been taken down." };
  const { error } = await s.db.from("staff_notice_reads").upsert({ notice_id: id, crew_member_id: s.member.id, organisation_id: s.org.id, confirmed_at: new Date().toISOString() }, { onConflict: "notice_id,crew_member_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/crew/${slug}`, "layout");
  return { ok: true, message: "Thanks — the office can see you've read it." };
}
