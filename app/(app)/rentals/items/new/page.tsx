import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { ItemForm } from "@/components/rentals/item-form";
import { readHireSettings } from "@/lib/hire/core";
import { loadItems, productPagesReady } from "@/lib/hire/server";

export const metadata = { title: "New hire item" };

export default async function NewHireItemPage() {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) redirect("/rentals/items");
  const s = readHireSettings(org.settings);
  const items = await loadItems(supabase, org.id, { activeOnly: true });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New hire item" />
      <ItemForm id={null} orgId={org.id} pagesReady={await productPagesReady(supabase)} canEdit units={s.units} brands={s.brands} others={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind }))} categories={[...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort()}
        initial={{ brand: s.brands[0]?.key ?? null, name: "", code: null, kind: "hire", category: null, subcategory: null, quantity: 1, out_of_service: 0, rates: [], bond: 0, buffer_hours: null, companions: [], package_lines: [], active: true }} />
    </div>
  );
}
