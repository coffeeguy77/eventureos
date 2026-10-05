import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadProducts } from "@/lib/shop/server";
import { DEFAULT_GRINDS } from "@/lib/shop/core";
import { PageHeader } from "@/components/ui/page-header";
import { ProductEditor } from "@/components/store/product-editor";
import type { ProductInput } from "@/app/(app)/store/actions";

export const dynamic = "force-dynamic";

export default async function ProductEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrg();
  let initial: ProductInput = { id: null, name: "", slug: "", kind: "coffee", category: "", short: "", description: "", tasting_notes: "", origin: "", roast: "", best_for: "", image_url: "", grinds: DEFAULT_GRINDS, subscribable: true, featured: false, status: "draft", position: 0, variants: [{ id: null, label: "250g", price: 0, active: true }, { id: null, label: "1kg", price: 0, active: true }] };
  if (id !== "new") {
    const p = (await loadProducts(createServiceClient(), org.id, { all: true }))?.find((x) => x.id === id);
    if (!p) notFound();
    initial = { id: p.id, name: p.name, slug: p.slug, kind: p.kind === "gift_card" ? "other" : p.kind, category: p.category ?? "", short: p.short ?? "", description: p.description ?? "", tasting_notes: p.tasting_notes ?? "", origin: p.origin ?? "", roast: p.roast ?? "", best_for: p.best_for ?? "", image_url: p.image_url ?? "", grinds: p.grinds, subscribable: p.subscribable, featured: p.featured, status: p.status as ProductInput["status"], position: p.position, variants: p.variants.map((v) => ({ id: v.id, label: v.label, price: v.price, active: v.active })) };
  }
  return (
    <>
      <PageHeader eyebrow={<Link href="/store/products" className="hover:underline">← Products</Link>} title={initial.id ? initial.name : "New product"} />
      <ProductEditor orgId={org.id} initial={initial} defaultGrinds={DEFAULT_GRINDS} />
    </>
  );
}
