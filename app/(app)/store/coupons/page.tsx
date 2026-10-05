import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { CouponForm, CouponRow } from "@/components/store/promo-tools";
import type { CouponInput } from "@/app/(app)/store/actions";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const { supabase, org } = await requireOrg();
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("shop_coupons").select("*").eq("organisation_id", org.id).order("created_at", { ascending: false }),
    supabase.from("shop_products").select("id, name").eq("organisation_id", org.id).neq("status", "archived").order("position"),
  ]);
  const ps = (products ?? []) as { id: string; name: string }[];
  const label = (c: Record<string, unknown>) => [c.kind === "percent" ? `${Number(c.value)}% off` : c.kind === "fixed" ? `$${Number(c.value)} off` : "Free shipping",
    c.applies_to === "subscription" ? `subscriptions${c.subscription_cycles ? ` (first ${c.subscription_cycles} deliveries)` : ""}` : c.applies_to === "one_off" ? "one-off orders" : null,
    c.min_spend ? `min $${Number(c.min_spend)}` : null, c.first_order_only ? "first order" : null, c.ends_on ? `until ${c.ends_on}` : null, c.woo_id ? "from WooCommerce" : null].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader title="Coupons" subtitle="Special-offer codes. Show one on a banner, share it on socials, or link to the shop with ?code=YOURCODE to apply it automatically." />
      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <div>{!data?.length ? <Card><EmptyState title="No coupons yet">Create one on the right.</EmptyState></Card> : (
          <Card className="divide-y divide-line overflow-hidden">{data.map((c) => <CouponRow key={c.id} products={ps} uses={c.uses as number} label={label(c)}
            c={{ id: c.id, code: c.code, description: c.description ?? "", kind: c.kind, value: Number(c.value), applies_to: c.applies_to, product_ids: c.product_ids ?? [], min_spend: c.min_spend === null ? null : Number(c.min_spend), first_order_only: c.first_order_only, subscription_cycles: c.subscription_cycles, max_uses: c.max_uses, per_customer: c.per_customer, starts_on: c.starts_on, ends_on: c.ends_on, active: c.active } as CouponInput} />)}</Card>
        )}</div>
        <CouponForm products={ps} />
      </div>
    </>
  );
}
