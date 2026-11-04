import "server-only";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { tenantId, xeroDate } from "@/lib/integrations/xero";
import { xeroReason } from "@/lib/integrations/xero-recode";

/**
 * Xero Payroll (Australia) — the timesheets EventureOS sends for the café roster.
 *   GET  /payroll.xro/1.0/Employees              who's on payroll (+ their pay calendar)
 *   GET  /payroll.xro/1.0/PayItems               earnings rates (Ordinary, Saturday, Sunday, Public holiday, overtime, loadings…)
 *   GET  /payroll.xro/1.0/PayrollCalendars       weekly / fortnightly pay periods
 *   GET  /payroll.xro/1.0/Timesheets?where=…     an employee's timesheet for a period
 *   POST /payroll.xro/1.0/Timesheets             [{ EmployeeID, StartDate, EndDate, Status, TimesheetLines: [{ EarningsRateID, NumberOfUnits: [hours per day] }] }]
 * Needs the payroll.employees.read, payroll.settings.read and payroll.timesheets scopes (Setup → Xero Payroll → Connect).
 * https://developer.xero.com/documentation/api/payrollau/timesheets
 */
const API = "https://api.xero.com/payroll.xro/1.0";
const get = <T,>(ctx: SyncContext, path: string) => apiJSON<T>(ctx, `${API}${path}`, { headers: { "xero-tenant-id": tenantId(ctx) } }, `Xero Payroll ${path.split("?")[0]}`);

/** read employees, pay items and past pay runs / payslips (to see the rates used); write timesheets */
export const PAYROLL_SCOPES = ["payroll.employees.read", "payroll.settings.read", "payroll.payruns.read", "payroll.payslip.read", "payroll.timesheets"];

export interface PayrollEmployee { id: string; name: string; email: string | null; status: string; calendarId: string | null }
export interface EarningsRate { id: string; name: string; type: string; rateType: string }
import type { PayCalendar } from "@/lib/roster/period";
export type { PayCalendar };
export { periodFor, periodDates } from "@/lib/roster/period";

export async function payrollEmployees(ctx: SyncContext): Promise<PayrollEmployee[]> {
  const out: PayrollEmployee[] = [];
  for (let page = 1; page < 20; page++) {
    const r = await get<{ Employees?: { EmployeeID: string; FirstName?: string; LastName?: string; Email?: string; Status?: string; PayrollCalendarID?: string }[] }>(ctx, `/Employees?page=${page}`);
    const list = r.Employees ?? [];
    out.push(...list.map((e) => ({ id: e.EmployeeID, name: `${e.FirstName ?? ""} ${e.LastName ?? ""}`.trim(), email: e.Email?.toLowerCase() ?? null, status: e.Status ?? "ACTIVE", calendarId: e.PayrollCalendarID ?? null })));
    if (list.length < 100) break;
  }
  return out;
}

export async function earningsRates(ctx: SyncContext): Promise<EarningsRate[]> {
  const r = await get<{ PayItems?: { EarningsRates?: { EarningsRateID: string; Name: string; EarningsType?: string; RateType?: string; CurrentRecord?: boolean }[] } }>(ctx, "/PayItems");
  return (r.PayItems?.EarningsRates ?? []).filter((x) => x.CurrentRecord !== false).map((x) => ({ id: x.EarningsRateID, name: x.Name, type: x.EarningsType ?? "", rateType: x.RateType ?? "" }));
}

export async function payCalendars(ctx: SyncContext): Promise<PayCalendar[]> {
  const r = await get<{ PayrollCalendars?: { PayrollCalendarID: string; Name: string; CalendarType: string; StartDate?: string }[] }>(ctx, "/PayrollCalendars");
  return (r.PayrollCalendars ?? []).map((c) => ({ id: c.PayrollCalendarID, name: c.Name, type: c.CalendarType, start: xeroDate(c.StartDate) }));
}

export interface TimesheetDraft { employeeId: string; start: string; end: string; status: "DRAFT" | "APPROVED"; lines: { earningsRateId: string; units: number[] }[] }

