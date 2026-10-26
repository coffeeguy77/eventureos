import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceRow } from "./analysis";

/** Price lines (all of them, or one supplier / one product), oldest first. */
export async function loadPriceRows(db: SupabaseClient, orgId: string, f: { supplierId?: string; matchKey?: string } = {}): Promise<PriceRow[]> {
  const out: PriceRow[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    let q = db.from("price_lines").select("supplier_id, match_key, description, invoice_date, qty, unit, pack_size, unit_price, line_total, base_unit, base_qty, price_per_base, invoice_id").eq("organisation_id", orgId);
    if (f.supplierId) q = q.eq("supplier_id", f.supplierId);
    if (f.matchKey) q = q.eq("match_key", f.matchKey);
    const { data, error } = await q.order("invoice_date").order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) out.push({
      supplier_id: r.supplier_id as string, match_key: r.match_key as string, description: r.description as string, invoice_date: (r.invoice_date as string) ?? null,
      qty: r.qty === null ? null : Number(r.qty), unit: (r.unit as string) ?? null, pack_size: (r.pack_size as string) ?? null, unit_price: Number(r.unit_price),
      line_total: r.line_total === null ? null : Number(r.line_total), base_unit: r.base_unit as PriceRow["base_unit"], base_qty: Number(r.base_qty),
      price_per_base: Number(r.price_per_base), delivery_id: r.invoice_id as string,
    });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Has migration 0070 been run? */
export async function pricingReady(db: SupabaseClient) {
  const { error } = await db.from("price_suppliers").select("id").limit(1);
  return !error || !/does not exist|could not find/i.test(error.message);
}
