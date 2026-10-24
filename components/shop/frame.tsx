import "@fontsource-variable/newsreader/opsz.css";
import { PublicFooter } from "@/components/site/public-footer";
import { PageBg } from "@/components/site/page-bg";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { brandStyle } from "@/components/book/shell";
import type { Banner, ShopOrg } from "@/lib/shop/server";
import { CartButton } from "./cart-button";
import { MasterNav } from "@/components/site/master-nav";
import { readSiteNav } from "@/lib/site-nav";

export const serif = "shop-serif";
export const hand = "shop-hand";

/** Light, warm palette shared by the shop pages */
export const INK = "#151312";
export const MUTED = "#5E5853";
export const LINE = "#EDE3DB";

export const SHOP_CSS = `
.shop{--pk:color-mix(in srgb,var(--b) 40%,#ff0a6c)}
.shop .shop-serif{font-family:'Newsreader Variable',Georgia,'Times New Roman',serif;font-optical-sizing:auto;letter-spacing:-0.018em}
.shop .shop-hand{font-family:'Caveat',cursive;font-weight:600}
.shop .shop-btn{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease,color .2s ease,filter .2s}
.shop .shop-btn:hover{transform:translateY(-1px)}
.shop .shop-card{transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s ease}
.shop .shop-card:hover{transform:translateY(-4px);box-shadow:0 28px 50px -30px rgba(80,45,40,.38)}
.shop .shop-card:hover .shop-zoom{transform:scale(1.04)}
.shop .shop-zoom{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
@media (prefers-reduced-motion:reduce){.shop *{transition:none!important;animation:none!important}}
`;

/** Primary (brand) and outline buttons used across the shop */
export const btn = "shop-btn inline-flex h-[60px] items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-9 text-[1.0625rem] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] hover:brightness-105";
export const btnOutline = "shop-btn inline-flex h-[60px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1F1B19] bg-white/70 px-9 text-[1rem] font-semibold text-[#1F1B19] hover:bg-white";
export const eyebrow = "text-[0.9375rem] font-medium uppercase tracking-[0.16em] text-[var(--pk)]";
/** The shop's page width (matches the design: 80px gutters at 1440) */
export const WRAP = "mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-10";

/** The frame around every shop page: site menu, promo strip, shop header with cart, footer with the roast schedule. */
export function ShopFrame({ org, children, active, topBanners = [], cta }: {
  org: ShopOrg; children: React.ReactNode; active?: string; topBanners?: Banner[];
  /** A button at the right of the shop header (e.g. "Subscribe" on the subscriptions page) */
  cta?: { href: string; label: string };
  /** @deprecated the shop is always light now */ dark?: boolean;
}) {
  const base = `/shop/${org.slug}`;
  const nav = [
    { href: base, label: "Coffee", key: "shop" },
    { href: `${base}/subscriptions`, label: "Subscriptions", key: "subs" },
    { href: `${base}/grind`, label: "Grind guide", key: "grind" },
    { href: `${base}/gift-card`, label: "Gift cards", key: "gift" },
  ];
  const labels = readSiteNav(org.rawSettings);
  const strip = topBanners[0];
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#FFFBF8" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="shop" tone="light" />
      {strip && (
        <div className="bg-[color-mix(in_srgb,var(--b)_14%,#FFF6F4)] text-[#151312]">
          <div className={`${WRAP} flex min-h-10 items-center justify-center gap-3 py-2 text-center text-[0.875rem]`}>
            <span><span className="font-semibold">{strip.title}</span>{strip.body ? <span className="text-[#5E5853]"> — {strip.body}</span> : null}</span>
            {strip.href && <Link href={strip.href} className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--b)] hover:underline">{strip.cta_label || "Shop now"}<ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-[#EEE6DF] bg-[#FCFAF7]/92 backdrop-blur-md">
        <div className={`${WRAP} flex h-[62px] items-center gap-4`}>
          <Link href={base} className="flex min-w-0 shrink-0 items-center gap-3 md:w-[180px]">
            <span className={`${serif} truncate text-[1.1875rem] font-semibold`}>{labels.shop}</span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1.5 md:flex" aria-label="Shop">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                className={`rounded-full px-[18px] py-[9px] text-[0.9375rem] font-medium transition ${active === n.key ? "bg-[#111] text-white" : "text-[#26211E] hover:bg-[#F2EAE4]"}`}>{n.label}</Link>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />
          <Link href={`${base}/account`} aria-label="My account" className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-[#F4ECE6]"><UserRound className="h-5 w-5" /></Link>
          <CartButton slug={org.slug} />
          {cta && <Link href={cta.href} className="shop-btn ml-1 hidden h-[46px] items-center rounded-full bg-[var(--pk)] px-8 text-[0.9375rem] font-semibold text-white shadow-[0_10px_22px_-12px_var(--pk)] sm:inline-flex">{cta.label}</Link>}
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Shop sections">
          {nav.map((n) => (
            <Link key={n.key} href={n.href} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium ${active === n.key ? "bg-[#151312] text-white" : "text-[#3F3A36]"}`}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <PublicFooter org={org} note="Secure checkout by Stripe" />
    </div>
  );
}
