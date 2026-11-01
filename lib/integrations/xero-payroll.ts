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

export const PAYROLL_SCOPES = ["payroll.employees.read", "payroll.settings.read", "payroll.timesheets"];

export interface PayrollEmployee { id: string; name: string; email: string | null; status: string; calendarId: string | null }
export interface EarningsRate { id: string; name: string; type: string; rateType: string }
export interface PayCalendar { id: string; name: string; type: string; start: string | null }

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

const DAY = 86_400_000;
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The pay period (start, end) of a calendar that contains a date. Monthly calendars run on the start date's day of the month. */
export function periodFor(cal: PayCalendar, date: string): { start: string; end: string } | null {
  if (!cal.start) return null;
  const len = cal.type === "WEEKLY" ? 7 : cal.type === "FORTNIGHTLY" ? 14 : cal.type === "FOURWEEKLY" ? 28 : 0;
  if (len) {
    const k = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${cal.start}T00:00:00Z`)) / (len * DAY));
    const start = add(cal.start, k * len);
    return { start, end: add(start, len - 1) };
  }
  if (cal.type === "MONTHLY") {
    const day = Number(cal.start.slice(8, 10));
    const [y, m] = date.split("-").map(Number);
    const mk = (yy: number, mm: number) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`; };
    let start = mk(y, m);
    if (start > date) start = m === 1 ? mk(y - 1, 12) : mk(y, m - 1);
    const [sy, sm] = start.split("-").map(Number);
    const next = sm === 12 ? mk(sy + 1, 1) : mk(sy, sm + 1);
    return { start, end: add(next, -1) };
  }
  return null;
}

export interface TimesheetDraft { employeeId: string; start: string; end: string; status: "DRAFT" | "APPROVED"; lines: { earningsRateId: string; units: number[] }[] }

/** Create the employee's timesheet for the period, or replace the lines of the one that's already there (unless it's been paid). */
export async function upsertTimesheet(ctx: SyncContext, t: TimesheetDraft): Promise<{ id: string; replaced: boolean }> {
  const where = encodeURIComponent(`EmployeeID==Guid("${t.employeeId}")&&StartDate==DateTime(${t.start.replace(/-/g, ",")})`);
  const existing = await get<{ Timesheets?: { TimesheetID: string; Status: string }[] }>(ctx, `/Timesheets?where=${where}`).catch(() => ({ Timesheets: [] }));
  const cur = existing.Timesheets?.[0];
  if (cur && cur.Status === "PROCESSED") throw new Error("Xero has already paid this period's timesheet — change it in Xero.");
  const body = [{
    ...(cur ? { TimesheetID: cur.TimesheetID } : {}),
    EmployeeID: t.employeeId, StartDate: t.start, EndDate: t.end, Status: t.status,
    TimesheetLines: t.lines.map((l) => ({ EarningsRateID: l.earningsRateId, NumberOfUnits: l.units })),
  }];
  try {
    const r = await apiJSON<{ Timesheets?: { TimesheetID: string }[] }>(ctx, `${API}/Timesheets`, {
      method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" }, body: JSON.stringify(body),
    }, "Xero Payroll timesheet");
    const id = r.Timesheets?.[0]?.TimesheetID;
    if (!id) throw new Error("Xero didn't return a timesheet id");
    return { id, replaced: !!cur };
  } catch (e) { throw new Error(xeroReason(e)); }
}

/** The dates of a period, in order. */
export function periodDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = add(d, 1)) out.push(d);
  return out;
}
