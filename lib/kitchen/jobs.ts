/**
 * Loads upcoming catering deliveries for an organisation — shared by the Kitchen page, the chef's staff app and the
 * kitchen emails. Two sources:
 *   1. website catering orders (events.catering — already one entry per delivery date);
 *   2. office jobs whose accepted quote has catering items, split by day with events.catering_days when set.
 * Works with the signed-in client or the service client (always filtered by organisation).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cateringGroup, isCatering } from "@/lib/events/core";
import { deliveriesFromEvent, type Delivery } from "./core";
import { readCateringDays, splitByDay, type CateringDays } from "./split";

export const ACTIVE_STATUSES = ["planning", "quoted", "awaiting_approval", "confirmed"];
export const FIRM_STATUSES = ["confirmed", "awaiting_approval"];

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export interface MenuItem { id: string; name: string; unit: string | null; group: string }
export interface CateringJobs { deliveries: Delivery[]; warnings: Record<string, string[]> }

type EvRow = { id: string; number: number | null; name: string; status: string; event_date: string | null; start_time: string | null; address: string | null; venue: string | null; guest_count: number | null; customer_notes: string | null; catering: unknown; customer: { name: string } | null };

/** Active catering menu items (services in a "Catering…" category). */
export async function cateringMenu(db: SupabaseClient, orgId: string): Promise<MenuItem[]> {
  const { data } = await db.from("services").select("id, name, category, unit, active, position").eq("organisation_id", orgId).order("position");
  return ((data ?? []) as { id: string; name: string; category: string | null; unit: string | null; active: boolean }[])
    .filter((s) => s.active && isCatering(s.category)).map((s) => ({ id: s.id, name: s.name, unit: s.unit, group: cateringGroup(s.category) }));
}

/** The saved catering-by-day plans for some jobs (empty if the 0061 update hasn't been run yet). */
export async function cateringPlans(db: SupabaseClient, orgId: string, eventIds: string[]): Promise<Map<string, CateringDays>> {
  const out = new Map<string, CateringDays>();
  if (!eventIds.length) return out;
  const { data, error } = await db.from("events").select("id, catering_days").eq("organisation_id", orgId).in("id", eventIds);
  if (error) return out;
  for (const r of (data ?? []) as { id: string; catering_days: unknown }[]) out.set(r.id, readCateringDays(r.catering_days));
  return out;
}

/** Accepted-quote catering items for some jobs, keyed by event id. */
export async function quoteCatering(db: SupabaseClient, orgId: string, eventIds: string[], cateringIds: Set<string>) {
  const out = new Map<string, { service_id: string; name: string; qty: number }[]>();
  if (!eventIds.length || !cateringIds.size) return out;
  const { data: qs } = await db.from("quotes").select("id, event_id").eq("organisation_id", orgId).eq("status", "accepted").in("event_id", eventIds);
  const quotes = (qs ?? []) as { id: string; event_id: string }[];
  if (!quotes.length) return out;
  const { data: items } = await db.from("quote_items").select("quote_id, service_id, name, quantity, position").eq("organisation_id", orgId).in("quote_id", quotes.map((q) => q.id)).order("position");
  for (const q of quotes) {
    const mine = ((items ?? []) as { quote_id: string; service_id: string | null; name: string; quantity: number }[])
      .filter((i) => i.quote_id === q.id && i.service_id && cateringIds.has(i.service_id))
      .map((i) => ({ service_id: i.service_id as string, name: i.name, qty: Number(i.quantity) }));
    if (mine.length) out.set(q.event_id, [...(out.get(q.event_id) ?? []), ...mine]);
  }
  return out;
}

/** Catering deliveries dated from `from` to `to` (inclusive), plus any split warnings per job. */
export async function loadCateringJobs(db: SupabaseClient, orgId: string, opts: { from: string; to: string; statuses?: string[]; menu?: MenuItem[]; eventIds?: string[] }): Promise<CateringJobs> {
  const statuses = opts.statuses ?? ACTIVE_STATUSES;
  let q = db.from("events").select("id, number, name, status, event_date, start_time, address, venue, guest_count, customer_notes, catering, customer:customers(name)")
    .eq("organisation_id", orgId).in("status", statuses).gte("event_date", addDays(opts.from, -31)).lte("event_date", opts.to).order("event_date").limit(1000);
  if (opts.eventIds) q = q.in("id", opts.eventIds);
  const { data: evs } = await q;
  const events = (evs ?? []) as unknown as EvRow[];
  const deliveries: Delivery[] = events.flatMap((e) => deliveriesFromEvent({ ...e, title: e.name, customer: e.customer?.name ?? null }));
  const warnings: Record<string, string[]> = {};

  const without = events.filter((e) => (!Array.isArray(e.catering) || !e.catering.length) && e.event_date);
  if (without.length) {
    const menu = opts.menu ?? await cateringMenu(db, orgId);
    const ids = without.map((e) => e.id);
    const [items, plans] = await Promise.all([quoteCatering(db, orgId, ids, new Set(menu.map((m) => m.id))), cateringPlans(db, orgId, ids)]);
    for (const e of without) {
      const mine = items.get(e.id);
      if (!mine) continue;
      const plan = plans.get(e.id) ?? { days: [], qty: {} };
      const { parts, warnings: w } = splitByDay(mine, plan, { date: e.event_date!, time: e.start_time?.slice(0, 5) ?? null });
      if (w.length) warnings[e.id] = w;
      for (const p of parts) deliveries.push({
        event_id: e.id, event_number: e.number ? `EV-${e.number}` : null, title: e.name, customer: e.customer?.name ?? null, status: e.status, firm: true,
        date: p.date, time: p.time, label: parts.length > 1 ? `Catering — day ${parts.indexOf(p) + 1} of ${parts.length}` : "Catering",
        address: e.address, venue: e.venue, guests: e.guest_count, notes: e.customer_notes, items: p.items,
      });
    }
  }
  return { deliveries: deliveries.filter((d) => d.date >= opts.from && d.date <= opts.to), warnings };
}
