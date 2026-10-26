import { requireOrg } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Suppliers, type SupplierRow } from "@/components/pricing/suppliers";

export const dynamic = "force-dynamic";

export default async function PricingSuppliersPage() {
  const { supabase, org } = await requireOrg();
  const [{ data: sups }, { data: invs }, { data: gmail }] = await Promise.all([
    supabase.from("price_suppliers").select("id, name, match_from, match_subject, match_exclude, parser, active, min_order, free_delivery_over, delivery_fee, rep_name, rep_email, rep_phone, notes, last_synced_at").eq("organisation_id", org.id).order("name"),
    supabase.from("price_invoices").select("supplier_id, line_count, invoice_date").eq("organisation_id", org.id).limit(20000),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
  ]);
  const stats = new Map<string, { invoices: number; lines: number; last: string | null }>();
  for (const i of (invs ?? []) as { supplier_id: string; line_count: number; invoice_date: string | null }[]) {
    const x = stats.get(i.supplier_id) ?? { invoices: 0, lines: 0, last: null };
    x.invoices++; x.lines += i.line_count; if (i.invoice_date && (!x.last || i.invoice_date > x.last)) x.last = i.invoice_date;
    stats.set(i.supplier_id, x);
  }
  const rows: SupplierRow[] = ((sups ?? []) as Omit<SupplierRow, "invoices" | "lines" | "last_invoice">[]).map((s) => ({
    ...s, min_order: s.min_order == null ? null : Number(s.min_order), free_delivery_over: s.free_delivery_over == null ? null : Number(s.free_delivery_over), delivery_fee: s.delivery_fee == null ? null : Number(s.delivery_fee),
    invoices: stats.get(s.id)?.invoices ?? 0, lines: stats.get(s.id)?.lines ?? 0, last_invoice: stats.get(s.id)?.last ?? null,
  }));
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Suppliers" subtitle="Who you buy from and where their invoices come from. Minimum orders and free-delivery amounts are used when you order." />
      <Suppliers initial={rows} gmail={["connected", "syncing", "error"].includes(String(gmail?.status ?? ""))} today={todayISO(org.timezone)} />
    </>
  );
}
