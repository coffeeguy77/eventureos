import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadProducts } from "@/lib/shop/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { org } = await requireOrg();
  const products = (await loadProducts(createServiceClient(), org.id, { all: true })) ?? [];
  return (
    <>
      <PageHeader title="Products" subtitle="Coffee and anything else you sell in the shop. Archived products stay on old orders." actions={<ButtonLink href="/store/products/new" variant="primary">New product</ButtonLink>} />
      {products.length === 0 ? <Card><EmptyState title="No products yet">Add your coffees, or import them from WooCommerce.</EmptyState></Card> : (
        <Card className="divide-y divide-line overflow-hidden">
          {products.map((p) => (
            <Link key={p.id} href={`/store/products/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-50">{p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-contain p-1" />}</div>
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{p.name}</p><p className="truncate text-[0.75rem] text-ink-muted">{p.variants.filter((v) => v.active).map((v) => `${v.label} ${money(v.price, org.currency)}`).join(" · ")}</p></div>
              {p.subscribable && <Badge tone="brand">Subscribable</Badge>}
              <Badge tone={p.status === "active" ? "green" : p.status === "draft" ? "amber" : "slate"}>{p.status === "active" ? "On sale" : p.status === "draft" ? "Hidden" : "Archived"}</Badge>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
