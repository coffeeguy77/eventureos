import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { readRosterSettings } from "./settings";

/**
 * Set people's base rate from Xero Payroll, so cost estimates and the staff app's shift pay are right.
 * Xero holds the rate it pays for ordinary hours — for a casual that already includes the casual loading — so the
 * base rate is that ÷ the ordinary multiplier in the pay rules (e.g. casual $34.76 ÷ 1.25 = $27.81).
 * Someone on an agreed flat rate gets Xero's ordinary rate as is. Falls back to their latest payslip's ordinary rate.
 */
export async function ratesFromXero(db: SupabaseClient, ctx: SyncContext, org: { id: string; settings: unknown }, memberIds?: string[]) {
  const st = readRosterSettings(org.settings);
  let q = db.from("crew_members").select("id, name, employment_type, hourly_rate, xero_employee_id").eq("organisation_id", org.id).not("xero_employee_id", "is", null);
  if (memberIds?.length) q = q.in("id", memberIds);
  const { data } = await q;
  const people = (data ?? []) as { id: string; name: string; employment_type: "casual" | "part_time" | "full_time"; hourly_rate: number | null; xero_employee_id: string }[];
  if (!people.length) return [];
  const { ordinaryRate, earningsRateAmounts } = await import("@/lib/integrations/xero-payroll");
  const amounts = await earningsRateAmounts(ctx).catch(() => new Map<string, number | null>());
  const past = ((org.settings as { roster?: { past_pay?: { people?: { employeeId: string; lines: { earningsRateId: string; rate: number | null }[] }[] } } } | null)?.roster?.past_pay?.people) ?? [];
  const out: { name: string; from: number | null; to: number | null; xero: number | null; note?: string }[] = [];
  for (const p of people) {
    try {
      const r = await ordinaryRate(ctx, p.xero_employee_id, st.xero.earnings.ordinary ?? null, amounts);
      let xero = r.rate;
      let note: string | undefined;
      if (xero == null) {
        const slip = past.find((x) => x.employeeId === p.xero_employee_id)?.lines.find((l) => (!r.earningsRateId || l.earningsRateId === r.earningsRateId) && (l.rate ?? 0) > 0);
        if (slip?.rate) { xero = slip.rate; note = "from their last payslip"; }
      }
      if (xero == null) { out.push({ name: p.name, from: p.hourly_rate == null ? null : Number(p.hourly_rate), to: null, xero: null, note: "Xero has no hourly rate for them" }); continue; }
      const flat = st.flat.includes(p.id);
      const mult = st.rules[p.employment_type]?.weekday || 1;
      const base = Math.round((flat ? xero : xero / mult) * 100) / 100;
      if (p.hourly_rate == null || Math.abs(Number(p.hourly_rate) - base) >= 0.005) await db.from("crew_members").update({ hourly_rate: base }).eq("id", p.id).eq("organisation_id", org.id);
      out.push({ name: p.name, from: p.hourly_rate == null ? null : Number(p.hourly_rate), to: base, xero, note });
    } catch (e) {
      out.push({ name: p.name, from: p.hourly_rate == null ? null : Number(p.hourly_rate), to: null, xero: null, note: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export const describeRates = (list: Awaited<ReturnType<typeof ratesFromXero>>) =>
  list.map((r) => r.to != null ? `${r.name}: $${r.to.toFixed(2)} base (Xero pays $${r.xero!.toFixed(2)} Mon–Fri${r.note ? `, ${r.note}` : ""})` : `${r.name}: unchanged — ${r.note}`).join(" · ");
