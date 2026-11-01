import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO } from "@/lib/format";
import { readRosterSettings } from "./settings";
import { fromLocal, shiftSpan } from "./time";
import { personHours, type BreakFields, type Entry } from "./payroll";
import { hoursFor, totalsFor } from "./pay";
import type { EmploymentType } from "./award";

/**
 * Wages as a % of sales, day by day: wages from clocked timesheets (award estimate; rostered shifts for days with no
 * timesheets yet, e.g. today), sales from Square. People not paid through the roster (e.g. an owner) are left out.
 */
export interface WageDay { date: string; wages: number; hours: number; sales: number | null; pct: number | null; from: "timesheets" | "roster" | "none" }

export async function wageHistory(db: SupabaseClient, org: { id: string; timezone: string; settings: unknown }, days: number): Promise<{ days: WageDay[]; salesNote: string | null }> {
  const st = readRosterSettings(org.settings);
  const today = todayISO(org.timezone), from = addDaysISO(today, -(days - 1));
  const [{ data: people }, { data: ents }, { data: shifts }, { data: hol }, { data: rateRow }] = await Promise.all([
    db.from("crew_members").select("id, employment_type, hourly_rate").eq("organisation_id", org.id),
    db.from("staff_time_entries").select("id, crew_member_id, work_date, paid_start, paid_finish, clock_in, clock_out, break_minutes, status, source, event_crew_id").eq("organisation_id", org.id).gte("work_date", from).lte("work_date", today).neq("status", "rejected").not("clock_out", "is", null),
    db.from("staff_shifts").select("crew_member_id, shift_date, start_time, finish_time, break_minutes").eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).gte("shift_date", from).lte("shift_date", today),
    db.from("public_holidays").select("holiday_date").eq("organisation_id", org.id).gte("holiday_date", from).lte("holiday_date", today),
    db.from("organisations").select("staff_hourly_rate").eq("id", org.id).maybeSingle(),
  ]);
  const orgRate = Number((rateRow as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? 30);
  const ppl = new Map(((people ?? []) as { id: string; employment_type: EmploymentType; hourly_rate: number | null }[]).map((p) => [p.id, p]));
  const holidays = new Set(((hol ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date));
  const skip = new Set(st.unpaid);
  const wages = new Map<string, { cost: number; hours: number; from: WageDay["from"] }>();
  const add = (d: string, c: number, h: number, f: WageDay["from"]) => { const w = wages.get(d) ?? { cost: 0, hours: 0, from: f }; w.cost += c; w.hours += h; wages.set(d, w); };
  // timesheets
  const list = ((ents ?? []) as (Entry & BreakFields)[]).filter((e) => !e.event_crew_id && !skip.has(e.crew_member_id));
  const withSheets = new Set(list.map((e) => e.work_date));
  for (const id of new Set(list.map((e) => e.crew_member_id))) {
    const p = ppl.get(id);
    const type = p?.employment_type ?? "casual", flat = st.flat.includes(id), rate = p?.hourly_rate == null ? orgRate : Number(p.hourly_rate);
    const byDay = personHours(list.filter((e) => e.crew_member_id === id), type, org.timezone, holidays, org.settings, id);
    for (const [d, h] of byDay) { const t = totalsFor(new Map([[d, h]]), { type, flat, rate }, st.rules); add(d, t.cost, t.hours, "timesheets"); }
  }
  // rostered shifts on days with no timesheets yet
  for (const s of (shifts ?? []) as { crew_member_id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number }[]) {
    if (withSheets.has(s.shift_date) || skip.has(s.crew_member_id)) continue;
    const p = ppl.get(s.crew_member_id);
    const type = p?.employment_type ?? "casual", flat = st.flat.includes(s.crew_member_id), rate = p?.hourly_rate == null ? orgRate : Number(p.hourly_rate);
    const t = totalsFor(hoursFor([{ ...shiftSpan(s.shift_date, s.start_time, s.finish_time), breakMinutes: s.break_minutes }], { type, flat }, holidays, st.rules), { type, flat, rate }, st.rules);
    add(s.shift_date, t.cost, t.hours, "roster");
  }
  // sales
  let sales: Record<string, number> | null = null, salesNote: string | null = null;
  try {
    const { loadSquare, squareSalesByDay } = await import("@/lib/square/server");
    const cfg = await loadSquare(db, org.id);
    if (cfg) sales = await squareSalesByDay(cfg, fromLocal(`${from}T00:00`, org.timezone), new Date().toISOString(), org.timezone);
    else salesNote = "Connect Square (Settings → Integrations) to compare wages with sales.";
  } catch (e) { salesNote = e instanceof Error ? e.message : String(e); }
  const out: WageDay[] = [];
  for (let d = from; d <= today; d = addDaysISO(d, 1)) {
    const w = wages.get(d), sv = sales ? sales[d] ?? 0 : null;
    const cost = Math.round((w?.cost ?? 0) * 100) / 100;
    out.push({ date: d, wages: cost, hours: Math.round((w?.hours ?? 0) * 100) / 100, sales: sv, pct: sv && sv > 0 && cost > 0 ? Math.round((cost / sv) * 1000) / 10 : null, from: w?.from ?? "none" });
  }
  return { days: out, salesNote };
}
