import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { findCoupon, loadProducts, loadSubs, shopOrgById, subDelivery } from "@/lib/shop/server";
import { ORDER_STATUS } from "@/lib/shop/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { OfficeSub } from "@/components/store/office-sub";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SubDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const db = createServiceClient();
  const shop = await shopOrgById(db, org.id);
  const [sub] = await loadSubs(db, org.id, { ids: [id] });
  if (!sub) notFound();
  const products = (await loadProducts(db, org.id, { all: true })) ?? [];
  const { data: c } = await db.from("shop_customers").select("id, name, email, phone, card_label").eq("id", sub.customer_id).single();
  const { data: orders } = await db.from("shop_orders").select("id, number, status, total, dispatch_on, created_at").eq("subscription_id", id).order("created_at", { ascending: false }).limit(40);
  const per = subDelivery(sub, products, shop.shop, sub.coupon_code ? await findCoupon(db, org.id, sub.coupon_code) : null).total;
  return (
    <>
      <PageHeader eyebrow={<Link href="/store/subscriptions" className="hover:underline">← Subscriptions</Link>} title={c?.name ?? c?.email ?? "Subscription"}
        subtitle={<>{c?.email}{c?.phone ? ` · ${c.phone}` : ""} · started {new Date(sub.created_at).toLocaleDateString("en-AU")} · {sub.deliveries_made} deliveries{sub.woo_id ? ` · WooCommerce #${sub.woo_id}` : ""}</>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="shop" style={{ ["--b" as string]: org.brand_colour ?? "#6028EC", ["--on-b" as string]: "#fff" }}>
          <OfficeSub slug={org.slug} sub={sub} products={products} s={shop.shop} perDelivery={per} cardLabel={(c?.card_label as string) ?? null} />
        </div>
        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Deliveries</h2>
          {!orders?.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">None yet.</p> : (
            <ul className="mt-2 divide-y divide-line text-[0.8125rem]">
              {orders.map((o) => <li key={o.id}><Link href={`/store/orders/${o.id}`} className="flex justify-between py-2 hover:underline"><span>#{o.number} · {o.dispatch_on ?? new Date(o.created_at as string).toLocaleDateString("en-AU")}</span><span className="text-ink-muted">{ORDER_STATUS[o.status as string] ?? o.status} · {money(o.total, org.currency, { cents: true })}</span></Link></li>)}
            </ul>
          )}
          {c && <Link href={`/store/customers/${c.id}`} className="mt-3 inline-block text-[0.8125rem] font-medium text-ink underline">Customer details</Link>}
        </Card>
      </div>
    </>
  );
}
