import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import type { SiteSection } from "@/lib/site-nav";
import { arrangeMenu, readMenus, topMenuAuto, visibleMenu, type MenuItem } from "@/lib/site/menus";
import { readSite } from "@/lib/site/site";
import { PAGE } from "@/components/book/shell";
import { OfferRibbon } from "./offer-ribbon";
import { SiteTracker } from "./tracker";
import { PageEditor } from "./page-editor";
import { currentPageMenu } from "./page-menu-server";
import { GiftMenu } from "./gift-menu";
import { MobileMenu, type MobileItem } from "./mobile-menu";

/** One menu bar above every public section of the business's site. Built from what's switched on, arranged in Website → Menus. Also runs the anonymous analytics tracker. */
export async function MasterNav({ org, active, cta }: { org: PublicOrg; active?: SiteSection; /** @deprecated the colour is set in Website → Menus and per page in the page editor */ tone?: "dark" | "light"; /** A button at the end of the menu */ cta?: { href: string; label: string } }) {
  const pm = await currentPageMenu(org);
  const light = pm.tone === "light";
  const base = org.slug;
  const site = readSite(org.rawSettings);
  const homeHref = site.home ? `/site/${base}` : `/${base}`;
  const logoCls = { md: "h-9 max-w-[180px]", lg: "h-12 max-w-[230px]", xl: "h-14 max-w-[260px] sm:h-[72px] sm:max-w-[320px]" }[site.logoSize];
  const all = arrangeMenu(topMenuAuto(org), readMenus(org.rawSettings).top);
  const desktop = visibleMenu(all, "desktop");
  const phone = visibleMenu(all, "mobile");
  // The job board lives under Barista lessons, so its pages light up that item
  const act = active === "jobs" && !all.some((i) => i.id === "jobs" && !i.hidden) ? "lessons" : active;
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const kids = (i: MenuItem) => i.children.map((c) => ({ kind: c.icon, href: c.href, label: c.label, note: c.note, external: c.external }));
  const mobile: MobileItem[] = phone.map((i) => ({ key: i.id, icon: i.icon, label: i.label, href: i.href, note: i.note, children: i.children.length ? kids(i) : undefined }));
  const shown = desktop;
  return (
    <>
    <div className={`relative z-50 border-b font-sans ${light ? "border-[#EEE6DF] bg-[#FCFAF7] text-[#1F1B19]" : "border-white/10 bg-[#141011] text-white"}`} data-master-nav data-menu-key={pm.key} data-menu-tone={pm.tone}>
      <div className={`${PAGE} flex min-h-[60px] flex-wrap items-center gap-x-8 gap-y-0`}>
        <Link href={homeHref} className={`flex shrink-0 items-center ${site.logoSize === "md" ? "h-[60px]" : "min-h-[60px] py-2"}`} aria-label={`${org.name} home`}>
          {logo ? <img src={logo} alt={org.name} className={`${logoCls} object-contain`} /> : <span className="text-[17px] font-semibold">{org.name}</span>}
        </Link>
        {mobile.length > 0 && <MobileMenu items={mobile} active={act} light={light} logo={logo} name={org.name} home={homeHref} phone={org.contact_phone} email={org.contact_email} cta={cta} />}
        <nav aria-label={org.name} className="hidden items-center gap-1 lg:flex lg:flex-1 lg:justify-end">
          {shown.map((i, n) => (
            <span key={i.id} className="flex shrink-0 items-center">
              {n > 0 && <span aria-hidden className={`mx-1 hidden h-4 w-px sm:block ${light ? "bg-[#E2D8D0]" : "bg-white/20"}`} />}
              {i.children.length > 1 ? (
                <GiftMenu label={i.label} items={kids(i)} light={light} active={act === i.id} track={({ gifts: "Gift menu", lessons: "Lessons menu", cafe: "Café menu" } as Record<string, string>)[i.id] ?? `${i.label} menu`}
                  itemClass={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-medium leading-none tracking-normal transition sm:h-[60px] sm:rounded-none sm:px-3 ${act === i.id ? (light ? "text-[var(--pk,color-mix(in_srgb,var(--b)_40%,#ff0a6c))]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`} />
              ) : (
              <Link href={i.children[0]?.href ?? i.href} aria-current={act === i.id ? "page" : undefined}
                className={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-medium leading-none tracking-normal transition sm:h-[60px] sm:rounded-none sm:px-3 ${act === i.id ? (light ? "text-[var(--pk,color-mix(in_srgb,var(--b)_40%,#ff0a6c))]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`}>
                {i.label}
                {act === i.id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[var(--pk,color-mix(in_srgb,var(--b)_70%,#ff0a6c))] max-sm:inset-x-2 max-sm:bottom-1 max-sm:h-[2px]" />}
              </Link>
              )}
            </span>
          ))}
          {cta && (
            <Link href={cta.href} data-track={`${cta.label} (site menu)`}
              className="shop-btn ml-4 inline-flex h-[42px] shrink-0 items-center gap-2 rounded-full bg-[var(--pk,color-mix(in_srgb,var(--b)_40%,#ff0a6c))] px-6 text-[0.9375rem] font-semibold text-white shadow-[0_10px_22px_-12px_var(--pk,color-mix(in_srgb,var(--b)_40%,#ff0a6c))] hover:brightness-105">
              {cta.label}<ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </div>
    </div>
    <OfferRibbon org={org} active={active} />
    <SiteTracker slug={org.slug} section={active ?? "other"} />
    <PageEditor slug={org.slug} />
    </>
  );
}
