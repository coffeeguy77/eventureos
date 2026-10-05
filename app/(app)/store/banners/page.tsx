import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { BannerForm, BannerRow } from "@/components/store/promo-tools";
import type { BannerInput } from "@/app/(app)/store/actions";

export const dynamic = "force-dynamic";
const WHERE: Record<string, string> = { shop: "Shop front page", top: "Strip on every shop page", course: "Barista course page", everywhere: "Everywhere" };

export default async function BannersPage() {
  const { supabase, org } = await requireOrg();
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("shop_banners").select("*, product:shop_products(name)").eq("organisation_id", org.id).order("position").order("created_at", { ascending: false }),
    supabase.from("shop_products").select("id, name").eq("organisation_id", org.id).eq("status", "active").order("position"),
  ]);
  const ps = (products ?? []) as { id: string; name: string }[];
  return (
    <>
      <PageHeader title="Banners" subtitle="Promote a coffee or an offer. Banners can link straight to a product and show a coupon code." />
      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <div>{!data?.length ? <Card><EmptyState title="No banners yet">Create one on the right.</EmptyState></Card> : (
          <Card className="divide-y divide-line overflow-hidden">{data.map((b) => <BannerRow key={b.id} orgId={org.id} products={ps}
            label={[WHERE[b.placement], b.product?.name ? `→ ${b.product.name}` : b.link_url, b.coupon_code, b.ends_on ? `until ${b.ends_on}` : null].filter(Boolean).join(" · ")}
            b={{ id: b.id, title: b.title, body: b.body ?? "", cta_label: b.cta_label ?? "", product_id: b.product_id, link_url: b.link_url ?? "", coupon_code: b.coupon_code ?? "", image_url: b.image_url ?? "", tone: b.tone, placement: b.placement, starts_on: b.starts_on, ends_on: b.ends_on, active: b.active, position: b.position } as BannerInput} />)}</Card>
        )}</div>
        <BannerForm orgId={org.id} products={ps} />
      </div>
    </>
  );
}
