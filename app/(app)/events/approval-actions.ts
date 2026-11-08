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
