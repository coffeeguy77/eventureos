import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bonusFigures, type BonusKind } from "./core";

export interface BonusRow {
  id: string; user_id: string; invoice_id: string; kind: BonusKind; rate: number; status: "open" | "paid" | "cancelled";
  amount_paid: number | null; paid_on: string | null; reference: string | null; created_at: string;
  invoice: { number: string; issue_date: string | null; subtotal: number; total: number; amount_paid: number; status: string; customer: { name: string } | null } | null;
  figures: ReturnType<typeof bonusFigures>;
}

/** Bonuses (everyone's, or one person's), with what each is worth now. Null before the 0081 database update. */
export async function loadBonuses(db: SupabaseClient, orgId: string, userId?: string): Promise<BonusRow[] | null> {
  let q = db.from("sales_bonuses").select("id, user_id, invoice_id, kind, rate, status, amount_paid, paid_on, reference, created_at, invoice:invoices(number, issue_date, subtotal, total, amount_paid, status, customer:customers(name))")
    .eq("organisation_id", orgId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1000);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return /sales_bonuses/.test(error.message) ? null : [];
  return ((data ?? []) as unknown as Omit<BonusRow, "figures">[]).map((b) => ({
    ...b, rate: Number(b.rate), amount_paid: b.amount_paid == null ? null : Number(b.amount_paid),
    figures: b.invoice ? bonusFigures({ subtotal: Number(b.invoice.subtotal), total: Number(b.invoice.total), amount_paid: Number(b.invoice.amount_paid), status: b.invoice.status }, Number(b.rate))
      : { exGst: 0, full: 0, earned: 0, paidInFull: false, share: 0 },
  }));
}

/** Totals for a list: paid out, ready to pay (customer paid in full), and still waiting on the customer. */
export function bonusTotals(rows: BonusRow[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paid = r2(rows.filter((b) => b.status === "paid").reduce((a, b) => a + (b.amount_paid ?? 0), 0));
  const ready = r2(rows.filter((b) => b.status === "open" && b.figures.paidInFull).reduce((a, b) => a + b.figures.full, 0));
  const waiting = r2(rows.filter((b) => b.status === "open" && !b.figures.paidInFull).reduce((a, b) => a + b.figures.full, 0));
  const sales = (k: BonusKind) => r2(rows.filter((b) => b.kind === k).reduce((a, b) => a + b.figures.exGst, 0));
  return { paid, ready, waiting, buildSales: sales("build"), maintenanceSales: sales("maintenance") };
}
