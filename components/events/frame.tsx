import "@fontsource-variable/newsreader/opsz.css";
import { PageBg } from "@/components/site/page-bg";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { Coffee } from "lucide-react";
import { brandStyle } from "@/components/book/shell";
import { SHOP_CSS, WRAP, serif } from "@/components/shop/frame";
import { MasterNav } from "@/components/site/master-nav";
import type { PublicOrg } from "@/lib/bookings/server";
import { hirePageSlug, offered, type EventsSettings } from "@/lib/events/core";
import { readSiteNav } from "@/lib/site-nav";
import { readShop } from "@/lib/shop/core";

export { WRAP, serif };
export const btn = "shop-btn inline-flex h-[60px] items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-9 text-[1.0625rem] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] hover:brightness-105";
export const btnOutline = "shop-btn inline-flex h-[60px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1F1B19] bg-white/70 px-9 text-[1rem] font-semibold text-[#1F1B19] hover:bg-white";
export const eyebrow = "text-[0.875rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]";

export type EventsPage = "home" | "cart" | "van" | "drinks" | "branding" | "catering" | "quote";

export function eventsNav(org: Pick<PublicOrg, "slug">, s: EventsSettings) {
  const base = `/hire/${org.slug}`;
  const kinds = offered(s);
  return [
    { key: "home" as EventsPage, href: base, label: "Event hire" },
    ...(kinds.includes("cart") ? [{ key: "cart" as EventsPage, href: `${base}/${hirePageSlug("cart", s)}`, label: s.labels.cart.replace(/^coffee /i, "Coffee ") }] : []),
    ...(kinds.includes("van") ? [{ key: "van" as EventsPage, href: `${base}/${hirePageSlug("van", s)}`, label: s.labels.van }] : []),
    { key: "drinks" as EventsPage, href: `${base}/drinks`, label: "Drinks menu" },
    { key: "branding" as EventsPage, href: `${base}/branding`, label: "Branding" },
    { key: "catering" as EventsPage, href: `${base}/catering`, label: "Catering" },
  ];
}

/** The frame around every events page: site menu (with "Get a quote"), a slim events menu, dark footer. */
export function EventsFrame({ org, s, active, children }: { org: PublicOrg; s: EventsSettings; active: EventsPage; children: React.ReactNode }) {
  const base = `/hire/${org.slug}`;
  const nav = eventsNav(org, s);
  const labels = readSiteNav(org.rawSettings);
  const shop = readShop(org.rawSettings);
  const more = [
    org.settings.enabled ? { href: `/${org.slug}`, label: labels.lessons } : null,
    shop.enabled ? { href: `/shop/${org.slug}`, label: labels.shop } : null,
    org.settings.enabled && org.stripeReady ? { href: `/book/${org.slug}/gift`, label: labels.gifts } : null,
    { href: `/p/${org.slug}`, label: "Client sign-in" },
  ].filter((x): x is { href: string; label: string } => !!x);
  const social = org.settings.social;
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const link = "block text-[0.875rem] text-white/70 transition hover:text-white";
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#161213" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="events" tone="light" cta={{ href: `${base}/quote`, label: "Get a quote" }} />
      <header className="sticky top-0 z-40 border-b border-[#EEE6DF] bg-[#FCFAF7]/95 backdrop-blur-md">
        <div className={`${WRAP} flex h-[46px] items-center gap-3`}>
          <nav className="no-scrollbar -mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2 lg:justify-center lg:gap-3" aria-label="Events">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[0.875rem] transition ${active === n.key ? "font-semibold text-[#151312]" : "font-medium text-[#5E5853] hover:text-[#151312]"}`}>
                {n.label}
                {active === n.key && <span className="absolute inset-x-2.5 -bottom-[7px] h-[2px] rounded-full bg-[var(--pk)]" />}
              </Link>
            ))}
          </nav>
          <Link href={`${base}/quote`} data-track="Get a quote (header)" className="shop-btn inline-flex h-[34px] shrink-0 items-center rounded-full bg-[var(--pk)] px-4 text-[0.8125rem] font-semibold text-white lg:hidden">Get a quote</Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-[#161213] text-white">
        <div className={`${WRAP} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.45fr_0.85fr_0.85fr_1.1fr_1fr] lg:gap-0 lg:divide-x lg:divide-white/10`}>
          <div className="lg:pr-10">
            {logo
              ? <img src={logo} alt={org.name} className="h-14 max-w-[240px] object-contain object-left [filter:invert(1)_hue-rotate(180deg)_saturate(1.25)_brightness(1.1)]" />
              : <p className={`${serif} text-[1.75rem] font-semibold`}>{org.name}</p>}
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-white/75">
              Specialty coffee. Memorable events.{shop.roastedIn ? <><br />Locally roasted in {shop.roastedIn}.</> : null}
            </p>
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-3 text-[0.875rem] font-semibold">{labels.events}</p>
            {nav.slice(1).map((n) => <Link key={n.key} href={n.href} className={link}>{n.label}</Link>)}
            <Link href={`${base}/quote`} className={link}>Get a quote</Link>
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-3 text-[0.875rem] font-semibold">More</p>
            {more.map((n) => <Link key={n.href} href={n.href} className={link}>{n.label}</Link>)}
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-3 text-[0.875rem] font-semibold">Get in touch</p>
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className={link}>{org.contact_phone}</a>}
            {(social.instagram || social.facebook) && (
              <div className="flex gap-3 pt-3">
                {social.instagram && <a href={social.instagram} aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg></a>}
                {social.facebook && <a href={social.facebook} aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-white/20 hover:bg-white/10"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z" /></svg></a>}
              </div>
            )}
          </div>
          <div className="flex items-start gap-3 lg:pl-8">
            <Coffee className="mt-0.5 h-7 w-7 shrink-0 text-white/85" strokeWidth={1.5} />
            <p className="text-[0.9375rem] leading-relaxed text-white/80">Great coffee brings<br />people together.</p>
          </div>
        </div>
        <p className={`${WRAP} border-t border-white/10 py-5 text-[0.8125rem] text-white/45`}>Quotes are emailed — you&apos;ll see every price before you commit · Powered by EventureOS</p>
      </footer>
    </div>
  );
}

/** Section header used across the events pages. */
export function Heading({ kicker, title, intro, center }: { kicker?: string; title: React.ReactNode; intro?: React.ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-[760px] text-center" : "max-w-[760px]"}>
      {kicker && <p className={eyebrow}>{kicker}</p>}
      <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-[1.08] sm:text-[3rem]`}>{title}</h2>
      {intro && <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">{intro}</p>}
    </div>
  );
}
