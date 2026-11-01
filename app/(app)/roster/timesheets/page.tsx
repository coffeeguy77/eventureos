import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, todayISO } from "@/lib/format";
import { CATEGORIES, weekOf, type EmploymentType } from "@/lib/roster/award";
import { totalsFor } from "@/lib/roster/pay";
import { personHours, type Entry } from "@/lib/roster/payroll";
import { readRosterSettings } from "@/lib/roster/settings";
import { shiftSpan, toLocal } from "@/lib/roster/time";
import { RosterTabs } from "../tabs";
import { Timesheets, type PersonSheet } from "./ui";

export const metadata = { title: "Timesheets" };
export const dynamic = "force-dynamic";

/** Clocked hours to check and approve, the award split, and sending to Xero Payroll. */
export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const sp = await searchParams;
  const today = todayISO(org.timezone);
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const from = D.test(sp.from ?? "") ? sp.from! : weekOf(today);
  const to = D.test(sp.to ?? "") && sp.to! >= from ? sp.to! : addDaysISO(from, 6);
  const probe = await supabase.from("staff_time_entries").select("id").limit(1);
  if (probe.error) return (<div><PageHeader title="Roster" /><RosterTabs active="timesheets" /><Card><EmptyState title="One database update to go">Run 0084_cafe_roster.sql in Supabase to switch on timesheets.</EmptyState></Card></div>);
  const settings = readRosterSettings(org.settings);

  const [{ data: people }, { data: entries }, { data: shifts }, { data: hol }, { data: rateRow }] = await Promise.all([
    supabase.from("crew_members").select("id, name, employment_type, hourly_rate, xero_employee_id").eq("organisation_id", org.id).eq("active", true).eq("on_roster", true).order("name"),
    supabase.from("staff_time_entries").select("id, crew_member_id, staff_shift_id, work_date, clock_in, clock_out, break_minutes, paid_start, paid_finish, status, source, note, sent_to_xero_at").eq("organisation_id", org.id).gte("work_date", from).lte("work_date", to).order("clock_in"),
    supabase.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, break_minutes").eq("organisation_id", org.id).eq("roster", true).not("crew_member_id", "is", null).not("published_at", "is", null).gte("shift_date", from).lte("shift_date", to),
    supabase.from("public_holidays").select("holiday_date").eq("organisation_id", org.id).gte("holiday_date", from).lte("holiday_date", addDaysISO(to, 1)),
    supabase.from("organisations").select("staff_hourly_rate").eq("id", org.id).maybeSingle(),
  ]);
  const holidays = new Set(((hol ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date));
  const orgRate = Number((rateRow as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? 30);
  type E = Entry & { staff_shift_id: string | null; source: string; note: string | null; sent_to_xero_at: string | null };
  type S = { id: string; crew_member_id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number };
  const allEntries = (entries ?? []) as E[];
  const allShifts = (shifts ?? []) as S[];
  const used = new Set(allEntries.map((e) => e.staff_shift_id).filter(Boolean));
  const tz = org.timezone;

  const sheets: PersonSheet[] = ((people ?? []) as { id: string; name: string; employment_type: EmploymentType; hourly_rate: number | null; xero_employee_id: string | null }[]).map((p) => {
    const mine = allEntries.filter((e) => e.crew_member_id === p.id);
    const approved = mine.filter((e) => e.status === "approved");
    const counted = mine.filter((e) => e.status !== "rejected" && e.clock_out);
    const byDay = personHours(counted, p.employment_type, tz, holidays, org.settings, p.id);
    const tot = totalsFor(byDay, { type: p.employment_type, flat: settings.flat.includes(p.id), rate: p.hourly_rate == null ? orgRate : Number(p.hourly_rate) }, settings.rules);
    const totals = Object.fromEntries(CATEGORIES.map((c) => [c, Math.round([...byDay.values()].reduce((t, h) => t + h[c], 0) * 100) / 100])) as PersonSheet["totals"];
    return {
      id: p.id, name: p.name, type: p.employment_type, xero: !!p.xero_employee_id,
      hours: tot.hours, cost: tot.cost,
      totals, approved: approved.length, waiting: mine.filter((e) => e.status === "pending").length, unsent: approved.filter((e) => !e.sent_to_xero_at).length,
      entries: mine.map((e) => {
        const sh = allShifts.find((s) => s.id === e.staff_shift_id);
        return {
          id: e.id, date: e.work_date, status: e.status, source: e.source, note: e.note, sent: !!e.sent_to_xero_at,
          clockIn: toLocal(e.clock_in, tz), clockOut: e.clock_out ? toLocal(e.clock_out, tz) : null,
          paidStart: e.paid_start ? toLocal(e.paid_start, tz) : toLocal(e.clock_in, tz), paidFinish: e.paid_finish ? toLocal(e.paid_finish, tz) : e.clock_out ? toLocal(e.clock_out, tz) : null,
          breakMinutes: e.break_minutes, rostered: sh ? `${sh.start_time.slice(0, 5)}–${sh.finish_time.slice(0, 5)}${sh.break_minutes ? ` (${sh.break_minutes}m break)` : ""}` : null,
        };
      }),
      missing: allShifts.filter((s) => s.crew_member_id === p.id && !used.has(s.id) && s.shift_date <= today).map((s) => ({ id: s.id, date: s.shift_date, ...shiftSpan(s.shift_date, s.start_time, s.finish_time), breakMinutes: s.break_minutes })),
    };
  });

  return (
    <div>
      <PageHeader title="Roster" subtitle="Check clocked hours, approve them, then send them to Xero Payroll split by award category." />
      <RosterTabs active="timesheets" />
      <Timesheets from={from} to={to} today={today} sheets={sheets} earningsReady={!!settings.xero.earnings.ordinary} />
    </div>
  );
}