/** Create the employee's timesheet for the period, or replace the lines of the one that's already there (unless it's been paid). */
export async function upsertTimesheet(ctx: SyncContext, t: TimesheetDraft): Promise<{ id: string; replaced: boolean }> {
  const where = encodeURIComponent(`EmployeeID==Guid("${t.employeeId}")&&StartDate==DateTime(${t.start.replace(/-/g, ",")})`);
  const existing = await get<{ Timesheets?: { TimesheetID: string; Status: string }[] }>(ctx, `/Timesheets?where=${where}`).catch(() => ({ Timesheets: [] }));
  const cur = existing.Timesheets?.[0];
  if (cur && cur.Status === "PROCESSED") throw new Error("this period's timesheet is already in a pay run in Xero, so it can't be changed from here. Add the hours on their payslip in the Xero pay run (or delete the draft pay run, send again, then create the pay run again).");
  const post = (b: unknown) => apiJSON<{ Timesheets?: { TimesheetID: string }[] }>(ctx, `${API}/Timesheets`, {
    method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" }, body: JSON.stringify(b),
  }, "Xero Payroll timesheet");
  const body = (status: string) => [{
    ...(cur ? { TimesheetID: cur.TimesheetID } : {}),
    EmployeeID: t.employeeId, StartDate: t.start, EndDate: t.end, Status: status,
    TimesheetLines: t.lines.map((l) => ({ EarningsRateID: l.earningsRateId, NumberOfUnits: l.units })),
  }];
  try {
    let r;
    try { r = await post(body(t.status)); }
    catch (first) {
      // Xero won't change an approved timesheet's hours: put it back to draft, change it, then approve it again
      if (!cur || cur.Status !== "APPROVED") throw first;
      console.error("[xero-payroll] timesheet update refused, retrying via draft:", xeroReason(first));
      await post([{ TimesheetID: cur.TimesheetID, EmployeeID: t.employeeId, StartDate: t.start, EndDate: t.end, Status: "DRAFT" }]);
      r = await post(body("DRAFT"));
      if (t.status === "APPROVED") r = await post([{ TimesheetID: cur.TimesheetID, EmployeeID: t.employeeId, StartDate: t.start, EndDate: t.end, Status: "APPROVED" }]);
    }
    const id = r.Timesheets?.[0]?.TimesheetID;
    if (!id) throw new Error("Xero didn't return a timesheet id");
    return { id, replaced: !!cur };
  } catch (e) {
    const why = xeroReason(e);
    console.error("[xero-payroll] timesheet", t.start, "→", why);
    throw new Error(cur ? `${why} — Xero kept the timesheet it already has (${cur.Status.toLowerCase()}). In Xero → Payroll → Timesheets, open it and choose Revert to draft (or Delete), then send again.` : why);
  }
}


export interface PastPay { employeeId: string; name: string; runs: number; lines: { earningsRateId: string; name: string; rate: number | null; hours: number; amount: number }[] }

/**
 * What the last few posted pay runs paid each person: hours and rate per earnings rate.
 *   GET /PayRuns · GET /PayRuns/{id} (its payslips) · GET /Payslip/{id} (earnings lines)
 */
