import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { tenantId, xeroDate } from "@/lib/integrations/xero";

/**
 * Payslips from Xero Payroll (posted pay runs) → staff_payslips, so each person sees theirs in the staff app.
 *   GET /PayRuns · GET /PayRuns/{id} (payslip totals) · GET /Payslip/{id} (earnings lines)
 * Only people matched to a Xero employee; payslips already saved aren't read again.
 */
const API = "https://api.xero.com/payroll.xro/1.0";
const get = <T,>(ctx: SyncContext, path: string) => apiJSON<T>(ctx, `${API}${path}`, { headers: { "xero-tenant-id": tenantId(ctx) } }, `Xero Payroll ${path.split("?")[0]}`);

export async function syncPayslips(db: SupabaseClient, ctx: SyncContext, orgId: string, runs = 6): Promise<{ added: number }> {
  const { data: crew } = await db.from("crew_members").select("id, xero_employee_id").eq("organisation_id", orgId).not("xero_employee_id", "is", null);
  const byEmp = new Map(((crew ?? []) as { id: string; xero_employee_id: string }[]).map((c) => [c.xero_employee_id, c.id]));
  if (!byEmp.size) return { added: 0 };
  const rates = new Map<string, string>();
  try {
    const r = await get<{ PayItems?: { EarningsRates?: { EarningsRateID: string; Name: string }[] } }>(ctx, "/PayItems");
    for (const x of r.PayItems?.EarningsRates ?? []) rates.set(x.EarningsRateID, x.Name);
  } catch { /* names are a nicety */ }
  const all = await get<{ PayRuns?: { PayRunID: string; PayRunStatus: string; PayRunPeriodStartDate?: string; PayRunPeriodEndDate?: string; PaymentDate?: string }[] }>(ctx, "/PayRuns");
  const posted = (all.PayRuns ?? []).filter((r) => r.PayRunStatus === "POSTED").sort((a, b) => (xeroDate(b.PaymentDate) ?? "").localeCompare(xeroDate(a.PaymentDate) ?? "")).slice(0, runs);
  let added = 0;
  for (const run of posted) {
    const d = await get<{ PayRuns?: { Payslips?: { PayslipID: string; EmployeeID: string; Wages?: number; Tax?: number; Super?: number; NetPay?: number }[] }[] }>(ctx, `/PayRuns/${run.PayRunID}`);
    const slips = (d.PayRuns?.[0]?.Payslips ?? []).filter((p) => byEmp.has(p.EmployeeID));
    if (!slips.length) continue;
    const { data: have } = await db.from("staff_payslips").select("xero_payslip_id").in("xero_payslip_id", slips.map((p) => p.PayslipID));
    const known = new Set(((have ?? []) as { xero_payslip_id: string }[]).map((x) => x.xero_payslip_id));
    for (const ps of slips.filter((p) => !known.has(p.PayslipID))) {
      let lines: { name: string; hours: number; rate: number | null; amount: number }[] = [];
      try {
        const slip = await get<{ Payslip?: { EarningsLines?: { EarningsRateID: string; RatePerUnit?: number; NumberOfUnits?: number; Amount?: number; FixedAmount?: number }[] } }>(ctx, `/Payslip/${ps.PayslipID}`);
        lines = (slip.Payslip?.EarningsLines ?? []).map((l) => {
          const rate = l.RatePerUnit == null ? null : Number(l.RatePerUnit), hours = Number(l.NumberOfUnits ?? 0);
          return { name: rates.get(l.EarningsRateID) ?? "Earnings", hours, rate, amount: Math.round(Number(l.Amount ?? l.FixedAmount ?? (rate != null ? rate * hours : 0)) * 100) / 100 };
        });
      } catch { /* totals still useful */ }
      const { error } = await db.from("staff_payslips").insert({
        organisation_id: orgId, crew_member_id: byEmp.get(ps.EmployeeID), xero_employee_id: ps.EmployeeID, xero_payslip_id: ps.PayslipID,
        period_start: xeroDate(run.PayRunPeriodStartDate), period_end: xeroDate(run.PayRunPeriodEndDate), paid_on: xeroDate(run.PaymentDate),
        gross: ps.Wages ?? null, tax: ps.Tax ?? null, super: ps.Super ?? null, net: ps.NetPay ?? null, lines,
      });
      if (!error) added++;
    }
  }
  return { added };
}
