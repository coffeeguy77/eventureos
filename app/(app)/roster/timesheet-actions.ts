"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { fromLocal } from "@/lib/roster/time";

export type TsResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can approve timesheets.");
  return ctx;
}
async function wrap(fn: () => Promise<string | void>): Promise<TsResult> {
  try { const m = await fn(); revalidatePath("/roster/timesheets"); return { ok: true, message: m || undefined }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Change the paid times / break of an entry (before approving). A change after it went to Xero means it needs sending again. */
export async function updateEntry(id: string, v: { start: string; finish: string; breakMinutes: number; note: string | null }) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    if (!LOCAL.test(v.start) || !LOCAL.test(v.finish)) throw new Error("Check the start and finish.");
    if (v.finish <= v.start) throw new Error("The finish is before the start.");
    const brk = Math.max(0, Math.min(600, Math.round(Number(v.breakMinutes) || 0)));
    const { data: e } = await supabase.from("staff_time_entries").select("id, clock_out, status").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!e) throw new Error("That entry no longer exists.");
    if (!e.clock_out) throw new Error("They're still clocked on — wait until they clock off.");
    const { error } = await supabase.from("staff_time_entries").update({
      paid_start: fromLocal(v.start, org.timezone), paid_finish: fromLocal(v.finish, org.timezone), break_minutes: brk, note: v.note?.trim().slice(0, 500) || null,
      status: e.status === "approved" ? "pending" : e.status, sent_to_xero_at: null, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw new Error(error.message);
    return "Saved — approve it when it's right.";
  });
}

export async function setEntriesStatus(ids: string[], status: "approved" | "pending" | "rejected") {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const list = ids.filter((x) => UUID.test(x)).slice(0, 500);
    if (!list.length) return;
    const { data, error } = await supabase.from("staff_time_entries").update({
      status, approved_by: status === "approved" ? user.id : null, approved_at: status === "approved" ? new Date().toISOString() : null,
      ...(status !== "approved" ? { sent_to_xero_at: null } : {}), updated_at: new Date().toISOString(),
    }).in("id", list).eq("organisation_id", org.id).not("clock_out", "is", null).select("id");
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    if (status === "approved" && n) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roster.timesheets_approved", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} approved ${n} timesheet entr${n === 1 ? "y" : "ies"}` });
    return status === "approved" ? `${n} approved.` : status === "rejected" ? "Marked as not approved — it won't be paid." : "Back to waiting.";
  });
}

/** Hours someone worked without clocking on (or a rostered shift they forgot to clock). */
export async function addEntry(v: { crewId: string; start: string; finish: string; breakMinutes: number; shiftId: string | null; note: string | null }) {
  return wrap(async () => {
    const { supabase, org, user } = await office();
    if (!UUID.test(v.crewId)) throw new Error("Choose who.");
    if (!LOCAL.test(v.start) || !LOCAL.test(v.finish) || v.finish <= v.start) throw new Error("Check the start and finish.");
    if (v.shiftId && !UUID.test(v.shiftId)) throw new Error("Refresh and try again.");
    const s = fromLocal(v.start, org.timezone), f = fromLocal(v.finish, org.timezone);
    const { error } = await supabase.from("staff_time_entries").insert({
      organisation_id: org.id, crew_member_id: v.crewId, staff_shift_id: v.shiftId, work_date: v.start.slice(0, 10), clock_in: s, clock_out: f, paid_start: s, paid_finish: f,
      break_minutes: Math.max(0, Math.min(600, Math.round(Number(v.breakMinutes) || 0))), source: "office", status: "pending", note: v.note?.trim().slice(0, 500) || `Added by ${user.email ?? "the office"}`,
    });
    if (error) throw new Error(/one_open/.test(error.message) ? "They're clocked on right now — add it after they clock off." : error.message);
    return "Added.";
  });
}

export async function deleteEntry(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: e } = await supabase.from("staff_time_entries").select("source, sent_to_xero_at").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!e) return;
    if (e.source !== "office") throw new Error("Only entries the office added can be deleted — mark a clocked one as not approved instead.");
    await supabase.from("staff_time_entries").delete().eq("id", id);
    return e.sent_to_xero_at ? "Deleted — send this person's timesheet to Xero again." : "Deleted.";
  });
}

/** Send approved hours to Xero Payroll for these people and dates. */
export async function sendToXero(crewIds: string[], from: string, to: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!DATE.test(from) || !DATE.test(to) || to < from) throw new Error("Choose the dates.");
    const ids = crewIds.filter((x) => UUID.test(x));
    if (!ids.length) throw new Error("Choose who to send.");
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { sendTimesheets } = await import("@/lib/roster/payroll");
    const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const results = await sendTimesheets(supabase, ctx, org, ids, from, to);
    const ok = results.filter((r) => r.ok), bad = results.filter((r) => !r.ok);
    if (ok.length) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roster.timesheets_sent", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} sent timesheets to Xero Payroll: ${ok.map((r) => `${r.name} (${r.text})`).join(", ")}` });
    const text = results.map((r) => `${r.name}: ${r.text}`).join(" · ");
    if (bad.length && !ok.length) throw new Error(text);
    return text;
  });
}
