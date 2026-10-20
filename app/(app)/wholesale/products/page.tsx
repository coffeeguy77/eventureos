import { canManage, requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { ProductsEditor, type ProductRow } from "@/components/wholesale/products-editor";

export const dynamic = "force-dynamic";

export default async function WholesaleProductsPage() {
  const { supabase, org, role } = await requireOrg();
  const [{ data: ps }, { data: gp }] = await Promise.all([
    supabase.from("wholesale_products").select("id, sku, name, description, category, unit_price, tax_rate, weight_kg, min_qty, active, position").eq("organisation_id", org.id).order("active", { ascending: false }).order("category").order("position"),
    supabase.from("wholesale_group_prices").select("product_id, price_group, unit_price").eq("organisation_id", org.id),
  ]);
  const groupRows = (gp ?? []) as { product_id: string; price_group: string; unit_price: number }[];
  const groups = [...new Set(groupRows.map((g) => g.price_group))].sort();
  const rows: ProductRow[] = ((ps ?? []) as { id: string; sku: string | null; name: string; description: string | null; category: string | null; unit_price: number; tax_rate: number; weight_kg: number | null; min_qty: number; active: boolean }[]).map((p) => ({
    ...p, unit_price: Number(p.unit_price), tax_rate: Number(p.tax_rate), weight_kg: p.weight_kg == null ? null : Number(p.weight_kg),
    groupPrices: Object.fromEntries(groupRows.filter((g) => g.product_id === p.id).map((g) => [g.price_group, Number(g.unit_price)])),
  }));
  return (
    <div>
      <p className="mb-4 max-w-2xl text-[0.8125rem] text-ink-muted">What wholesale customers can order, at prices before GST. A customer in a price group pays that group&apos;s price where one is set. Weights add up the kilos to roast on the run sheet.</p>
      {rows.length === 0 && !canManage(role) ? <Card><EmptyState title="No products yet" /></Card> : <ProductsEditor rows={rows} groups={groups} canEdit={canManage(role)} />}
    </div>
  );
}
