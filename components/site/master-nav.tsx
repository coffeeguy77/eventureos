import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav, type SiteSection } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { cafePages, readCafe } from "@/lib/cafe/core";
import { PAGE } from "@/components/book/shell";
import { OfferRibbon } from "./offer-ribbon";
import { SiteTracker } from "./tracker";
import { PageEditor } from "./page-editor";
import { GiftMenu } from "./gift-menu";
import { MobileMenu, type MobileItem } from "./mobile-menu";

const NOTE: Record<SiteSection, string> = { events: "Coffee carts, vans & catering", lessons: "Courses & upcoming dates", jobs: "Find barista work or staff", shop: "Freshly roasted coffee", cafe: "Order, book a table & more", gifts: "Classes & coffee gift cards" };

/** One menu bar above every public section of the business's site: logo · events · classes · job board · shop · café · gift certificates. Also runs the anonymous analytics tracker. */
export function MasterNav({ org, active, tone = "dark", cta }: { org: PublicOrg; active?: SiteSection; tone?: "dark" | "light"; /** A button at the end of the menu, e.g. "Get a quote" on the events pages */ cta?: { href: string; label: string } }) {
  const light = tone === "light";
  const labels = readSiteNav(org.rawSettings);
  const base = org.slug;
  const items: { key: SiteSection; href: string; on: boolean }[] = [
    { key: "events", href: `/hire/${base}`, on: readEvents(org.rawSettings).enabled },
    { key: "lessons", href: `/${base}`, on: org.settings.enabled },
    { key: "jobs", href: `/jobs/${base}`, on: readJobSettings(org.rawSettings, org.name).enabled },
    { key: "shop", href: `/shop/${base}`, on: readShop(org.rawSettings).enabled },
    { key: "cafe", href: `/cafe/${base}`, on: false },
    { key: "gifts", href: `/book/${base}/gift`, on: org.settings.enabled && org.stripeReady },
  ];
  // Gift certificates: barista lessons and/or coffee gift cards — the same dropdown on every page.
  const lessonsGift = org.settings.enabled && org.stripeReady;
  const coffeeGift = readShop(org.rawSettings).enabled && org.stripeReady;
  const gifts = [
    lessonsGift ? { kind: "lessons" as const, href: `/book/${base}/gift`, label: labels.lessons, note: "A class they'll love" } : null,
    coffeeGift ? { kind: "coffee" as const, href: `/shop/${base}/gift-card`, label: "Coffee", note: "Choose an amount" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const giftItem = items.find((i) => i.key === "gifts")!;
  giftItem.on = gifts.length > 0;
  if (gifts.length === 1) giftItem.href = gifts[0].href;
  // Café: the café page, plus ordering, table bookings, roasting club and wholesale when they're on.
  const cafe = readCafe(org.rawSettings);
  const cp = cafePages(cafe);
  const cafeLinks = [
    cp.home ? { kind: "cafe" as const, href: `/cafe/${base}`, label: "Our café", note: "Coffee, kitchen & hours" } : null,
    cp.order ? { kind: "order" as const, href: `/cafe/${base}/order`, label: "Order online", note: "Pick up from the café" } : cp.appOrder ? { kind: "order" as const, href: cafe.appUrl, label: "Order online", note: "Order in our app" } : null,
    cp.reserve ? { kind: "table" as const, href: `/cafe/${base}/reserve`, label: "Reserve a table", note: "Book ahead" } : null,
    cp.club ? { kind: "club" as const, href: `/cafe/${base}/roasting-club`, label: "Roasting Club", note: "Roast on our equipment" } : null,
    cp.wholesale ? { kind: "wholesale" as const, href: `/cafe/${base}/wholesale`, label: "Wholesale", note: "Coffee for your business" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  items.find((i) => i.key === "cafe")!.on = cp.home;
  const shown = items.filter((i) => i.on);
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const mobile: MobileItem[] = shown.map((i) => ({ key: i.key, label: labels[i.key], href: i.href, note: NOTE[i.key],
    children: i.key === "gifts" && gifts.length > 1 ? gifts : i.key === "cafe" && cafeLinks.length > 1 ? cafeLinks : undefined }));
  return (
    <>
    <div className={`relative z-50 border-b ${light ? "border-[#EEE6DF] bg-[#FCFAF7] text-[#1F1B19]" : "border-white/10 bg-[#141011] text-white"}`} data-master-nav>
      <div className={`${PAGE} flex min-h-[60px] flex-wrap items-center gap-x-8 gap-y-0`}>
        <Link href={`/${base}`} className="flex h-[60px] shrink-0 items-center" aria-label={`${org.name} home`}>
          {logo ? <img src={logo} alt={org.name} className="h-9 max-w-[180px] object-contain" /> : <span className="text-[1.0625rem] font-semibold">{org.name}</span>}
        </Link>
        {shown.length > 0 && <MobileMenu items={mobile} active={active} light={light} logo={logo} name={org.name} home={`/${base}`} phone={org.contact_phone} email={org.contact_email} cta={cta} />}
        <nav aria-label={org.name} className="hidden items-center gap-1 lg:flex lg:flex-1 lg:justify-end">
          {shown.map((i, n) => (
            <span key={i.key} className="flex shrink-0 items-center">
              {n > 0 && <span aria-hidden className={`mx-1 hidden h-4 w-px sm:block ${light ? "bg-[#E2D8D0]" : "bg-white/20"}`} />}
              {(i.key === "gifts" && gifts.length > 1) || (i.key === "cafe" && cafeLinks.length > 1) ? (
                <GiftMenu label={labels[i.key]} items={i.key === "gifts" ? gifts : cafeLinks} light={light} active={active === i.key} track={i.key === "gifts" ? "Gift menu" : "Café menu"}
                  itemClass={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[0.8438rem] font-medium transition sm:h-[60px] sm:rounded-none sm:px-3 sm:text-[0.9375rem] ${active === i.key ? (light ? "text-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`} />
              ) : (
              <Link href={i.href} aria-current={active === i.key ? "page" : undefined}
                className={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[0.8438rem] font-medium transition sm:h-[60px] sm:rounded-none sm:px-3 sm:text-[0.9375rem] ${active === i.key ? (light ? "text-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`}>
                {labels[i.key]}
                {active === i.key && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[color-mix(in_srgb,var(--b)_70%,#ff0a6c)] max-sm:inset-x-2 max-sm:bottom-1 max-sm:h-[2px]" />}
              </Link>
              )}
            </span>
          ))}
          {cta && (
            <Link href={cta.href} data-track={`${cta.label} (site menu)`}
              className="shop-btn ml-4 inline-flex h-[42px] shrink-0 items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)] px-6 text-[0.9375rem] font-semibold text-white shadow-[0_10px_22px_-12px_color-mix(in_srgb,var(--b)_40%,#ff0a6c)] hover:brightness-105">
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
