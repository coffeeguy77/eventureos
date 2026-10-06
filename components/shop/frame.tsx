import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { brandStyle, PAGE } from "@/components/book/shell";
import type { Banner, ShopOrg } from "@/lib/shop/server";
import { CartButton } from "./cart-button";
import { MasterNav } from "@/components/site/master-nav";
import { readSiteNav } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";

export const serif = "shop-serif";
export const hand = "shop-hand";

/** Light, warm palette shared by the shop pages */
export const INK = "#151312";
export const MUTED = "#5E5853";
export const LINE = "#EDE3DB";

const CSS = `
.shop .shop-serif{font-family:'Playfair Display',Georgia,'Times New Roman',serif;letter-spacing:-0.012em}
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
export const btn = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--b)] px-7 text-[1rem] font-semibold text-[var(--on-b)] shadow-[0_14px_28px_-14px_var(--b)] hover:brightness-105";
export const btnOutline = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[#151312] bg-white/60 px-7 text-[1rem] font-semibold text-[#151312] hover:bg-white";
export const eyebrow = "text-[0.8125rem] font-semibold uppercase tracking-[0.2em] text-[var(--b)]";

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
  const learn = [
    org.settings.enabled ? { href: `/${org.slug}`, label: labels.lessons } : null,
    readJobSettings(org.rawSettings, org.name).enabled ? { href: `/jobs/${org.slug}`, label: labels.jobs } : null,
    org.settings.enabled && org.stripeReady ? { href: `/book/${org.slug}/gift`, label: labels.gifts } : null,
  ].filter((x): x is { href: string; label: string } => !!x);
  const social = org.settings.social;
  const site = org.website && /^https?:\/\//.test(org.website) ? org.website : null;
  const strip = topBanners[0];
  const link = "block text-[0.875rem] text-[#5E5853] transition hover:text-[#151312]";
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FFFBF8] text-[#151312]">
      <style>{CSS}</style>
      <MasterNav org={org} active="shop" />
      {strip && (
        <div className="bg-[color-mix(in_srgb,var(--b)_14%,#FFF6F4)] text-[#151312]">
          <div className={`${PAGE} flex min-h-10 items-center justify-center gap-3 py-2 text-center text-[0.875rem]`}>
            <span><span className="font-semibold">{strip.title}</span>{strip.body ? <span className="text-[#5E5853]"> — {strip.body}</span> : null}</span>
            {strip.href && <Link href={strip.href} className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--b)] hover:underline">{strip.cta_label || "Shop now"}<ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-[#EDE3DB] bg-[#FFFBF8]/92 backdrop-blur-md">
        <div className={`${PAGE} flex h-[68px] items-center gap-4`}>
          <Link href={base} className="flex min-w-0 shrink-0 items-center gap-3">
            <span className={`${serif} truncate text-[1.1875rem] font-bold`}>{labels.shop}</span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1.5 md:flex" aria-label="Shop">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[0.9375rem] font-medium transition ${active === n.key ? "bg-[#151312] text-white" : "text-[#3F3A36] hover:bg-[#F4ECE6] hover:text-[#151312]"}`}>{n.label}</Link>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />
          <Link href={`${base}/account`} aria-label="My account" className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-[#F4ECE6]"><UserRound className="h-5 w-5" /></Link>
          <CartButton slug={org.slug} />
          {cta && <Link href={cta.href} className="shop-btn ml-1 hidden h-11 items-center rounded-full bg-[var(--b)] px-6 text-[0.9375rem] font-semibold text-[var(--on-b)] shadow-[0_10px_22px_-12px_var(--b)] sm:inline-flex">{cta.label}</Link>}
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Shop sections">
          {nav.map((n) => (
            <Link key={n.key} href={n.href} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium ${active === n.key ? "bg-[#151312] text-white" : "text-[#3F3A36]"}`}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[#EDE3DB] bg-[#FFFBF8]">
        <div className={`${PAGE} grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_1.1fr_auto] lg:gap-0 lg:divide-x lg:divide-[#EDE3DB]`}>
          <div className="lg:pr-10">
            <p className={`${serif} text-[1.5rem] font-bold`}>{org.name}</p>
            {(org.shop.roastedIn || org.shop.roastNote) && (
              <p className="mt-3 max-w-sm text-[0.875rem] leading-relaxed text-[#5E5853]">
                {org.shop.roastedIn && <>Locally roasted in {org.shop.roastedIn}.<br /></>}{org.shop.roastNote}
              </p>
            )}
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Shop</p>
            {nav.map((n) => <Link key={n.key} href={n.href} className={link}>{n.label}</Link>)}
            <Link href={`${base}/account`} className={link}>My account</Link>
          </div>
          {learn.length > 0 && (
            <div className="space-y-1.5 lg:px-8">
              <p className="mb-2.5 text-[0.875rem] font-semibold">Learn &amp; more</p>
              {learn.map((n) => <Link key={n.href} href={n.href} className={link}>{n.label}</Link>)}
            </div>
          )}
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Contact</p>
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className={link}>{org.contact_phone}</a>}
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
            {site && <a href={site} className={link}>{site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
            {org.address && <p className="text-[0.875rem] leading-relaxed text-[#5E5853]">{org.address}</p>}
          </div>
          {(social.instagram || social.facebook) && (
            <div className="flex gap-3 lg:pl-8">
              {social.instagram && <a href={social.instagram} aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg></a>}
              {social.facebook && <a href={social.facebook} aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z" /></svg></a>}
            </div>
          )}
        </div>
        <p className={`${PAGE} border-t border-[#EDE3DB] py-5 text-[0.8125rem] text-[#8C847D]`}>Secure checkout by Stripe · Shop by EventureOS</p>
      </footer>
    </div>
  );
}
