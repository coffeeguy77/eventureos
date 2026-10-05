import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Coffee } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { findCoupon, loadProducts, loadSubs, shopOrg, subDelivery } from "@/lib/shop/server";
import { currentShopCustomer } from "@/lib/shop/auth";
import { ORDER_STATUS } from "@/lib/shop/core";
import { ShopFrame, serif } from "@/components/shop/frame";
import { ShopClosed } from "@/components/shop/bits";
import { SubManager } from "@/components/shop/sub-manager";
import { DetailsForm, ShopSignIn, SignOutButton } from "@/components/shop/account-forms";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account", robots: { index: false, follow: false } };

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n));

export default async function Account({ params }: { params: Promise<{ org: string }> }) {
  const org = await shopOrg((await params).org);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const me = await currentShopCustomer(org);
  if (!me) return (
    <ShopFrame org={org}>
      <div className={`${PAGE} grid max-w-5xl gap-10 py-14 md:grid-cols-2`}>
        <div>
          <h1 className={`${serif} text-[2.5rem] font-semibold leading-tight`}>Your coffee account</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5b5955]">See your orders and manage your subscription — pause, skip, swap coffee, change your grind, add a second address — whenever you like.</p>
          <p className="mt-4 text-[0.9688rem] text-[#5b5955]">Trained with us? Signing in to your <Link href={`/book/${org.slug}/account`} className="font-semibold underline">barista account</Link> signs you in here too.</p>
        </div>
        <ShopSignIn slug={org.slug} />
      </div>
    </ShopFrame>
  );
  const subs = await loadSubs(db, org.id, { customerId: me.id });
  const { data: orders } = await db.from("shop_orders").select("number, status, total, gift_amount, created_at, view_token, kind, items").eq("customer_id", me.id).neq("status", "pending").order("created_at", { ascending: false }).limit(30);
  const live = subs.filter((s) => s.status !== "cancelled");
  const ended = subs.filter((s) => s.status === "cancelled");
  const priceOf = async (s: (typeof subs)[number]) => subDelivery(s, products, org.shop, s.coupon_code ? await findCoupon(db, org.id, s.coupon_code) : null).total;
  const prices = await Promise.all(subs.map(priceOf));
  const priceById = new Map(subs.map((s, i) => [s.id, prices[i]]));

  return (
    <ShopFrame org={org}>
      <div className={`${PAGE} py-10 sm:py-14`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[0.9375rem] text-[#6b655f]">{me.email}</p><h1 className={`${serif} text-[2.25rem] font-semibold sm:text-[2.75rem]`}>Hi{me.name ? ` ${me.name.split(/\s+/)[0]}` : ""}</h1></div>
          <SignOutButton slug={org.slug} />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <h2 className="text-[1.375rem] font-semibold">Subscriptions</h2>
            {live.length === 0 && (
              <div className="rounded-[26px] bg-[#1d1915] p-7 text-[#FFFDFC]">
                <Coffee className="h-8 w-8 text-[var(--b)]" />
                <p className={`${serif} mt-3 text-[1.75rem] font-semibold`}>Never run out of coffee</p>
                <p className="mt-2 text-white/80">{org.shop.subDiscount > 0 ? `Subscribers save ${org.shop.subDiscount}% on every bag. ` : ""}Pause, skip or change anything, any time.</p>
                <Link href={`/shop/${org.slug}/subscriptions`} className="shop-btn mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--b)] px-5 font-semibold text-[var(--on-b)]">Start a subscription<ArrowRight className="h-4 w-4" /></Link>
              </div>
            )}
            {live.map((s) => <SubManager key={s.id} slug={org.slug} sub={s} products={products} s={org.shop} perDelivery={priceById.get(s.id) ?? 0} cardLabel={me.card_label} />)}
            {ended.length > 0 && (
              <details className="rounded-2xl bg-white p-4 ring-1 ring-[#EAE1D7]"><summary className="cursor-pointer font-semibold">Past subscriptions ({ended.length})</summary>
                <div className="mt-4 space-y-4">{ended.map((s) => <SubManager key={s.id} slug={org.slug} sub={s} products={products} s={org.shop} perDelivery={priceById.get(s.id) ?? 0} cardLabel={me.card_label} />)}</div></details>
            )}
          </div>
          <aside className="space-y-6">
            <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7]">
              <h2 className="text-[1.125rem] font-semibold">Orders</h2>
              {!orders?.length ? <p className="mt-2 text-[0.9375rem] text-[#6b655f]">No orders yet.</p> : (
                <ul className="mt-3 divide-y divide-[#EFE7DE]">
                  {orders.map((o) => (
                    <li key={o.view_token as string}><Link href={`/shop/${org.slug}/order/${o.view_token}`} className="flex items-center justify-between gap-3 py-3 hover:opacity-80">
                      <span><span className="block font-semibold">#{o.number}</span><span className="block text-[0.8125rem] text-[#6b655f]">{new Date(o.created_at as string).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · {ORDER_STATUS[o.status as string] ?? o.status}</span></span>
                      <span className="text-[0.9375rem] font-medium">{o.kind === "prepaid" && Number(o.total) === 0 ? "Prepaid" : money(Number(o.total) - Number(o.gift_amount))}</span>
                    </Link></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7]">
              <h2 className="mb-3 text-[1.125rem] font-semibold">Your details</h2>
              <DetailsForm slug={org.slug} name={me.name ?? ""} phone={me.phone ?? ""} marketing={me.marketing_ok} />
            </section>
          </aside>
        </div>
      </div>
    </ShopFrame>
  );
}
