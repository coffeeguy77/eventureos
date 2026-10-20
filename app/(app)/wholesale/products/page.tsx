import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { ProductsEditor, type ProductRow } from "@/components/wholesale/products-editor";
import { CategoriesEditor, PriceGroupsEditor } from "@/components/wholesale/lists-editor";
import { mergeNames, readWholesale } from "@/lib/wholesale/settings";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [{ k: "products", label: "Products" }, { k: "categories", label: "Categories" }, { k: "groups", label: "Price groups" }] as const;

export default async function WholesaleProductsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.k === sp.view)?.k ?? "products";
  const { supabase, org, role } = await requireOrg();
  const ws = readWholesale(org.settings);
  const [{ data: ps }, { data: gp }, { data: cs }] = await Promise.all([
    supabase.from("wholesale_products").select("id, sku, name, description, category, unit_price, tax_rate, weight_kg, min_qty, active, position").eq("organisation_id", org.id).order("active", { ascending: false }).order("category").order("position"),
    supabase.from("wholesale_group_prices").select("product_id, price_group, unit_price").eq("organisation_id", org.id),
    supabase.from("wholesale_customers").select("price_group").eq("organisation_id", org.id).not("price_group", "is", null),
  ]);
  const groupRows = (gp ?? []) as { product_id: string; price_group: string; unit_price: number }[];
  const customerGroups = ((cs ?? []) as { price_group: string | null }[]).map((c) => c.price_group);
  const groups = mergeNames(ws.priceGroups, groupRows.map((g) => g.price_group), customerGroups);
  const rows: ProductRow[] = ((ps ?? []) as { id: string; sku: string | null; name: string; description: string | null; category: string | null; unit_price: number; tax_rate: number; weight_kg: number | null; min_qty: number; active: boolean }[]).map((p) => ({
    ...p, unit_price: Number(p.unit_price), tax_rate: Number(p.tax_rate), weight_kg: p.weight_kg == null ? null : Number(p.weight_kg),
    groupPrices: Object.fromEntries(groupRows.filter((g) => g.product_id === p.id).map((g) => [g.price_group, Number(g.unit_price)])),
  }));
  const categories = mergeNames(ws.categories, rows.map((r) => r.category));
  const edit = canManage(role);

  let body: React.ReactNode;
  if (view === "categories") {
    body = <CategoriesEditor canEdit={edit} rows={categories.map((name) => ({ name, products: rows.filter((r) => (r.category ?? "").toLowerCase() === name.toLowerCase()).length }))} />;
  } else if (view === "groups") {
    body = <PriceGroupsEditor canEdit={edit} currency={org.currency}
      rows={groups.map((name) => ({ name, customers: customerGroups.filter((g) => g === name).length, prices: groupRows.filter((g) => g.price_group === name).length }))}
      products={rows.map((r) => ({ id: r.id, name: r.name, category: r.category ?? null, unit_price: r.unit_price, active: r.active, groupPrices: r.groupPrices }))} />;
  } else {
    body = (
      <>
        <p className="mb-4 max-w-2xl text-[0.8125rem] text-ink-muted">What wholesale customers can order, at prices before GST. A customer in a price group pays that group&apos;s price where one is set. Weights add up the kilos to roast on the run sheet and set how many box labels an order needs.</p>
        {rows.length === 0 && !edit ? <Card><EmptyState title="No products yet" /></Card> : <ProductsEditor rows={rows} groups={groups} categories={categories} canEdit={edit} />}
      </>
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link key={v.k} href={v.k === "products" ? "/wholesale/products" : `/wholesale/products?view=${v.k}`}
            className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", v.k === view ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}</Link>
        ))}
      </div>
      {body}
    </div>
  );
}
