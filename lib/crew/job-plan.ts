import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobDays, type EventDay } from "@/lib/events/days";
import { shiftDays, type StaffDetails, type TravelDetails } from "@/lib/quotes/line-helpers";
import { jobShift, type JobShift } from "./shifts";

/**
 * How each job actually runs, worked out from the job and its quote: the days (each with its hours), the travel time
 * each way and where the van is going (from the quote's Travel line). Used by the calendar, the staff app and wages.
 */
export interface JobPlan { days: EventDay[]; travel: number; address: string | null; shift: JobShift }
export interface PlanEvent { id: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; days?: unknown }

export async function jobPlans(db: SupabaseClient, orgId: string, events: PlanEvent[]): Promise<Map<string, JobPlan>> {
  const out = new Map<string, JobPlan>();
  const ids = [...new Set(events.map((e) => e.id))];
  type Q = { event_id: string; status: string; created_at: string; quote_items: { details: { kind?: string } | null; is_optional: boolean }[] };
  const quotes: Q[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("quotes").select("event_id, status, created_at, quote_items(details, is_optional)")
      .eq("organisation_id", orgId).in("event_id", ids.slice(i, i + 200)).not("status", "in", "(superseded,declined)");
    quotes.push(...((data ?? []) as Q[]));
  }
  for (const e of events) {
    // The accepted quote, otherwise the newest one still in play
    const qs = quotes.filter((q) => q.event_id === e.id).sort((a, b) => (a.status === "accepted" ? -1 : b.status === "accepted" ? 1 : b.created_at.localeCompare(a.created_at)));
    const details = (qs[0]?.quote_items ?? []).filter((i) => !i.is_optional).map((i) => i.details);
    const staff = details.find((d) => d?.kind === "staff") as StaffDetails | undefined;
    const travelLine = details.find((d) => d?.kind === "travel") as TravelDetails | undefined;
    const travel = Math.max(0, staff?.travel_minutes ?? travelLine?.charge_minutes ?? 0);
    const days = jobDays(e, staff ? shiftDays(staff) : []);
    out.set(e.id, { days, travel, address: travelLine?.address?.trim() || null, shift: jobShift(days, travel) });
  }
  return out;
}

/** Use the plan for pay only when it changes something (several days, or travel); otherwise the job's own times. */
export const planForPay = (p: JobPlan | undefined) => (p && (p.days.length > 1 || p.travel > 0) ? p.shift : null);
