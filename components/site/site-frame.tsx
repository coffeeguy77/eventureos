import "@fontsource-variable/newsreader/opsz.css";
import Link from "next/link";
import { brandStyle } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { PageBg } from "@/components/site/page-bg";
import { SHOP_CSS, WRAP } from "@/components/shop/frame";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSite } from "@/lib/site/site";
import { newPages } from "@/lib/site/pages";

/** Clean address (from newPages) → the EventureOS address, which works on every domain. */
export function internalHref(slug: string, clean: string) {
  if (clean === "/") return readSiteHomeHref(slug);
  if (clean === "/classes") return `/${slug}`;
  const [, first, ...rest] = clean.split("/");
  if (["hire", "shop", "cafe", "jobs", "academy", "book"].includes(first)) return `/${first}/${slug}${rest.length ? "/" + rest.join("/") : ""}`;
  return `/site/${slug}/${first}`;
}
const readSiteHomeHref = (slug: string) => `/site/${slug}`;

/** The footer used on the home page and the business's own pages: its sections, its pages, and how to reach it. */
export function SiteFooter({ org }: { org: PublicOrg }) {
  const site = readSite(org.rawSettings);
  const all = newPages(org.rawSettings, org.name);
  const tops = all.filter((p) => ["/classes", "/hire", "/academy", "/cafe", "/shop", "/jobs"].includes(p.path));
  const label: Record<string, string> = { "/classes": "Barista classes", "/hire": "Event hire", "/academy": "Online academy", "/cafe": "Café", "/shop": "Shop coffee", "/jobs": "Barista jobs" };
  const pages = site.pages.filter((p) => p.footer);
  const social = org.settings.social;
  const link = "block py-1 text-[0.875rem] text-[#5E5853] transition hover:text-[#151312]";
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  return (
    <footer className="border-t border-[#EDE3DB] bg-[#FFFBF8]">
      <div className={`${WRAP} grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]`}>
        <div>
          {logo ? <img src={logo} alt={org.name} className="h-9 max-w-[180px] object-contain" /> : <p className="shop-serif text-[1.5rem] font-semibold">{org.name}</p>}
          {org.address && <p className="mt-3 max-w-xs text-[0.875rem] leading-relaxed text-[#5E5853]">{org.address}</p>}
          {org.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[0.875rem] font-semibold text-[var(--pk)] hover:underline">Get directions</a>}
        </div>
        {tops.length > 0 && <div><p className="mb-2 text-[0.875rem] font-semibold">Explore</p>{tops.map((p) => <Link key={p.path} href={internalHref(org.slug, p.path)} className={link}>{label[p.path]}</Link>)}</div>}
        {pages.length > 0 && <div><p className="mb-2 text-[0.875rem] font-semibold">{org.name}</p>{pages.map((p) => <Link key={p.slug} href={`/site/${org.slug}/${p.slug}`} className={link}>{p.title}</Link>)}</div>}
        <div>
          <p className="mb-2 text-[0.875rem] font-semibold">Contact</p>
          {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className={link}>{org.contact_phone}</a>}
          {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
          {social.instagram && <a href={social.instagram} target="_blank" rel="noopener noreferrer" className={link}>Instagram</a>}
          {social.facebook && <a href={social.facebook} target="_blank" rel="noopener noreferrer" className={link}>Facebook</a>}
        </div>
      </div>
      <p className={`${WRAP} border-t border-[#EDE3DB] py-5 text-[0.8125rem] text-[#8C847D]`}>© {new Date().getFullYear()} {org.name}</p>
    </footer>
  );
}

/** The frame for the home page and the business's own pages (About, Contact, …). */
export function SiteFrame({ org, children }: { org: PublicOrg; children: React.ReactNode }) {
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#FFFBF8" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} tone="light" />
      <main>{children}</main>
      <SiteFooter org={org} />
    </div>
  );
}
