import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fmtDate } from "@/lib/format";
import { emailConfigured, sendEmail } from "./send";
import { bookingApprovalEmail } from "./templates";

type Alert = { to: { email: string; name: string | null }[]; event_id: string; event_name: string; event_date: string | null;
  org_name: string; venue: string | null; customer: string | null; days_away: number | null };

/**
 * If this event was just held for approval, email the business's owners and admins (once — the RPC records it).
 * Never throws: acceptance has already been recorded, so a failed email must not look like a failed acceptance.
 */
export async function alertBookingApproval(supabase: SupabaseClient, eventId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("booking_approval_alert", { p_event_id: eventId });
    if (error || !data || !emailConfigured()) return;
    const a = data as Alert;
    const d = a.days_away;
    const when = d == null ? "no date set" : d < 0 ? "date has passed" : d === 0 ? "event is TODAY" : d === 1 ? "event is TOMORROW" : `event is in ${d} days`;
    const m = bookingApprovalEmail({ businessName: a.org_name, eventName: a.event_name, customer: a.customer, when,
      dateText: a.event_date ? fmtDate(a.event_date, "long") : null, venue: a.venue, url: `${appBaseUrl()}/events/${a.event_id}` });
    await Promise.all(a.to.map((t) => sendEmail({ to: t.email, ...m }).catch(() => undefined)));
  } catch {
    // Best effort — the in-app notification was already created by the database.
  }
}
