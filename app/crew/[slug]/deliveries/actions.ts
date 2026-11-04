"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { crewSession } from "@/lib/crew/server";
import { isDelivery } from "@/lib/crew/skills";
import { cleanGeo } from "@/lib/wholesale/deliveries";
import type { CrewResult } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNDO_HOURS = 12;

export interface TickInput { geo?: unknown; geoError?: string | null; deviceTime?: string | null; note?: string | null }

async function driver(slug: string) {
  const s = await crewSession(slug);
  if (!s) throw new Error("You've been signed out — sign in again.");
  if (!isDelivery(s.member.skills)) throw new Error("Only delivery staff can tick off deliveries.");
  return s;
}

const fail = (e: unknown): CrewResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const done = (slug: string) => { revalidatePath(`/crew/${slug}/deliveries`); revalidatePath("/wholesale", "layout"); };

/** Tick an order off as delivered — recorded with the time, the driver and where their phone was. */
export async function markDelivered(slug: string, orderId: string, input: TickInput): Promise<CrewResult> {
  try {
    const s = await driver(slug);
    if (!UUID.test(orderId)) throw new Error("Refresh and try again.");
    const { data: o } = await s.db.from("wholesale_orders").select("id, number, status, customer:wholesale_customers(name)").eq("id", orderId).eq("organisation_id", s.org.id).maybeSingle();
    if (!o) throw new Error("That order isn't there any more — refresh.");
    if (o.status === "delivered") return { ok: true, message: "Already ticked off." };
    if (o.status !== "placed" && o.status !== "packed") throw new Error("This order isn't out for delivery (it may have been cancelled) — check with the office.");
    const geo = cleanGeo(input.geo);
    const dt = input.deviceTime && !Number.isNaN(Date.parse(input.deviceTime)) ? new Date(input.deviceTime).toISOString() : null;
    const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    // Proof first — if it can't be saved, the order isn't marked delivered
    const { error: logErr } = await s.db.from("wholesale_delivery_log").insert({
      organisation_id: s.org.id, order_id: o.id, action: "delivered", crew_member_id: s.member.id, by_name: s.member.name.slice(0, 120),
      lat: geo?.lat ?? null, lng: geo?.lng ?? null, accuracy_m: geo?.accuracy ?? null,
      geo_error: geo ? null : (input.geoError || "No location from the phone").slice(0, 200),
      device_time: dt, note: input.note?.trim().slice(0, 500) || null, user_agent: ua,
    });
    if (logErr) {
      console.error("[deliveries] log:", logErr.message);
      throw new Error(/wholesale_delivery_log/.test(logErr.message) ? "Deliveries aren't switched on yet — the office needs to finish setting them up." : "Couldn't save the delivery — check your signal and try again.");
    }
    const { error } = await s.db.from("wholesale_orders").update({ status: "delivered", updated_at: new Date().toISOString() }).eq("id", o.id).eq("organisation_id", s.org.id);
    if (error) throw new Error("Couldn't save the delivery — try again.");
    const cust = (o.customer as unknown as { name: string } | null)?.name ?? "the customer";
    await s.db.from("activity_logs").insert({
      organisation_id: s.org.id, actor_type: "system", actor_label: `${s.member.name} (staff app)`, action: "wholesale.order_delivered", entity_type: "wholesale_order", entity_id: o.id,
      summary: `${s.member.name} delivered ${o.number} to ${cust}${geo ? "" : " (no location recorded)"}`,
    }).then(() => null, () => null);
    done(slug);
    return { ok: true, message: geo ? `${cust} — delivered ✓` : `${cust} — delivered ✓ (your location wasn't recorded — turn on Location for this app)` };
  } catch (e) { return fail(e); }
}

/** Undo a tick (wrong stop). The original tick stays in the log. */
export async function undoDelivered(slug: string, orderId: string): Promise<CrewResult> {
  try {
    const s = await driver(slug);
    if (!UUID.test(orderId)) throw new Error("Refresh and try again.");
    const { data: last } = await s.db.from("wholesale_delivery_log").select("action, at, crew_member_id").eq("organisation_id", s.org.id).eq("order_id", orderId).order("at", { ascending: false }).limit(1).maybeSingle();
    if (!last || last.action !== "delivered") throw new Error("This one wasn't ticked off here — ask the office to change it.");
    if (Date.now() - Date.parse(last.at as string) > UNDO_HOURS * 3600_000) throw new Error("It's too long ago to undo here — ask the office to change it.");
    const { error: logErr } = await s.db.from("wholesale_delivery_log").insert({ organisation_id: s.org.id, order_id: orderId, action: "undone", crew_member_id: s.member.id, by_name: s.member.name.slice(0, 120) });
    if (logErr) throw new Error("Couldn't undo — try again.");
    await s.db.from("wholesale_orders").update({ status: "packed", updated_at: new Date().toISOString() }).eq("id", orderId).eq("organisation_id", s.org.id).eq("status", "delivered");
    done(slug);
    return { ok: true, message: "Undone — it's back on your list." };
  } catch (e) { return fail(e); }
}
