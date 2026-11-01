import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, todayISO } from "@/lib/format";
import { readRosterSettings } from "@/lib/roster/settings";
import { weekOf } from "@/lib/roster/award";
import { RosterTabs } from "../tabs";
import { AbaCard, AreaQualsCard, AutomationCard, ChecklistsCard, StaffDetailsCard, type StaffExtra } from "./extras";
import { AreasCard, HolidaysCard, PastPayCard, TextsCard, OptionsCard, PayRulesCard, PeopleCard, XeroPayrollCard } from "./ui";

export const metadata = { title: "Roster setup" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "team", label: "Team" }, { key: "pay", label: "Pay & Xero" }, { key: "clocking", label: "Clocking & breaks" },
  { key: "alerts", label: "Texts & alerts" }, { key: "checklists", label: "Checklists" }, { key: "bank", label: "Bank file" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

export default async function RosterSetup({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const sec = ((await searchParams).section ?? "team") as Section;
  const section: Section = SECTIONS.some((x) => x.key === sec) ? sec : "team";
  const needXero = section === "team" || section === "pay";
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
  const payrollOn = xeroOn && !settings.payroll_off && Array.isArray(xi?.scopes) && (xi!.scopes as string[]).some((s) => s.startsWith("payroll."));
  let payroll: { employees: { id: string; name: string; email: string | null }[]; rates: { id: string; name: string }[] } | null = null;
  let payrollError: string | null = null;
  // kept for 15 minutes so opening Setup doesn't wait on Xero every time (Base rates from Xero / Save always read it fresh)
  type PayrollCache = { employees: { id: string; name: string; email: string | null }[]; rates: { id: string; name: string }[]; fetched_at: string };
  const cached = ((org.settings as { roster?: { payroll_cache?: PayrollCache } } | null)?.roster?.payroll_cache) ?? null;
  if (!needXero) { /* Xero is only read on the Team and Pay sections */ }
  else if (payrollOn && cached?.fetched_at && (org.settings as { roster?: { pay_calendar?: unknown } } | null)?.roster?.pay_calendar && Date.now() - Date.parse(cached.fetched_at) < 15 * 60_000) payroll = { employees: cached.employees, rates: cached.rates };
  else if (payrollOn) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { payrollEmployees, earningsRates } = await import("@/lib/integrations/xero-payroll");
      const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
      const { payCalendars } = await import("@/lib/integrations/xero-payroll");
      const [employees, rates, calendars] = await Promise.all([payrollEmployees(ctx), earningsRates(ctx), payCalendars(ctx).catch(() => [])]);
      const live = employees.filter((e) => e.status !== "TERMINATED");
      payroll = { employees: live.map(({ id, name, email }) => ({ id, name, email })), rates: rates.map(({ id, name }) => ({ id, name })) };
      // the pay calendar most of your staff are on (e.g. Fortnightly) — Timesheets opens on its current pay period
      const counts = new Map<string, number>();
      for (const e of live) if (e.calendarId) counts.set(e.calendarId, (counts.get(e.calendarId) ?? 0) + 1);
      const mainId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const main = calendars.find((c) => c.id === mainId) ?? null;
      const { data: cur } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
      const st = (cur?.settings ?? {}) as Record<string, unknown>;
      await supabase.from("organisations").update({ settings: { ...st, roster: { ...((st.roster ?? {}) as Record<string, unknown>), payroll_cache: { ...payroll, fetched_at: new Date().toISOString() }, ...(main ? { pay_calendar: main } : {}) } } }).eq("id", org.id);
    } catch (e) { payrollError = e instanceof Error ? e.message : String(e); }
  }
  // What past pay runs paid (rates and earnings rates), kept for 12 hours so the page stays quick
  const payslipsOn = payrollOn && (xi!.scopes as string[]).includes("payroll.payslip.read");
  type Past = Awaited<ReturnType<typeof import("@/lib/integrations/xero-payroll").pastPay>> & { fetched_at?: string };
  let past = ((org.settings as { roster?: { past_pay?: Past } } | null)?.roster?.past_pay) ?? null;
  if (section === "pay" && payslipsOn && !payrollError && (!past?.fetched_at || Date.now() - Date.parse(past.fetched_at) > 12 * 3_600_000)) {
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

  const { data: tw } = await supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "twilio").maybeSingle();
  const smsOn = tw?.status === "connected";
  const { data: phoneRows } = await supabase.from("crew_members").select("id, phone").eq("organisation_id", org.id);
  const phones = new Map(((phoneRows ?? []) as { id: string; phone: string | null }[]).map((r) => [r.id, r.phone]));
  type P = { id: string; name: string; email: string | null; role: string | null; on_roster: boolean; employment_type: "casual" | "part_time" | "full_time"; default_area_id: string | null; hourly_rate: number | null; xero_employee_id: string | null; kiosk_pin_hash: string | null };
  const list = ((people ?? []) as P[]).map(({ kiosk_pin_hash, ...p }) => ({ ...p, hourly_rate: p.hourly_rate == null ? null : Number(p.hourly_rate), has_pin: !!kiosk_pin_hash, flat: settings.flat.includes(p.id) }));

  // staff details (0087): documents, notes, bank details (Wages), checklists, what areas need
  const roster = list.filter((p) => p.on_roster);
  const [qR, nR, bR, cR, aR] = await Promise.all([
    supabase.from("staff_qualifications").select("id, crew_member_id, name, reference, expires_on, file_path").eq("organisation_id", org.id).order("name"),
    supabase.from("staff_notes").select("id, crew_member_id, body, author_name, created_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("staff_bank_accounts").select("crew_member_id, account_name, bsb, account_number").eq("organisation_id", org.id),
    supabase.from("roster_checklists").select("id, name, area_id, weekdays, due_by, items").eq("organisation_id", org.id).eq("active", true).order("position").order("name"),
    supabase.from("roster_areas").select("id, name, required_quals, active").eq("organisation_id", org.id).order("position"),
  ]);
  const extrasReady = !qR.error;
  const missing = <Card><EmptyState title="One database update to go">Run 0087_roster_extras.sql in Supabase for staff documents, notes, checklists, late texts and the bank file.</EmptyState></Card>;
  type Q = { id: string; crew_member_id: string; name: string; reference: string | null; expires_on: string | null; file_path: string | null };
  const quals = (qR.data ?? []) as Q[];
  const docUrl = new Map<string, string>();
  const paths = quals.map((x) => x.file_path).filter((x): x is string => !!x);
  if (paths.length) { const { data: signed } = await supabase.storage.from("staff-docs").createSignedUrls(paths, 3600); for (const x of signed ?? []) if (x.path && x.signedUrl) docUrl.set(x.path, x.signedUrl); }
  const notes = (nR.data ?? []) as { id: string; crew_member_id: string; body: string; author_name: string | null; created_at: string }[];
  const banks = new Map(((bR.data ?? []) as { crew_member_id: string; account_name: string; bsb: string; account_number: string }[]).map((x) => [x.crew_member_id, { name: x.account_name, bsb: x.bsb, last: x.account_number.slice(-3) }]));
  const extras: StaffExtra[] = roster.map((p) => ({
    id: p.id, name: p.name, onPayroll: !!p.xero_employee_id, manager: settings.app_managers.includes(p.id), unpaid: settings.unpaid.includes(p.id),
    quals: quals.filter((x) => x.crew_member_id === p.id).map((x) => ({ id: x.id, name: x.name, reference: x.reference, expires_on: x.expires_on, url: x.file_path ? docUrl.get(x.file_path) ?? null : null })),
    notes: notes.filter((x) => x.crew_member_id === p.id).map((x) => ({ id: x.id, body: x.body, author: x.author_name, at: x.created_at })),
    bank: banks.get(p.id) ?? null,
  }));
  const activeAreas = ((aR.data ?? []) as { id: string; name: string; required_quals?: string[]; active: boolean }[]).filter((x) => x.active);

  return (
    <div>
      <PageHeader title="Roster" subtitle="Who's on the café roster, where they work, how clocking on works, and how hours go to Xero Payroll." />
      <RosterTabs active="setup" />
      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 text-[0.8125rem]" aria-label="Setup sections">
        {SECTIONS.map((x) => (
          <Link key={x.key} href={x.key === "team" ? "/roster/setup" : `/roster/setup?section=${x.key}`}
            className={x.key === section ? "whitespace-nowrap rounded-full bg-ink px-3 py-1.5 font-medium text-surface" : "whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-ink-muted ring-1 ring-line hover:text-ink"}>{x.label}</Link>
        ))}
      </nav>
      <div className="space-y-6">
        {section === "team" && <>
          <PeopleCard people={list} areas={(areas ?? []) as { id: string; name: string; colour: string | null; active: boolean }[]} payroll={payroll?.employees ?? null} orgRate={orgRate} />
          {extrasReady ? <StaffDetailsCard people={extras} today={today} /> : missing}
          <AreasCard areas={(areas ?? []) as { id: string; name: string; colour: string | null; active: boolean }[]} home={settings.home_areas} />
          {extrasReady && <AreaQualsCard areas={activeAreas.map((x) => ({ id: x.id, name: x.name, required_quals: x.required_quals ?? [] }))} />}
        </>}
        {section === "pay" && <>
          <XeroPayrollCard xeroOn={xeroOn} payrollOn={payrollOn} error={payrollError} rates={payroll?.rates ?? []} earnings={settings.xero.earnings} status={settings.xero.status} />
          {payrollOn && <PastPayCard past={payslipsOn ? past : null} />}
          <PayRulesCard rules={settings.rules} />
          <HolidaysCard holidays={(holidays ?? []) as { holiday_date: string; name: string }[]} />
        </>}
        {section === "clocking" && <OptionsCard rounding={settings.rounding} grace={settings.grace} googleCalendar={settings.google_calendar} geofence={settings.geofence} kioskSet={!!settings.kiosk_hash} slug={org.slug} clock={settings.clock} meal={settings.meal} address={settings.place.address} breaks={settings.breaks} />}
        {section === "alerts" && <>
          <AutomationCard v={{ late: settings.late, reminders: settings.reminders, auto_approve: settings.auto_approve, limits: settings.limits }} smsOn={smsOn} />
          <TextsCard people={list.filter((p) => p.on_roster).map((p) => ({ id: p.id, name: p.name, phone: phones.get(p.id) ?? null, email: p.email }))} monday={weekOf(today)} smsOn={smsOn} />
        </>}
        {section === "checklists" && (extrasReady ? <ChecklistsCard lists={(cR.data ?? []) as { id: string; name: string; area_id: string | null; weekdays: number[]; due_by: string | null; items: string[] }[]} areas={activeAreas.map((x) => ({ id: x.id, name: x.name }))} /> : missing)}
        {section === "bank" && <AbaCard v={settings.aba} />}
      </div>
    </div>
  );
}
