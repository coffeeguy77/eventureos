"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { fmtMinutes } from "@/lib/nerdherd/core";
import { addUpdate } from "./actions";

/** Care Hub (office side): the work timer, block settings, and hours given to a client by hand. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const NEEDS_UPDATE = "Run update 0115 (Care Hub) in Supabase first — supabase/migrations/0115_care_hub.sql.";
const missing = (m: string) => /nh_timers|nh_blocks|nh_block_usage|portal_prefs|billing|does not exist|schema cache/.test(m);

async function desk() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can work on tickets.");
  return ctx;
}

/* ------------------------------------------------------------------ the timer */

/** Start timing a ticket. A timer already running on another ticket is stopped and its time logged first. */
export async function startTimer(ticketId: string): Promise<R<{ stopped: number | null }>> {
  try {
    if (!UUID.test(ticketId)) throw new Error("That ticket doesn't exist.");
    const { supabase, org, user } = await desk();
    const { data: tk } = await supabase.from("support_tickets").select("id").eq("id", ticketId).eq("organisation_id", org.id).maybeSingle();
    if (!tk) throw new Error("That ticket doesn't exist.");
    const { data: cur, error: cErr } = await supabase.from("nh_timers").select("ticket_id, started_at").eq("user_id", user.id).maybeSingle();
    if (cErr) throw new Error(missing(cErr.message) ? NEEDS_UPDATE : cErr.message);
    let stopped: number | null = null;
    if (cur && cur.ticket_id !== ticketId) {
      const r = await stopTimer(null);
      if (!r.ok) throw new Error(`Couldn't stop the other timer: ${r.error}`);
      stopped = r.data.minutes;
    } else if (cur) return { ok: true, data: { stopped: null } };
    const { error } = await supabase.from("nh_timers").upsert({ user_id: user.id, organisation_id: org.id, ticket_id: ticketId, started_at: new Date().toISOString() });
    if (error) throw new Error(missing(error.message) ? NEEDS_UPDATE : error.message);
    revalidatePath(`/nerd-herd/tickets/${ticketId}`);
    return { ok: true, data: { stopped } };
  } catch (e) { return fail(e); }
}

/** Stop the timer and log the time on its ticket (at least a minute), with an optional note of what was done. */
export async function stopTimer(note: string | null, opts: { billable?: boolean } = {}): Promise<R<{ minutes: number; ticketId: string }>> {
  try {
    const { supabase, user } = await desk();
    const { data: cur, error } = await supabase.from("nh_timers").select("ticket_id, started_at").eq("user_id", user.id).maybeSingle();
    if (error) throw new Error(missing(error.message) ? NEEDS_UPDATE : error.message);
    if (!cur) throw new Error("There's no timer running.");
    const minutes = Math.min(6000, Math.max(1, Math.ceil((Date.now() - Date.parse(cur.started_at as string)) / 60000)));
    const body = (note ?? "").trim().slice(0, 2000) || null;
    const r = await addUpdate(cur.ticket_id as string, { kind: body ? "note" : "time", body, minutes, billable: opts.billable !== false, public: false });
    if (!r.ok) throw new Error(r.error);
    await supabase.from("nh_timers").delete().eq("user_id", user.id);
    revalidatePath(`/nerd-herd/tickets/${cur.ticket_id}`);
    return { ok: true, data: { minutes, ticketId: cur.ticket_id as string } };
  } catch (e) { return fail(e); }
}

/** Throw the running timer away without logging anything. */
export async function discardTimer(): Promise<R> {
  try {
    const { supabase, user } = await desk();
    const { data } = await supabase.from("nh_timers").select("ticket_id").eq("user_id", user.id).maybeSingle();
    await supabase.from("nh_timers").delete().eq("user_id", user.id);
    if (data?.ticket_id) revalidatePath(`/nerd-herd/tickets/${data.ticket_id}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ settings and hours by hand */

export async function saveCareSettings(i: { enabled: boolean; packs: { hours: number; discount_pct: number }[]; ads_fee_ex_gst: number | null }): Promise<R> {
  try {
    const { supabase, org, role, user, profile } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change settings.");
    const packs = (Array.isArray(i.packs) ? i.packs : []).map((p) => ({ hours: Math.round((Number(p.hours) || 0) * 4) / 4, discount_pct: Math.min(50, Math.max(0, Math.round(Number(p.discount_pct) || 0))) }))
      .filter((p) => p.hours >= 0.5 && p.hours <= 200);
    if (!packs.length) throw new Error("Add at least one block, e.g. 2 hours.");
    const fee = i.ads_fee_ex_gst === null ? null : Math.round(Number(i.ads_fee_ex_gst) * 100) / 100;
    if (fee !== null && !(fee > 0 && fee < 100000)) throw new Error("Enter the monthly Google Ads fee (ex GST), or choose “Ask us”.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const { data: cur } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const all = ((cur?.settings as Record<string, unknown>) ?? {});
    const nerd = (all.nerdherd ?? {}) as Record<string, unknown>;
    const settings = { ...all, nerdherd: { ...nerd, care: { enabled: !!i.enabled, packs, ads_fee_ex_gst: fee } } };
    const { error } = await db.from("organisations").update({ settings }).eq("id", org.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} updated Care Hub settings` });
    revalidatePath("/nerd-herd", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Give a client hours without an invoice (e.g. hours they prepaid before the Care Hub, or a goodwill top-up). */
export async function giveHours(customerId: string, hours: number, note: string): Promise<R> {
  try {
    const { supabase, org, role, user, profile } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can add hours.");
    if (!UUID.test(customerId)) throw new Error("Choose the client.");
    const h = Math.round((Number(hours) || 0) * 4) / 4;
    if (!(h !== 0 && Math.abs(h) <= 200)) throw new Error("Enter the hours, e.g. 2 or 1.5.");
    if (h < 0) throw new Error("To take hours off, log time on one of their requests instead.");
    const why = note.trim().slice(0, 300);
    if (!why) throw new Error("Say why (e.g. “Prepaid before the Care Hub, invoice 1234”) — the client sees it.");
    const { error } = await supabase.from("nh_blocks").insert({ organisation_id: org.id, customer_id: customerId, hours: h, price_ex_gst: 0, label: why, created_by: user.id });
    if (error) throw new Error(missing(error.message) ? NEEDS_UPDATE : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "care.hours", entityType: "customer", entityId: customerId, customerId, summary: `${actorName(profile)} added ${fmtMinutes(h * 60)} of prepaid hours (${why})` });
    revalidatePath("/nerd-herd/care");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Take back a block given by hand (a bought block is cancelled by voiding its invoice). */
export async function voidBlock(id: string): Promise<R> {
  try {
    const { supabase, org, role } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change hours.");
    if (!UUID.test(id)) throw new Error("That block doesn't exist.");
    const { error } = await supabase.from("nh_blocks").update({ status: "void" }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/nerd-herd/care");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