export async function pastPay(ctx: SyncContext, runs = 4): Promise<{ periods: { start: string | null; end: string | null; paid: string | null }[]; people: PastPay[] }> {
  const rates = new Map((await earningsRates(ctx)).map((r) => [r.id, r.name]));
  const all = await get<{ PayRuns?: { PayRunID: string; PayRunStatus: string; PayRunPeriodStartDate?: string; PayRunPeriodEndDate?: string; PaymentDate?: string }[] }>(ctx, "/PayRuns");
  const posted = (all.PayRuns ?? []).filter((r) => r.PayRunStatus === "POSTED")
    .sort((a, b) => (xeroDate(b.PaymentDate) ?? "").localeCompare(xeroDate(a.PaymentDate) ?? "")).slice(0, runs);
  const people = new Map<string, PastPay>();
  const periods: { start: string | null; end: string | null; paid: string | null }[] = [];
  for (const run of posted) {
    periods.push({ start: xeroDate(run.PayRunPeriodStartDate), end: xeroDate(run.PayRunPeriodEndDate), paid: xeroDate(run.PaymentDate) });
    const d = await get<{ PayRuns?: { Payslips?: { PayslipID: string; EmployeeID: string; FirstName?: string; LastName?: string }[] }[] }>(ctx, `/PayRuns/${run.PayRunID}`);
    for (const ps of d.PayRuns?.[0]?.Payslips ?? []) {
      const slip = await get<{ Payslip?: { EarningsLines?: { EarningsRateID: string; RatePerUnit?: number; NumberOfUnits?: number; Amount?: number; FixedAmount?: number }[] } }>(ctx, `/Payslip/${ps.PayslipID}`);
      const p = people.get(ps.EmployeeID) ?? { employeeId: ps.EmployeeID, name: `${ps.FirstName ?? ""} ${ps.LastName ?? ""}`.trim(), runs: 0, lines: [] };
      p.runs++;
      for (const l of slip.Payslip?.EarningsLines ?? []) {
        const units = Number(l.NumberOfUnits ?? 0), rate = l.RatePerUnit == null ? null : Number(l.RatePerUnit);
        const amount = Number(l.Amount ?? l.FixedAmount ?? (rate != null ? rate * units : 0));
        const cur = p.lines.find((x) => x.earningsRateId === l.EarningsRateID && x.rate === rate);
        if (cur) { cur.hours += units; cur.amount += amount; }
        else p.lines.push({ earningsRateId: l.EarningsRateID, name: rates.get(l.EarningsRateID) ?? "Earnings", rate, hours: units, amount });
      }
      people.set(ps.EmployeeID, p);
    }
  }
  return { periods, people: [...people.values()].map((p) => ({ ...p, lines: p.lines.map((l) => ({ ...l, hours: Math.round(l.hours * 100) / 100, amount: Math.round(l.amount * 100) / 100 })) })) };
}

/**
 * The hourly rate Xero Payroll pays someone for ordinary hours (Mon–Fri) — from their pay template, else the
 * earnings rate's own rate. null when Xero doesn't hold an hourly rate for them (e.g. a salary).
 *   GET /Employees/{id} → OrdinaryEarningsRateID, PayTemplate.EarningsLines[{ EarningsRateID, CalculationType, RatePerUnit }]
 */
export async function ordinaryRate(ctx: SyncContext, employeeId: string, ordinaryId: string | null, rates?: Map<string, number | null>): Promise<{ rate: number | null; earningsRateId: string | null }> {
  const r = await get<{ Employees?: { OrdinaryEarningsRateID?: string; PayTemplate?: { EarningsLines?: { EarningsRateID: string; CalculationType?: string; RatePerUnit?: number }[] } }[] }>(ctx, `/Employees/${employeeId}`);
  const e = r.Employees?.[0];
  const id = ordinaryId || e?.OrdinaryEarningsRateID || null;
  const lines = e?.PayTemplate?.EarningsLines ?? [];
  const line = lines.find((l) => l.EarningsRateID === id);
  if (line?.RatePerUnit != null && Number(line.RatePerUnit) > 0) return { rate: Number(line.RatePerUnit), earningsRateId: id };
  if (id && rates?.has(id) && (rates.get(id) ?? 0) > 0) return { rate: rates.get(id)!, earningsRateId: id };
  return { rate: null, earningsRateId: id };
}

/** Each earnings rate's own hourly rate (when it has one), by id. */
export async function earningsRateAmounts(ctx: SyncContext): Promise<Map<string, number | null>> {
  const r = await get<{ PayItems?: { EarningsRates?: { EarningsRateID: string; RatePerUnit?: number; CurrentRecord?: boolean }[] } }>(ctx, "/PayItems");
  return new Map((r.PayItems?.EarningsRates ?? []).map((x) => [x.EarningsRateID, x.RatePerUnit == null ? null : Number(x.RatePerUnit)]));
}
