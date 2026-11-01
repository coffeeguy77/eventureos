import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, todayISO } from "@/lib/format";
import { readRosterSettings } from "@/lib/roster/settings";
import { RosterTabs } from "../tabs";
import { AreasCard, HolidaysCard, PastPayCard, OptionsCard, PayRulesCard, PeopleCard, XeroPayrollCard } from "./ui";

export const metadata = { title: "Roster setup" };
export const dynamic = "force-dynamic";

export default async function RosterSetup() {
  const { supabase, org, role, user } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const probe = await supabase.from("roster_areas").select("id").eq("organisation_id", org.id).limit(1);
  if (probe.error) return (<div><PageHeader title="Roster" /><RosterTabs active="setup" /><Card><EmptyState title="One database update to go">Run 0084_cafe_roster.sql in Supabase to switch on the café roster.</EmptyState></Card></div>);
  const today = todayISO(org.timezone);
  const settings = readRosterSettings(org.settings);
  const { data: rateRow } = await supabase.from("organisations").select("staff_hourly_rate").eq("id", org.id).maybeSingle();
  const orgRate = Number((rateRow as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? 30);

  const [{ data: areas }, { data: people }, { data: holidays }, { data: xi }] = await Promise.all([
    supabase.from("roster_areas").select("id, name, colour, active").eq("organisation_id", org.id).order("position").order("name"),
    supabase.from("crew_members").select("id, name, email, role, on_roster, employment_type, default_area_id, hourly_rate, xero_employee_id, kiosk_pin_hash").eq("organisation_id", org.id).eq("active", true).order("on_roster", { ascending: false }).order("name"),
    supabase.from("public_holidays").select("holiday_date, name").eq("organisation_id", org.id).gte("holiday_date", addDaysISO(today, -60)).order("holiday_date"),
    supabase.from("integrations").select("status, scopes").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
  ]);

  // Xero Payroll: employees and earnings rates, once payroll is connected
  const xeroOn = !!xi && ["connected", "syncing", "error"].includes(xi.status as string);
  const payrollOn = xeroOn && Array.isArray(xi?.scopes) && (xi!.scopes as string[]).some((s) => s.startsWith("payroll."));
  let payroll: { employees: { id: string; name: string; email: string | null }[]; rates: { id: string; name: string }[] } | null = null;
  let payrollError: string | null = null;
  if (payrollOn) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { payrollEmployees, earningsRates } = await import("@/lib/integrations/xero-payroll");
      const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
      const [employees, rates] = await Promise.all([payrollEmployees(ctx), earningsRates(ctx)]);
      payroll = { employees: employees.filter((e) => e.status !== "TERMINATED").map(({ id, name, email }) => ({ id, name, email })), rates: rates.map(({ id, name }) => ({ id, name })) };
    } catch (e) { payrollError = e instanceof Error ? e.message : String(e); }
  }
  // What past pay runs paid (rates and earnings rates), kept for 12 hours so the page stays quick
  const payslipsOn = payrollOn && (xi!.scopes as string[]).includes("payroll.payslip.read");
  type Past = Awaited<ReturnType<typeof import("@/lib/integrations/xero-payroll").pastPay>> & { fetched_at?: string };
  let past = ((org.settings as { roster?: { past_pay?: Past } } | null)?.roster?.past_pay) ?? null;
  if (payslipsOn && !payrollError && (!past?.fetched_at || Date.now() - Date.parse(past.fetched_at) > 12 * 3_600_000)) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { pastPay } = await import("@/lib/integrations/xero-payroll");
      const fresh = { ...(await pastPay(await buildContext(supabase, "user", org.id, "xero", user.id))), fetched_at: new Date().toISOString() };
      past = fresh;
      const { data: cur } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
      const st = (cur?.settings ?? {}) as Record<string, unknown>;
      await supabase.from("organisations").update({ settings: { ...st, roster: { ...((st.roster ?? {}) as Record<string, unknown>), past_pay: fresh } } }).eq("id", org.id);
    } catch (e) { payrollError = payrollError ?? `Past pay runs: ${e instanceof Error ? e.message : String(e)}`; }
  }

  type P = { id: string; name: string; email: string | null; role: string | null; on_roster: boolean; employment_type: "casual" | "part_time" | "full_time"; default_area_id: string | null; hourly_rate: number | null; xero_employee_id: string | null; kiosk_pin_hash: string | null };
  const list = ((people ?? []) as P[]).map(({ kiosk_pin_hash, ...p }) => ({ ...p, hourly_rate: p.hourly_rate == null ? null : Number(p.hourly_rate), has_pin: !!kiosk_pin_hash }));

  return (
    <div>
      <PageHeader title="Roster" subtitle="Who's on the café roster, where they work, how clocking on works, and how hours go to Xero Payroll." />
      <RosterTabs active="setup" />
      <div className="space-y-6">
        <PeopleCard people={list} areas={(areas ?? []) as { id: string; name: string; colour: string | null; active: boolean }[]} payroll={payroll?.employees ?? null} orgRate={orgRate} />
        <AreasCard areas={(areas ?? []) as { id: string; name: string; colour: string | null; active: boolean }[]} />
        <XeroPayrollCard xeroOn={xeroOn} payrollOn={payrollOn} error={payrollError} rates={payroll?.rates ?? []} earnings={settings.xero.earnings} status={settings.xero.status} />
        {payrollOn && <PastPayCard past={payslipsOn ? past : null} />}
        <PayRulesCard rules={settings.rules} />
        <OptionsCard rounding={settings.rounding} grace={settings.grace} googleCalendar={settings.google_calendar} geofence={settings.geofence} kioskSet={!!settings.kiosk_hash} slug={org.slug} />
        <HolidaysCard holidays={(holidays ?? []) as { holiday_date: string; name: string }[]} />
      </div>
    </div>
  );
}
