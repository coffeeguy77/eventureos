import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg, todayIn } from "@/lib/shop/server";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { ShopClosed } from "@/components/shop/bits";
import { ShopGiftForm } from "@/components/shop/gift-card-form";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  return org ? { title: { absolute: `Coffee gift cards — ${org.name}` }, description: `Give freshly roasted coffee from ${org.name}. Emailed instantly or on the day you choose, with your message on the back.` } : {};
}

export default async function GiftCardPage({ params, searchParams }: P) {
  const org = await shopOrg((await params).org);
  const code = (await searchParams)?.code;
  const promo = typeof code === "string" ? code.slice(0, 40) : null;
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const top = await activeBanners(db, org, ["top"]);
  const m = org.shop.giftExpiryMonths;
  return (
    <ShopFrame org={org} active="gift" topBanners={top}>
      <div className={`${PAGE} py-10 sm:py-14`}>
        <p className={`${hand} text-[1.75rem] leading-none text-[var(--b)]`}>For the coffee lover</p>
        <h1 className={`${serif} mt-2 text-[2.5rem] font-semibold leading-tight sm:text-[3.25rem]`}>Coffee gift cards</h1>
        <p className="mt-3 max-w-2xl text-[1.0625rem] text-[#5b5955]">Your message is printed on the back. They spend it on any coffee — or a prepaid subscription.</p>
        <div className="mt-8">
          {org.stripeReady
            ? <ShopGiftForm slug={org.slug} amounts={org.shop.giftAmounts} minDate={todayIn(org.timezone)} art={org.shop.giftCardArt} tagline={org.shop.giftTagline} business={org.name} years={m % 12 === 0 ? m / 12 : null} redeem={`Enter the code at checkout on our online shop.`} promo={promo} />
            : <p className="rounded-2xl bg-white p-8 text-center text-[#5b5955]">Gift cards aren&apos;t available online right now.</p>}
        </div>
      </div>
    </ShopFrame>
  );
}
