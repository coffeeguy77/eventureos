import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { giftCardByToken, settleFromReturn, shopOrg } from "@/lib/shop/server";
import { ShopFrame } from "@/components/shop/frame";
import { GiftCard } from "@/components/gifts/gift-card";
import { AutoRefresh } from "@/components/book/auto-refresh";
import { PrintButton } from "@/components/book/print-button";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coffee gift card", robots: { index: false, follow: false } };
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n)).replace(/\.00$/, "");

export default async function GiftCardView({ params, searchParams }: { params: Promise<{ org: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { org: slug, token } = await params;
  const sp = await searchParams;
  const org = await shopOrg(slug);
  let g = org ? await giftCardByToken(token) : null;
  if (!org || !g || g.organisation_id !== org.id) notFound();
  if (sp.paid === "1" && g.status === "pending" && g.order_id) {
    const { data: o } = await createServiceClient().from("shop_orders").select("stripe_session_id").eq("id", g.order_id).single();
    await settleFromReturn(org.id, g.order_id, (o?.stripe_session_id as string) ?? null);
    g = (await giftCardByToken(token))!;
  }
  const expires = g.expires_on ? new Date(`${g.expires_on}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <ShopFrame org={org}>
      <div className={`${PAGE} max-w-3xl py-10 sm:py-14`}>
        {g.status === "pending" ? (
          <div className="py-10 text-center">{sp.paid === "1" && <AutoRefresh />}<Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--b)]" /><h1 className="mt-3 text-[1.5rem] font-bold">{sp.paid === "1" ? "Confirming your payment…" : "Waiting for payment"}</h1></div>
        ) : (
          <>
            {sp.paid === "1" && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-center font-medium text-emerald-800 print:hidden">Thank you! The gift card is on its way to your inbox.</p>}
            <GiftCard label="See your message" front={{ art: org.shop.giftCardArt, words: { eyebrow: "A gift for you", title: "Fresh coffee", subtitle: "Gift card", tagline: org.shop.giftTagline } }}
              back={{ to: g.recipient_name, from: g.purchaser_name, message: g.message, value: money(g.amount), valueNote: "to spend on coffee", code: g.code, expires, business: org.name, art: org.shop.giftCardArt, redeem: "Enter the code at checkout on our online shop." }} />
            {g.status === "redeemed" ? <p className="mt-3 text-center font-semibold text-[#6b655f]">Used — enjoy your coffee!</p> : Number(g.balance) < Number(g.amount) ? <p className="mt-3 text-center font-semibold">{money(g.balance)} left to spend</p> : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2 print:hidden">
              <PrintButton />
              {g.status === "active" && <Link href={`/shop/${org.slug}`} className="inline-flex h-12 items-center rounded-xl bg-[var(--b)] px-5 font-semibold text-[var(--on-b)]">Spend it on coffee</Link>}
            </div>
          </>
        )}
      </div>
    </ShopFrame>
  );
}
