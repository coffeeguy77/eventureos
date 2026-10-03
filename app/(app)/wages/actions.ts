"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { loadWageShifts } from "@/lib/crew/wages";
import { fmtHours } from "@/lib/crew/shifts";
import { money, todayISO } from "@/lib/format";

export type WageResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can manage wages.");
  return ctx;
}
async function wrap(fn: () => Promise<string | void>): Promise<WageResult> {
  try { const m = await fn(); revalidatePath("/wages"); return { ok: true, message: m || undefined }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function decideHourClaim(claimId: string, approve: boolean) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(claimId)) throw new Error("Refresh and try again.");
    const { data: c } = await supabase.from("staff_hour_claims").select("id, hours, status, shift:event_crew(id, payment_id, event_id, member:crew_members(name), event:events(name)), custom:staff_shifts(id, payment_id, title, member:crew_members(name))").eq("id", claimId).eq("organisation_id", org.id).maybeSingle();
    const raw = c as unknown as { id: string; hours: number; status: string; shift: { id: string; payment_id: string | null; event_id: string; member: { name: string } | null; event: { name: string } | null } | null;
      custom: { id: string; payment_id: string | null; title: string; member: { name: string } | null } | null } | null;
    if (!raw) throw new Error("That request no longer exists.");
    const claim = { ...raw, shift: raw.shift ?? (raw.custom ? { id: raw.custom.id, payment_id: raw.custom.payment_id, event_id: null as string | null, member: raw.custom.member, event: { name: raw.custom.title } } : null) };
    if (claim.shift?.payment_id && approve) throw new Error("That shift has already been paid — record the extra in the next pay instead.");
    const { error } = await supabase.from("staff_hour_claims").update({ status: approve ? "approved" : "declined", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", claimId);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: approve ? "crew.hours_approved" : "crew.hours_declined", entityType: "event", entityId: claim.shift?.event_id ?? claimId, eventId: claim.shift?.event_id ?? null,
      summary: `${actorName(profile)} ${approve ? "approved" : "didn't approve"} ${fmtHours(Number(claim.hours))} extra for ${claim.shift?.member?.name ?? "a staff member"} on ${claim.shift?.event?.name ?? "a job"}` });
    return approve ? "Approved." : "Not approved.";
  });
}

/** Change a shift's paid hours or rate (blank = back to the planned hours / their normal rate). `key` is "e:<id>" or "c:<id>". */
export async function adjustShift(key: string, hours: number | null, rate: number | null) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const [kind, shiftId] = key.split(":");
    if (!UUID.test(shiftId ?? "") || (kind !== "e" && kind !== "c")) throw new Error("Refresh and try again.");
    if (hours != null && (!Number.isFinite(hours) || hours < 0 || hours > 48)) throw new Error("Hours must be between 0 and 48.");
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 500)) throw new Error("Rate must be between $0 and $500.");
    const table = kind === "e" ? "event_crew" : "staff_shifts";
    const { data: row } = await supabase.from(table).select("payment_id").eq("id", shiftId).eq("organisation_id", org.id).maybeSingle();
    if (!row) throw new Error("That shift no longer exists.");
    if (row.payment_id) throw new Error("That shift has been paid. Undo the payment first to change it.");
    const { error } = await supabase.from(table).update({ hours_override: hours, rate_override: rate }).eq("id", shiftId);
    if (error) throw new Error(error.message);
  });
}

/** Record that the selected shifts have been paid. The staff member sees the payment and total in their app. */
export async function markShiftsPaid(crewId: string, keys: string[], paidOn: string, reference: string, method = "Bank transfer") {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(crewId) || !keys.length || keys.some((k) => !/^[ec]:[0-9a-f-]{36}$/i.test(k))) throw new Error("Tick the shifts you're paying.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new Error("Choose the payment date.");
    const shifts = (await loadWageShifts(supabase, org.id, { until: todayISO(org.timezone), unpaidOnly: true, crewId })).filter((s) => keys.includes(s.key));
    if (shifts.length !== keys.length) throw new Error("Some of those shifts are already paid or aren't finished yet — refresh and try again.");
    if (shifts.some((s) => s.amount == null)) throw new Error("One of the shifts has no times, so its hours are unknown. Enter its hours first.");
    const hours = Math.round(shifts.reduce((t, s) => t + (s.hours ?? 0), 0) * 100) / 100;
    const amount = Math.round(shifts.reduce((t, s) => t + (s.amount ?? 0), 0) * 100) / 100;
    const { data: pay, error } = await supabase.from("staff_payments").insert({
      organisation_id: org.id, crew_member_id: crewId, paid_on: paidOn, hours, amount, reference: reference.trim().slice(0, 120) || null, created_by: user.id,
      note: ["Bank transfer", "Cash", "Contra", "Paid outside EventureOS"].includes(method) ? method : "Bank transfer",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const ev = shifts.filter((s) => s.kind === "event").map((s) => s.id), cu = shifts.filter((s) => s.kind === "custom").map((s) => s.id);
    const r1 = ev.length ? await supabase.from("event_crew").update({ payment_id: pay.id }).in("id", ev).is("payment_id", null) : { error: null };
    const r2 = cu.length ? await supabase.from("staff_shifts").update({ payment_id: pay.id }).in("id", cu).is("payment_id", null) : { error: null };
    if (r1.error || r2.error) { await supabase.from("staff_payments").delete().eq("id", pay.id); throw new Error((r1.error ?? r2.error)!.message); }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.paid", entityType: "crew_member", entityId: crewId,
      summary: `${actorName(profile)} recorded ${method.toLowerCase()} pay of ${money(amount, org.currency, { cents: true })} to ${shifts[0].crewName} for ${shifts.length} shift${shifts.length === 1 ? "" : "s"} (${fmtHours(hours)})` });
    return `Recorded ${money(amount, org.currency, { cents: true })} paid to ${shifts[0].crewName}.`;
  });
}

export async function undoPayment(paymentId: string) {
  return wrap(async () => {
    const { supabase, org, user, profile, role } = await office();
    if (role === "manager") throw new Error("Only owners and admins can undo a payment.");
    if (!UUID.test(paymentId)) throw new Error("Refresh and try again.");
    const { data: p } = await supabase.from("staff_payments").select("id, amount, member:crew_members(name)").eq("id", paymentId).eq("organisation_id", org.id).maybeSingle();
    if (!p) return;
    await supabase.from("event_crew").update({ payment_id: null }).eq("payment_id", paymentId);
    await supabase.from("staff_shifts").update({ payment_id: null }).eq("payment_id", paymentId);
    await supabase.from("staff_payments").delete().eq("id", paymentId);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "crew.payment_undone", entityType: "crew_member", entityId: paymentId,
      summary: `${actorName(profile)} undid a ${money(Number(p.amount), org.currency, { cents: true })} payment to ${(p.member as unknown as { name: string } | null)?.name ?? "a staff member"}` });
    return "Payment undone — those shifts are owed again.";
  });
}
