import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cust } from "@/components/machines/customer-chooser";
import type { PriceRow } from "@/components/machines/items-editor";

/** Clients for the chooser (name, business, email, phone, address). */
export async function loadCustomers(db: SupabaseClient, orgId: string): Promise<Cust[]> {
  const out: Cust[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("customers").select("id, name, company, email, phone, address").eq("organisation_id", orgId).order("name").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Cust[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** The active price list (prices ex GST, as stored). */
export async function loadPriceList(db: SupabaseClient, orgId: string): Promise<PriceRow[]> {
  const { data, error } = await db.from("services").select("id, name, description, unit_price, tax_rate, code, xero_account_code, category").eq("organisation_id", orgId).eq("active", true).order("category").order("position");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; code: string | null; xero_account_code: string | null; category: string | null }[])
    .map((s) => ({ id: s.id, name: s.name, description: s.description, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate), code: s.code, account: s.xero_account_code, category: s.category }));
}
