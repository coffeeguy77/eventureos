import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plannedShift, shiftPay } from "./shifts";

/** Shifts worked (confirmed, on or before `until`) with their pay worked out — for the office's wages page. */
export interface WageShift {
  id: string; crewId: string; crewName: string; eventId: string; eventName: string; date: string | null; start: string | null; finish: string | null;
  planned: number | null; hoursOverride: number | null; rateOverride: number | null; extraApproved: number; extraPending: number;
  hours: number | null; rate: number; amount: number | null; paymentId: string | null;
}

export async function loadWageShifts(db: SupabaseClient, orgId: string, opts: { until: string; unpaidOnly?: boolean; paymentIds?: string[]; crewId?: string }) {
  const [{ data: org }, rows] = await Promise.all([
    db.from("organisations").select("staff_hourly_rate").eq("id", orgId).single(),
    (() => {
      let q = db.from("event_crew").select("id, crew_member_id, hours_override, rate_override, payment_id, member:crew_members(name, hourly_rate), event:events!inner(id, name, event_date, setup_time, start_time, finish_time, status)")
        .eq("organisation_id", orgId).eq("status", "confirmed").neq("event.status", "cancelled").lte("event.event_date", opts.until);
      if (opts.unpaidOnly) q = q.is("payment_id", null);
      if (opts.paymentIds) q = q.in("payment_id", opts.paymentIds.length ? opts.paymentIds : ["00000000-0000-0000-0000-000000000000"]);
      if (opts.crewId) q = q.eq("crew_member_id", opts.crewId);
      return q.limit(2000);
    })(),
  ]);
  if (rows.error) throw new Error(`Couldn't load shifts: ${rows.error.message}`);
  type Row = { id: string; crew_member_id: string; hours_override: number | null; rate_override: number | null; payment_id: string | null;
    member: { name: string; hourly_rate: number | null } | null; event: { id: string; name: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null } };
  const list = (rows.data ?? []) as unknown as Row[];
  const ids = list.map((r) => r.id);
  const claims = new Map<string, { approved: number; pending: number }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("staff_hour_claims").select("event_crew_id, hours, status").in("event_crew_id", ids.slice(i, i + 300));
    for (const c of (data ?? []) as { event_crew_id: string; hours: number; status: string }[]) {
      const v = claims.get(c.event_crew_id) ?? { approved: 0, pending: 0 };
      if (c.status === "approved") v.approved += Number(c.hours); else if (c.status === "pending") v.pending += Number(c.hours);
      claims.set(c.event_crew_id, v);
    }
  }
  const orgRate = Number((org as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? 30);
  return list.map((r): WageShift => {
    const c = claims.get(r.id) ?? { approved: 0, pending: 0 };
    const p = plannedShift(r.event);
    const pay = shiftPay({ event: r.event, hoursOverride: r.hours_override == null ? null : Number(r.hours_override), approvedExtra: c.approved,
      rateOverride: r.rate_override == null ? null : Number(r.rate_override), memberRate: r.member?.hourly_rate == null ? null : Number(r.member.hourly_rate), orgRate });
    return {
      id: r.id, crewId: r.crew_member_id, crewName: r.member?.name ?? "Removed", eventId: r.event.id, eventName: r.event.name, date: r.event.event_date,
      start: p.start, finish: p.finish, planned: p.hours, hoursOverride: r.hours_override == null ? null : Number(r.hours_override),
      rateOverride: r.rate_override == null ? null : Number(r.rate_override), extraApproved: c.approved, extraPending: c.pending,
      hours: pay.hours, rate: pay.rate, amount: pay.amount, paymentId: r.payment_id,
    };
  }).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
