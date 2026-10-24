import "@fontsource-variable/newsreader/opsz.css";
import { PublicFooter } from "@/components/site/public-footer";
import { brandStyle } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { PageBg } from "@/components/site/page-bg";
import { SHOP_CSS } from "@/components/shop/frame";
import type { PublicOrg } from "@/lib/bookings/server";

/** Clean address (from newPages) → the EventureOS address, which works on every domain. */
export function internalHref(slug: string, clean: string) {
  if (clean === "/") return readSiteHomeHref(slug);
  if (clean === "/classes") return `/${slug}`;
  const [, first, ...rest] = clean.split("/");
  if (["hire", "shop", "cafe", "jobs", "academy", "book"].includes(first)) return `/${first}/${slug}${rest.length ? "/" + rest.join("/") : ""}`;
  return `/site/${slug}/${first}`;
}
const readSiteHomeHref = (slug: string) => `/site/${slug}`;


/** The frame for the home page and the business's own pages (About, Contact, …). */
export function SiteFrame({ org, children }: { org: PublicOrg; children: React.ReactNode }) {
  return (
    <div data-book-root style={brandStyle(org)} className="shop min-h-screen bg-[#FCFAF7] text-[#151312]">
      <PageBg color="#FFFBF8" />
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} tone="light" />
      <main>{children}</main>
      <PublicFooter org={org} />
    </div>
  );
}
