import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/format";

/** Today's checklists (opening, closing, an area's…) with what's ticked — for the café iPad and the staff app. */
export interface TodayChecklist { id: string; name: string; area: string | null; dueBy: string | null; items: { text: string; done: boolean; by: string | null }[] }

export async function todaysChecklists(db: SupabaseClient, org: { id: string; timezone: string }): Promise<TodayChecklist[]> {
  const today = todayISO(org.timezone), dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const { data, error } = await db.from("roster_checklists").select("id, name, due_by, items, weekdays, area:roster_areas(name)").eq("organisation_id", org.id).eq("active", true).order("position").order("name");
  if (error || !data?.length) return [];
  const list = (data as unknown as { id: string; name: string; due_by: string | null; items: string[]; weekdays: number[]; area: { name: string } | null }[]).filter((c) => c.weekdays.includes(dow));
  if (!list.length) return [];
  const { data: ticks } = await db.from("roster_checklist_ticks").select("checklist_id, item, member:crew_members(name)").eq("day", today).in("checklist_id", list.map((c) => c.id));
  const t = (ticks ?? []) as unknown as { checklist_id: string; item: number; member: { name: string } | null }[];
  return list.map((c) => ({ id: c.id, name: c.name, area: c.area?.name ?? null, dueBy: c.due_by?.slice(0, 5) ?? null, items: c.items.map((text, i) => {
    const k = t.find((x) => x.checklist_id === c.id && x.item === i);
    return { text, done: !!k, by: k ? k.member?.name ?? "iPad" : null };
  }) }));
}

/** Tick (or untick) an item for today. */
export async function tickItem(db: SupabaseClient, org: { id: string; timezone: string }, checklistId: string, item: number, memberId: string | null, done: boolean) {
  const { data: c } = await db.from("roster_checklists").select("id, items").eq("id", checklistId).eq("organisation_id", org.id).eq("active", true).maybeSingle();
  if (!c || !Number.isInteger(item) || item < 0 || item >= (c.items as string[]).length) throw new Error("Refresh and try again.");
  const day = todayISO(org.timezone);
  if (done) await db.from("roster_checklist_ticks").upsert({ checklist_id: checklistId, organisation_id: org.id, day, item, crew_member_id: memberId, ticked_at: new Date().toISOString() }, { onConflict: "checklist_id,day,item" });
  else await db.from("roster_checklist_ticks").delete().eq("checklist_id", checklistId).eq("day", day).eq("item", item);
}
