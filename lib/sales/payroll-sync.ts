import "server-only";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { tenantId, xeroDate } from "@/lib/integrations/xero";
import { all } from "./stats-server";

/**
 * Business Sales: what Xero Payroll actually paid each person, per posted pay run, for the last 37 months.
 *   GET /PayRuns?page=n (list) · GET /PayRuns/{id} (its payslip summaries: Wages, Super per employee)
 * Pay runs already brought in are skipped (a posted pay run doesn't change), so it carries on where it stopped.
 */
const API = "https://api.xero.com/payroll.xro/1.0";
const BUDGET_MS = 45_000;
const get = <T,>(ctx: SyncContext, path: string) => apiJSON<T>(ctx, `${API}${path}`, { headers: { "xero-tenant-id": tenantId(ctx) } }, `Xero Payroll ${path.split("?")[0]}`);

interface RunSummary { PayRunID: string; PayRunStatus: string; PayRunPeriodStartDate?: string; PayRunPeriodEndDate?: string; PaymentDate?: string }

export async function syncPayrollHistory(ctx: SyncContext): Promise<{ message: string; partial: boolean; done: number; total: number }> {
  const deadline = Date.now() + BUDGET_MS;
  const since = new Date(Date.now() - 37 * 31 * 86400_000).toISOString().slice(0, 10);
  const runs: RunSummary[] = [];
  for (let page = 1; page <= 30; page++) {
    const d = await get<{ PayRuns?: RunSummary[] }>(ctx, `/PayRuns?page=${page}`);
    const list = d.PayRuns ?? [];
    runs.push(...list);
    if (list.length < 100) break;
  }
  const posted = runs.filter((r) => r.PayRunStatus === "POSTED" && (xeroDate(r.PayRunPeriodEndDate) ?? "") >= since);
  const have = await all<{ pay_run_id: string }>((a, b) => ctx.db.from("sale_payroll").select("pay_run_id").eq("organisation_id", ctx.org.id).order("pay_run_id").range(a, b));
  const got = new Set(have.map((r) => r.pay_run_id));
  const todo = posted.filter((r) => !got.has(r.PayRunID)).sort((a, b) => (xeroDate(b.PaymentDate) ?? "").localeCompare(xeroDate(a.PaymentDate) ?? ""));
  let done = 0;
  for (const run of todo) {
    if (Date.now() > deadline) break;
    const d = await get<{ PayRuns?: { Payslips?: { EmployeeID: string; FirstName?: string; LastName?: string; Wages?: number; Super?: number }[] }[] }>(ctx, `/PayRuns/${run.PayRunID}`);
    const end = xeroDate(run.PayRunPeriodEndDate);
    if (!end) { done++; continue; }
    const rows = (d.PayRuns?.[0]?.Payslips ?? []).map((p) => ({
      organisation_id: ctx.org.id, pay_run_id: run.PayRunID, employee_id: p.EmployeeID,
      employee_name: `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim() || "Employee",
      period_start: xeroDate(run.PayRunPeriodStartDate), period_end: end, payment_date: xeroDate(run.PaymentDate),
      wages: Math.round((Number(p.Wages) || 0) * 100) / 100, super: Math.round((Number(p.Super) || 0) * 100) / 100,
    }));
    if (rows.length) {
      const { error } = await ctx.db.from("sale_payroll").upsert(rows, { onConflict: "organisation_id,pay_run_id,employee_id" });
      if (error) throw new Error(/sale_payroll/.test(error.message) ? "Run the database update 0113_sale_payroll_requests.sql first." : `Couldn't save pay runs: ${error.message}`);
    }
    done++;
  }
  const left = todo.length - done;
  return left > 0
    ? { message: `Bringing in pay runs — ${posted.length - left} of ${posted.length} done. It carries on automatically.`, partial: true, done: posted.length - left, total: posted.length }
    : { message: `Pay history is up to date: ${posted.length} pay runs since ${since.slice(0, 7)}.`, partial: false, done: posted.length, total: posted.length };
}
