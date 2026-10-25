import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/caveat/600.css";
import Link from "next/link";
import { PublicFooter } from "@/components/site/public-footer";
import { SectionNav } from "@/components/site/section-nav";
import { readSiteNav } from "@/lib/site-nav";
import { SiteFooter, type FooterVariant } from "@/components/site/site-footer";
import { footerModel } from "@/lib/site/footer";
import { brandStyle } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { PageBg } from "@/components/site/page-bg";
import { SHOP_CSS, WRAP, serif } from "@/components/shop/frame";
import { cafePages, hoursRows, type Weekly } from "@/lib/cafe/core";
import type { CafeOrg } from "@/lib/cafe/server";

export { serif, hand, WRAP, btn, btnOutline, eyebrow } from "@/components/shop/frame";

export type CafeTab = "home" | "order" | "reserve" | "club" | "wholesale";

export function cafeLinks(org: CafeOrg) {
  const p = cafePages(org.cafe);
  const base = `/cafe/${org.slug}`;
  return [
    { key: "home" as const, href: base, label: "Café", on: p.home },
    { key: "order" as const, href: p.order ? `${base}/order` : org.cafe.appUrl, label: "Order online", on: p.order || p.appOrder },
    { key: "reserve" as const, href: `${base}/reserve`, label: "Reserve a table", on: p.reserve },
    { key: "club" as const, href: `${base}/roasting-club`, label: org.cafe.clubTitle || "Roasting Club", on: p.club },
    { key: "wholesale" as const, href: `${base}/wholesale`, label: "Wholesale", on: p.wholesale },
  ].filter((l) => l.on);
}

/** The frame around every café page: site menu, café sub-menu, footer with hours and contact. Light and warm, like the shop. */
export function CafeFrame({ org, active, children, weekly, cta, footer }: { org: CafeOrg; active: CafeTab; children: React.ReactNode; weekly?: Weekly | null; cta?: { href: string; label: string }; /** a site-wide footer design to show instead of the café footer (being chosen) */ footer?: FooterVariant | null }) {
  const links = cafeLinks(org);
  const rows = weekly ? hoursRows(weekly) : [];
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#FFFBF8" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="cafe" />
      {links.length > 1 && (
        <SectionNav org={org} label="Café" title={readSiteNav(org.rawSettings).cafe} titleHref={`/cafe/${org.slug}`} active={active}
          links={links.map((n) => ({ key: n.key, href: n.href, label: n.label }))} cta={cta} />
      )}
      <main>{children}</main>
      {footer === "b" || footer === "c" ? <SiteFooter m={footerModel(org)} variant={footer} hours={rows} /> : <PublicFooter org={org} weekly={weekly ?? null} />}
    </div>
  );
}

/** Shown when a café page is switched off */
export function CafeClosed({ name, what = "This page" }: { name: string; what?: string }) {
  return (
    <div className={`${WRAP} py-24 text-center`}>
      <p className={`${serif} text-[2.25rem] font-semibold`}>{what} isn&apos;t available right now</p>
      <p className="mt-3 text-[#5E5853]">Please check back soon, or get in touch with {name}.</p>
    </div>
  );
}
