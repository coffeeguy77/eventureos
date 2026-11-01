import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Kitchen ticks: each catering item for a job and day is Ready or has an Issue (who, when), with running notes. */
export interface ItemState { status: "ready" | "issue" | null; by: string | null; at: string | null; notes: { body: string; by: string | null; at: string }[] }
export const itemKey = (eventId: string, day: string, item: string) => `${eventId}|${day}|${item}`;

export async function loadItemStates(db: SupabaseClient, orgId: string, eventIds: string[]): Promise<Record<string, ItemState>> {
  const out: Record<string, ItemState> = {};
  if (!eventIds.length) return out;
  const [{ data: st, error }, { data: nt }] = await Promise.all([
    db.from("kitchen_item_status").select("event_id, day, item, status, by_name, updated_at").eq("organisation_id", orgId).in("event_id", eventIds),
    db.from("kitchen_item_notes").select("event_id, day, item, body, by_name, created_at").eq("organisation_id", orgId).in("event_id", eventIds).order("created_at"),
  ]);
  if (error) return out; // before database update 0088
  const get = (k: string) => (out[k] ??= { status: null, by: null, at: null, notes: [] });
  for (const r of (st ?? []) as { event_id: string; day: string; item: string; status: "ready" | "issue"; by_name: string | null; updated_at: string }[]) Object.assign(get(itemKey(r.event_id, r.day, r.item)), { status: r.status, by: r.by_name, at: r.updated_at });
  for (const n of (nt ?? []) as { event_id: string; day: string; item: string; body: string; by_name: string | null; created_at: string }[]) get(itemKey(n.event_id, n.day, n.item)).notes.push({ body: n.body, by: n.by_name, at: n.created_at });
  return out;
}

async function logToJob(db: SupabaseClient, orgId: string, eventId: string, who: string, summary: string) {
  await db.from("activity_logs").insert({ organisation_id: orgId, actor_type: "system", actor_label: `${who} (kitchen)`, action: "kitchen.item", entity_type: "event", entity_id: eventId, event_id: eventId, summary: summary.slice(0, 500) });
}

/** Set (or clear, status null) an item's status. Tapping again changes it. */
export async function setItemState(db: SupabaseClient, orgId: string, v: { eventId: string; day: string; item: string; status: "ready" | "issue" | null; memberId: string | null; name: string }) {
  const { data: ev } = await db.from("events").select("id").eq("id", v.eventId).eq("organisation_id", orgId).maybeSingle();
  if (!ev) throw new Error("That job no longer exists.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.day) || !v.item.trim()) throw new Error("Refresh and try again.");
  const item = v.item.trim().slice(0, 200);
  if (!v.status) {
    const { error } = await db.from("kitchen_item_status").delete().eq("event_id", v.eventId).eq("day", v.day).eq("item", item);
    if (error) throw new Error(/kitchen_item/.test(error.message) ? "Run the latest database update (0088) first." : error.message);
    await logToJob(db, orgId, v.eventId, v.name, `${v.name} cleared “${item}” (${v.day})`);
    return;
  }
  const { error } = await db.from("kitchen_item_status").upsert({ organisation_id: orgId, event_id: v.eventId, day: v.day, item, status: v.status, crew_member_id: v.memberId, by_name: v.name, updated_at: new Date().toISOString() });
  if (error) throw new Error(/kitchen_item/.test(error.message) ? "Run the latest database update (0088) first." : error.message);
  await logToJob(db, orgId, v.eventId, v.name, `${v.name} marked “${item}” ${v.status === "ready" ? "ready" : "as having an issue"} (${v.day})`);
}

export async function addItemNote(db: SupabaseClient, orgId: string, v: { eventId: string; day: string; item: string; body: string; memberId: string | null; name: string }) {
  const body = v.body.trim().slice(0, 2000);
  if (!body) throw new Error("Write the note.");
  const { data: ev } = await db.from("events").select("id").eq("id", v.eventId).eq("organisation_id", orgId).maybeSingle();
  if (!ev) throw new Error("That job no longer exists.");
  const item = v.item.trim().slice(0, 200);
  const { error } = await db.from("kitchen_item_notes").insert({ organisation_id: orgId, event_id: v.eventId, day: v.day, item, body, crew_member_id: v.memberId, by_name: v.name });
  if (error) throw new Error(/kitchen_item/.test(error.message) ? "Run the latest database update (0088) first." : error.message);
  await logToJob(db, orgId, v.eventId, v.name, `Kitchen note on “${item}”: ${body}`);
}
