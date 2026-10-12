import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteItemForInvoice } from "@/lib/invoices/lines";

/** A quote's lines (with price-list codes) for starting an invoice's editable lines. */
export async function quoteItemsForInvoice(db: SupabaseClient, orgId: string, quoteId: string | null): Promise<QuoteItemForInvoice[] | null> {
  if (!quoteId) return null;
  const { data, error } = await db.from("quote_items")
    .select("name, description, quantity, tax_rate, line_total, is_optional, position, service_id, section:quote_sections(position, is_optional), service:services(code, xero_account_code)")
    .eq("organisation_id", orgId).eq("quote_id", quoteId);
  if (error || !data) return null;
  type R = { name: string; description: string | null; quantity: number; tax_rate: number; line_total: number; is_optional: boolean; position: number; service_id: string | null;
    section: { position: number; is_optional: boolean } | null; service: { code: string | null; xero_account_code: string | null } | null };
  return (data as unknown as R[])
    .sort((a, b) => (a.section?.position ?? 0) - (b.section?.position ?? 0) || a.position - b.position)
    .map((r) => ({ name: r.name, description: r.description, quantity: Number(r.quantity), tax_rate: Number(r.tax_rate), line_total: Number(r.line_total),
      is_optional: r.is_optional, section_optional: !!r.section?.is_optional, service_id: r.service_id, code: r.service?.code ?? null, account: r.service?.xero_account_code ?? null }));
}
