import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/caveat/600.css";
import Link from "next/link";
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

/** The frame around every events page: site menu, events menu with "Get a quote", footer. Same light look as the shop. */
export function EventsFrame({ org, s, active, children }: { org: PublicOrg; s: EventsSettings; active: EventsPage; children: React.ReactNode }) {
  const base = `/hire/${org.slug}`;
  const nav = eventsNav(org, s);
  const labels = readSiteNav(org.rawSettings);
  const more = [
    org.settings.enabled ? { href: `/${org.slug}`, label: labels.lessons } : null,
    readShop(org.rawSettings).enabled ? { href: `/shop/${org.slug}`, label: labels.shop } : null,
    org.settings.enabled && org.stripeReady ? { href: `/book/${org.slug}/gift`, label: labels.gifts } : null,
  ].filter((x): x is { href: string; label: string } => !!x);
  const social = org.settings.social;
  const link = "block text-[0.875rem] text-[#5E5853] transition hover:text-[#151312]";
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="events" tone="light" />
      <header className="sticky top-0 z-40 border-b border-[#EEE6DF] bg-[#FCFAF7]/92 backdrop-blur-md">
        <div className={`${WRAP} flex h-[62px] items-center gap-4`}>
          <Link href={base} className={`${serif} shrink-0 text-[1.1875rem] font-semibold lg:w-[150px]`}>{labels.events}</Link>
          <nav className="no-scrollbar hidden flex-1 items-center justify-center gap-1 overflow-x-auto md:flex" aria-label="Events">
            {nav.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-[9px] text-[0.9375rem] font-medium transition ${active === n.key ? "bg-[#111] text-white" : "text-[#26211E] hover:bg-[#F2EAE4]"}`}>{n.label}</Link>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />
          <Link href={`${base}/quote`} data-track="Get a quote (header)" className="shop-btn inline-flex h-[44px] shrink-0 items-center rounded-full bg-[var(--pk)] px-6 text-[0.9375rem] font-semibold text-white shadow-[0_10px_22px_-12px_var(--pk)] sm:h-[46px] sm:px-8">Get a quote</Link>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Events sections">
          {nav.map((n) => (
            <Link key={n.key} href={n.href} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium ${active === n.key ? "bg-[#151312] text-white" : "text-[#3F3A36]"}`}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[#EDE3DB] bg-[#FFFBF8]">
        <div className={`${WRAP} grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.9fr_0.8fr_1.1fr_auto] lg:gap-0 lg:divide-x lg:divide-[#EDE3DB]`}>
          <div className="lg:pr-10">
            <p className={`${serif} text-[1.625rem] font-semibold`}>{org.name}</p>
            <p className="mt-3 max-w-sm text-[0.875rem] leading-relaxed text-[#5E5853]">
              {[s.labels.cart, s.labels.van, s.labels.diy].filter((_, i) => offered(s).includes((["cart", "van", "diy"] as const)[i])).join(", ")} and catering{s.city ? ` across ${s.city}` : ""}{s.areas.length ? ` — ${s.areas.join(", ")}` : ""}.
            </p>
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">{labels.events}</p>
            {nav.map((n) => <Link key={n.key} href={n.href} className={link}>{n.label}</Link>)}
            <Link href={`${base}/quote`} className={link}>Get a quote</Link>
            <Link href={`/p/${org.slug}`} className={link}>Client sign-in</Link>
          </div>
          {more.length > 0 && (
            <div className="space-y-1.5 lg:px-8">
              <p className="mb-2.5 text-[0.875rem] font-semibold">More</p>
              {more.map((n) => <Link key={n.href} href={n.href} className={link}>{n.label}</Link>)}
            </div>
          )}
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Contact</p>
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className={link}>{org.contact_phone}</a>}
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
            {org.address && <p className="text-[0.875rem] leading-relaxed text-[#5E5853]">{org.address}</p>}
          </div>
          {(social.instagram || social.facebook) && (
            <div className="flex gap-3 lg:pl-8">
              {social.instagram && <a href={social.instagram} aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg></a>}
              {social.facebook && <a href={social.facebook} aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z" /></svg></a>}
            </div>
          )}
        </div>
        <p className={`${WRAP} border-t border-[#EDE3DB] py-5 text-[0.8125rem] text-[#8C847D]`}>Quotes are emailed — you&apos;ll see every price before you commit · Powered by EventureOS</p>
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
