import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/caveat/600.css";
import Link from "next/link";
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
    { key: "club" as const, href: `${base}/roasting-club`, label: "Roasting Club", on: p.club },
    { key: "wholesale" as const, href: `${base}/wholesale`, label: "Wholesale", on: p.wholesale },
  ].filter((l) => l.on);
}

/** The frame around every café page: site menu, café sub-menu, footer with hours and contact. Light and warm, like the shop. */
export function CafeFrame({ org, active, children, weekly, cta }: { org: CafeOrg; active: CafeTab; children: React.ReactNode; weekly?: Weekly | null; cta?: { href: string; label: string } }) {
  const links = cafeLinks(org);
  const rows = weekly ? hoursRows(weekly) : [];
  const social = org.settings.social;
  const ig = org.cafe.instagram ? `https://www.instagram.com/${org.cafe.instagram}/` : social.instagram ?? null;
  const link = "block text-[0.875rem] text-[#5E5853] transition hover:text-[#151312]";
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#FFFBF8" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="cafe" tone="light" />
      {links.length > 1 && (
        <header className="sticky top-0 z-40 border-b border-[#EEE6DF] bg-[#FCFAF7]/92 backdrop-blur-md">
          <div className={`${WRAP} flex h-[58px] items-center gap-3`}>
            <nav className="no-scrollbar -mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2" aria-label="Café">
              {links.map((n) => (
                <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                  className={`shrink-0 rounded-full px-4 py-2 text-[0.9063rem] font-medium transition ${active === n.key ? "bg-[#151312] text-white" : "text-[#26211E] hover:bg-[#F2EAE4]"}`}>{n.label}</Link>
              ))}
            </nav>
            {cta && <Link href={cta.href} className="shop-btn hidden h-[42px] shrink-0 items-center rounded-full bg-[var(--pk)] px-6 text-[0.9063rem] font-semibold text-white shadow-[0_10px_22px_-12px_var(--pk)] md:inline-flex">{cta.label}</Link>}
          </div>
        </header>
      )}
      <main>{children}</main>
      <footer className="border-t border-[#EDE3DB] bg-[#FFFBF8]">
        <div className={`${WRAP} grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.9fr_1.1fr_1.1fr] lg:gap-0 lg:divide-x lg:divide-[#EDE3DB]`}>
          <div className="lg:pr-10">
            <p className={`${serif} text-[1.625rem] font-semibold`}>{org.name}</p>
            {org.address && <p className="mt-3 max-w-xs text-[0.875rem] leading-relaxed text-[#5E5853]">{org.address}</p>}
            {org.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[0.875rem] font-semibold text-[var(--pk)] hover:underline">Get directions</a>}
          </div>
          <div className="space-y-1.5 lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Café</p>
            {links.map((n) => <Link key={n.key} href={n.href} className={link}>{n.label}</Link>)}
          </div>
          <div className="lg:px-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Opening hours</p>
            {rows.length ? (
              <dl className="space-y-1 text-[0.8438rem]">
                {rows.map((r) => <div key={r.day} className="flex justify-between gap-4"><dt className="text-[#5E5853]">{r.day.slice(0, 3)}</dt><dd className={r.closed ? "text-[#A39A93]" : "text-[#151312]"}>{r.text}</dd></div>)}
              </dl>
            ) : <p className="text-[0.875rem] text-[#5E5853]">See our app for today&apos;s hours.</p>}
          </div>
          <div className="space-y-1.5 lg:pl-8">
            <p className="mb-2.5 text-[0.875rem] font-semibold">Contact</p>
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className={link}>{org.contact_phone}</a>}
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
            {ig && <a href={ig} target="_blank" rel="noopener noreferrer" className={link}>Instagram{org.cafe.instagram ? ` · @${org.cafe.instagram}` : ""}</a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noopener noreferrer" className={link}>Facebook</a>}
          </div>
        </div>
        <p className={`${WRAP} border-t border-[#EDE3DB] py-5 text-[0.8125rem] text-[#8C847D]`}>Orders and bookings are handled by our café app · Website by EventureOS</p>
      </footer>
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
