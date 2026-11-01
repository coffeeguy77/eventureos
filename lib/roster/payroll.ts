import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { type DayHours, type EmploymentType } from "./award";
import { hoursFor } from "./pay";
import { timesheetLines } from "./paid";
import { readRosterSettings } from "./settings";
import { toLocal } from "./time";

/**
 * Approved timesheets → Xero Payroll. For each person, every pay period that has approved hours in the chosen dates is
 * worked out again from ALL its approved entries (so sending twice never doubles anything) and replaces that period's
 * timesheet in Xero. Each award category goes against the earnings rate it's mapped to (unmapped base hours go as Ordinary).
 */
export interface Entry { id: string; crew_member_id: string; work_date: string; paid_start: string | null; paid_finish: string | null; clock_in: string; clock_out: string | null; break_minutes: number; status: string }

export function entryWorked(e: Entry, tz: string) {
  const a = e.paid_start ?? e.clock_in, b = e.paid_finish ?? e.clock_out;
  if (!b) return null;
  return { start: toLocal(a, tz), finish: toLocal(b, tz), breakMinutes: e.break_minutes };
}

/** Hours by category per day for one person's entries. */
export function personHours(entries: Entry[], type: EmploymentType, tz: string, holidays: Set<string>, orgSettings: unknown, memberId?: string): Map<string, DayHours> {
  const st = readRosterSettings(orgSettings);
  const worked = entries.map((e) => entryWorked(e, tz)).filter((x): x is NonNullable<typeof x> => !!x);
  return hoursFor(worked, { type, flat: !!memberId && st.flat.includes(memberId) }, holidays, st.rules);
}

export async function sendTimesheets(db: SupabaseClient, ctx: SyncContext, org: { id: string; timezone: string; settings: unknown }, crewIds: string[], from: string, to: string) {
  const { payrollEmployees, payCalendars, periodFor, periodDates, upsertTimesheet } = await import("@/lib/integrations/xero-payroll");
  const settings = readRosterSettings(org.settings);
  if (!settings.xero.earnings.ordinary) throw new Error("Choose the Xero earnings rate for Ordinary hours first (Roster → Setup → Xero Payroll).");
  const [employees, calendars] = await Promise.all([payrollEmployees(ctx), payCalendars(ctx)]);
  const { data: people } = await db.from("crew_members").select("id, name, employment_type, xero_employee_id").eq("organisation_id", org.id).in("id", crewIds);
  const results: { name: string; ok: boolean; text: string }[] = [];
  for (const p of (people ?? []) as { id: string; name: string; employment_type: EmploymentType; xero_employee_id: string | null }[]) {
    try {
      const emp = employees.find((e) => e.id === p.xero_employee_id);
      if (!emp) throw new Error("not matched to a Xero Payroll employee (Roster → Setup)");
      const cal = calendars.find((c) => c.id === emp.calendarId);
      if (!cal) throw new Error("has no pay calendar in Xero");
      // the pay periods touched by approved hours in these dates
      const { data: inRange } = await db.from("staff_time_entries").select("work_date").eq("crew_member_id", p.id).eq("status", "approved").gte("work_date", from).lte("work_date", to);
      const periods = new Map<string, { start: string; end: string }>();
      for (const r of (inRange ?? []) as { work_date: string }[]) { const per = periodFor(cal, r.work_date); if (per) periods.set(per.start, per); }
      if (!periods.size) { results.push({ name: p.name, ok: true, text: "no approved hours" }); continue; }
      let hours = 0;
      for (const per of periods.values()) {
        const { data: rows } = await db.from("staff_time_entries").select("id, crew_member_id, work_date, paid_start, paid_finish, clock_in, clock_out, break_minutes, status, sent_to_xero_at")
          .eq("crew_member_id", p.id).eq("status", "approved").gte("work_date", per.start).lte("work_date", per.end);
        const entries = (rows ?? []) as (Entry & { sent_to_xero_at?: string | null })[];
        // already in Xero and nothing changed since (e.g. weeks brought over from Deputy, which Xero has paid)
        if (entries.length && entries.every((e) => e.sent_to_xero_at)) continue;
        const { data: hol } = await db.from("public_holidays").select("holiday_date").eq("organisation_id", org.id).gte("holiday_date", per.start).lte("holiday_date", per.end);
        const byDay = personHours(entries, p.employment_type, org.timezone, new Set(((hol ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date)), org.settings, p.id);
        const dates = periodDates(per.start, per.end);
        const lines = timesheetLines(byDay, dates, settings.xero.earnings, settings.rules.loadings);
        const r = await upsertTimesheet(ctx, { employeeId: emp.id, start: per.start, end: per.end, status: settings.xero.status, lines });
        await db.from("staff_time_entries").update({ xero_timesheet_id: r.id, sent_to_xero_at: new Date().toISOString() }).in("id", entries.map((e) => e.id));
        hours += lines.filter((l) => settings.rules.loadings === "replace" || (l.earningsRateId !== settings.xero.earnings.evening && l.earningsRateId !== settings.xero.earnings.late_night)).reduce((t, l) => t + l.units.reduce((a, b) => a + b, 0), 0);
      }
      results.push({ name: p.name, ok: true, text: `${Math.round(hours * 100) / 100} h sent (${periods.size} pay period${periods.size === 1 ? "" : "s"})` });
    } catch (e) {
      results.push({ name: p.name, ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
