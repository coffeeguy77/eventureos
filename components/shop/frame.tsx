import "@fontsource-variable/fraunces";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { brandStyle, PAGE } from "@/components/book/shell";
import type { Banner, ShopOrg } from "@/lib/shop/server";
import { CartButton } from "./cart-button";
import { MasterNav } from "@/components/site/master-nav";
import { readSiteNav } from "@/lib/site-nav";

export const serif = "shop-serif";
export const hand = "shop-hand";

const CSS = `
.shop .shop-serif{font-family:'Fraunces Variable',Georgia,'Times New Roman',serif;font-optical-sizing:auto;font-variation-settings:'SOFT' 50}
.shop .shop-hand{font-family:'Caveat',cursive;font-weight:600}
.shop .shop-btn{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease,color .2s ease,filter .2s}
.shop .shop-btn:hover{transform:translateY(-1px)}
.shop .shop-card{transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s ease}
.shop .shop-card:hover{transform:translateY(-4px);box-shadow:0 28px 50px -30px rgba(60,40,25,.5)}
.shop .shop-card:hover .shop-zoom{transform:scale(1.04)}
.shop .shop-zoom{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
@media (prefers-reduced-motion:reduce){.shop *{transition:none!important;animation:none!important}}
`;

/** The frame around every shop page: promo strip, header with cart, footer with the roast schedule. */
export function ShopFrame({ org, children, active, topBanners = [], dark = false }: { org: ShopOrg; children: React.ReactNode; active?: string; topBanners?: Banner[]; dark?: boolean }) {
  const base = `/shop/${org.slug}`;
  const nav = [
    { href: base, label: "Coffee", key: "shop" },
    { href: `${base}/subscriptions`, label: "Subscriptions", key: "subs" },
    { href: `${base}/grind`, label: "Grind guide", key: "grind" },
    { href: `${base}/gift-card`, label: "Gift cards", key: "gift" },
  ];
  const strip = topBanners[0];
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FAF7F3] text-[#171714]">
      <style>{CSS}</style>
      <MasterNav org={org} active="shop" />
      {strip && (
        <div className="bg-[#171411] text-[#F7F1EA]">
          <div className={`${PAGE} flex min-h-10 items-center justify-center gap-3 py-2 text-center text-[0.875rem]`}>
            <span><span className="font-semibold">{strip.title}</span>{strip.body ? <span className="text-[#F7F1EA]/75"> — {strip.body}</span> : null}</span>
            {strip.href && <Link href={strip.href} className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--b)] hover:underline">{strip.cta_label || "Shop now"}<ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
        </div>
      )}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${dark ? "border-white/10 bg-[#171411]/90 text-[#F7F1EA]" : "border-[#EAE1D7] bg-[#FAF7F3]/90"}`}>
        <div className={`${PAGE} flex h-[68px] items-center gap-4`}>
          <Link href={base} className="flex min-w-0 shrink-0 items-center gap-3">
            <span className={`${serif} truncate text-[1.25rem] font-semibold`}>{readSiteNav(org.rawSettings).shop}</span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Shop">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[0.9375rem] font-medium transition ${active === n.key ? (dark ? "bg-white/10 text-white" : "bg-[#171714] text-[#FAF7F3]") : dark ? "text-white/75 hover:text-white" : "text-[#4a4743] hover:bg-[#EFE7DE] hover:text-[#171714]"}`}>{n.label}</Link>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />
          <Link href={`${base}/account`} aria-label="My account" className={`grid h-11 w-11 place-items-center rounded-full transition ${dark ? "hover:bg-white/10" : "hover:bg-[#EFE7DE]"}`}><UserRound className="h-5 w-5" /></Link>
          <CartButton slug={org.slug} dark={dark} />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Shop sections">
          {nav.map((n) => (
            <Link key={n.key} href={n.href} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium ${active === n.key ? (dark ? "bg-white/15 text-white" : "bg-[#171714] text-[#FAF7F3]") : dark ? "text-white/75" : "text-[#4a4743]"}`}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="bg-[#171411] text-[#CFC6BC]">
        <div className={`${PAGE} grid gap-8 py-12 md:grid-cols-[1.4fr_1fr_1fr]`}>
          <div>
            <p className={`${serif} text-[1.5rem] font-semibold text-[#F7F1EA]`}>{org.name}</p>
            {org.shop.roastNote && <p className="mt-3 max-w-md text-[0.9688rem] leading-relaxed">{org.shop.roastNote}</p>}
          </div>
          <div className="space-y-2 text-[0.9375rem]">
            <p className="font-semibold text-[#F7F1EA]">Shop</p>
            {nav.map((n) => <Link key={n.key} href={n.href} className="block hover:text-white">{n.label}</Link>)}
            <Link href={`${base}/account`} className="block hover:text-white">My account</Link>
          </div>
          <div className="space-y-2 text-[0.9375rem]">
            <p className="font-semibold text-[#F7F1EA]">Contact</p>
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className="block hover:text-white">{org.contact_phone}</a>}
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className="block hover:text-white">{org.contact_email}</a>}
            {org.website && /^https?:\/\//.test(org.website) && <a href={org.website} className="block hover:text-white">{org.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
            <Link href={`/book/${org.slug}`} className="block hover:text-white">Barista courses</Link>
          </div>
        </div>
        <p className={`${PAGE} border-t border-white/10 py-5 text-[0.8125rem] text-[#8f877f]`}>Secure checkout by Stripe · Shop by EventureOS</p>
      </footer>
    </div>
  );
}
