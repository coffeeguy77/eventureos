import "@fontsource-variable/newsreader/opsz.css";
import { PublicFooter } from "@/components/site/public-footer";
import { SectionNav } from "@/components/site/section-nav";
import { readSiteNav } from "@/lib/site-nav";
import { PageBg } from "@/components/site/page-bg";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { brandStyle } from "@/components/book/shell";
import { SHOP_CSS, WRAP, serif } from "@/components/shop/frame";
import { MasterNav } from "@/components/site/master-nav";
import type { PublicOrg } from "@/lib/bookings/server";
import { hirePageSlug, offered, type EventsSettings } from "@/lib/events/core";

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
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#161213" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="events" />
      <SectionNav org={org} label="Events" title={readSiteNav(org.rawSettings).events} titleHref={base} active={active}
        links={nav.map((n) => ({ key: n.key, href: n.href, label: n.label }))} cta={{ href: `${base}/quote`, label: "Get a quote", track: "Get a quote (header)" }} />
      <main>{children}</main>
      <PublicFooter org={org} note="Quotes are emailed — you'll see every price before you commit." />
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
