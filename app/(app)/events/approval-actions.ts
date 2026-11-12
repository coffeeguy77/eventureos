"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";

export type ApprovalResult = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner/admin approves a booking that was held for approval: confirms it and runs the "Quote accepted" automation. */
export async function approveBooking(eventId: string): Promise<ApprovalResult> {
  try {
    const { supabase, role } = await requireOrg();
    if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners and admins can approve bookings." };
    if (!UUID.test(eventId)) return { ok: false, error: "Refresh the page and try again." };
    const { error } = await supabase.rpc("approve_booking", { p_event_id: eventId });
    if (error) return { ok: false, error: error.message };
    const { afterQuoteAccepted } = await import("@/lib/quotes/after-accept");
    await afterQuoteAccepted(supabase, eventId);
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A late acceptance: the office has checked staff and equipment — the job is confirmed, the calendar drops "TBC". */
export async function confirmAvailability(eventId: string): Promise<ApprovalResult> {
  try {
    const { supabase, org } = await requireOrg();
    if (!UUID.test(eventId)) return { ok: false, error: "Refresh the page and try again." };
    const { error } = await supabase.from("events").update({ availability_tbc: false, next_action: null, next_action_due: null }).eq("id", eventId).eq("organisation_id", org.id);
    if (error) return { ok: false, error: error.message };
    try { const { syncJobCalendar } = await import("@/lib/calendar/job-sync"); await syncJobCalendar(supabase, org.id, eventId, { create: false }); } catch { /* the next sync renames it */ }
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A held booking that's already happened (or been paid): close it as completed without the approval steps —
 * no calendar entry, no new invoice, nothing sent. Owners and admins.
 */
export async function markHeldDone(eventId: string): Promise<ApprovalResult> {
  try {
    const { supabase, org, role, user, profile } = await requireOrg();
    if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners and admins can do this." };
    if (!UUID.test(eventId)) return { ok: false, error: "Refresh the page and try again." };
    const { data, error } = await supabase.from("events").update({ status: "completed", approval_status: "approved", approval_decided_at: new Date().toISOString(), approval_decided_by: user.id, next_action: null, next_action_due: null })
      .eq("id", eventId).eq("organisation_id", org.id).eq("approval_status", "pending").select("id, customer_id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "This booking isn't waiting for approval any more — refresh the page." };
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("type", "booking.approval").eq("entity_id", eventId).is("read_at", null);
    await supabase.from("activity_logs").insert({ organisation_id: org.id, actor_id: user.id, action: "event.completed", entity_type: "event", entity_id: eventId, customer_id: data.customer_id, event_id: eventId,
      summary: `${profile.full_name ?? "Someone"} marked the booking done (it no longer needed approval)` }).then(() => null, () => null);
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
