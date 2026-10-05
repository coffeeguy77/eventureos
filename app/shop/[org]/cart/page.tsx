import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadProducts, shopOrg, todayIn } from "@/lib/shop/server";
import { currentShopCustomer } from "@/lib/shop/auth";
import { ShopFrame, serif } from "@/components/shop/frame";
import { ShopClosed } from "@/components/shop/bits";
import { Checkout, type Me } from "@/components/shop/checkout";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cart", robots: { index: false, follow: false } };

export default async function CartPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const org = await shopOrg(slug);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const c = await currentShopCustomer(org);
  let me: Me | null = null;
  if (c) {
    const { data: addresses } = await db.from("shop_addresses").select("id, label, name, company, line1, line2, suburb, state, postcode, phone, instructions").eq("customer_id", c.id).order("created_at");
    me = { name: c.name, email: c.email, phone: c.phone, addresses: (addresses ?? []) as Me["addresses"] };
  }
  return (
    <ShopFrame org={org}>
      <div className={`${PAGE} py-8 sm:py-12`}>
        <h1 className={`${serif} text-[2.25rem] font-semibold sm:text-[2.75rem]`}>Cart &amp; checkout</h1>
        {sp.cancelled === "1" && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[0.9375rem] text-amber-900">Payment wasn&apos;t finished — your cart is still here.</p>}
        <div className="mt-6"><Checkout slug={org.slug} products={products} s={org.shop} today={todayIn(org.timezone)} me={me} /></div>
      </div>
    </ShopFrame>
  );
}
