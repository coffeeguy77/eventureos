import Link from "next/link";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav, type SiteSection } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { PAGE } from "@/components/book/shell";
import { OfferRibbon } from "./offer-ribbon";
import { SiteTracker } from "./tracker";
import { GiftMenu } from "./gift-menu";

/** One menu bar above every public section of the business's site: logo · events · classes · job board · shop · gift certificates. Also runs the anonymous analytics tracker. */
export function MasterNav({ org, active, tone = "dark" }: { org: PublicOrg; active?: SiteSection; tone?: "dark" | "light" }) {
  const light = tone === "light";
  const labels = readSiteNav(org.rawSettings);
  const base = org.slug;
  const items: { key: SiteSection; href: string; on: boolean }[] = [
    { key: "events", href: `/hire/${base}`, on: readEvents(org.rawSettings).enabled },
    { key: "lessons", href: `/${base}`, on: org.settings.enabled },
    { key: "jobs", href: `/jobs/${base}`, on: readJobSettings(org.rawSettings, org.name).enabled },
    { key: "shop", href: `/shop/${base}`, on: readShop(org.rawSettings).enabled },
    { key: "gifts", href: `/book/${base}/gift`, on: org.settings.enabled && org.stripeReady },
  ];
  // Gift certificates: barista lessons and/or coffee gift cards. In the barista lessons pages, only the lesson certificate.
  const lessonsGift = org.settings.enabled && org.stripeReady;
  const coffeeGift = readShop(org.rawSettings).enabled && org.stripeReady;
  const inLessons = active === "lessons" || active === "gifts";
  const gifts = [
    lessonsGift ? { kind: "lessons" as const, href: `/book/${base}/gift`, label: labels.lessons, note: "A class they'll love" } : null,
    coffeeGift && !inLessons ? { kind: "coffee" as const, href: `/shop/${base}/gift-card`, label: "Coffee", note: "Choose an amount" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const giftItem = items.find((i) => i.key === "gifts")!;
  giftItem.on = gifts.length > 0;
  if (gifts.length === 1) giftItem.href = gifts[0].href;
  const shown = items.filter((i) => i.on);
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  return (
    <>
    <div className={`relative z-50 border-b ${light ? "border-[#EEE6DF] bg-[#FCFAF7] text-[#1F1B19]" : "border-white/10 bg-[#141011] text-white"}`} data-master-nav>
      <div className={`${PAGE} flex min-h-[60px] flex-wrap items-center gap-x-8 gap-y-0`}>
        <Link href={`/${base}`} className="flex h-[60px] shrink-0 items-center" aria-label={`${org.name} home`}>
          {logo ? <img src={logo} alt={org.name} className="h-9 max-w-[180px] object-contain" /> : <span className="text-[1.0625rem] font-semibold">{org.name}</span>}
        </Link>
        <nav aria-label={org.name} className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-3 pb-2 sm:overflow-visible sm:mx-0 sm:w-auto sm:flex-1 sm:justify-end sm:px-0 sm:pb-0">
          {shown.map((i, n) => (
            <span key={i.key} className="flex shrink-0 items-center">
              {n > 0 && <span aria-hidden className={`mx-1 hidden h-4 w-px sm:block ${light ? "bg-[#E2D8D0]" : "bg-white/20"}`} />}
              {i.key === "gifts" && gifts.length > 1 ? (
                <GiftMenu label={labels.gifts} items={gifts} light={light} active={active === "gifts"}
                  itemClass={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[0.8438rem] font-medium transition sm:h-[60px] sm:rounded-none sm:px-3 sm:text-[0.9375rem] ${active === "gifts" ? (light ? "text-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`} />
              ) : (
              <Link href={i.href} aria-current={active === i.key ? "page" : undefined}
                className={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[0.8438rem] font-medium transition sm:h-[60px] sm:rounded-none sm:px-3 sm:text-[0.9375rem] ${active === i.key ? (light ? "text-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)]" : "text-[var(--b)]") : light ? "text-[#3A3431] hover:text-black" : "text-white/85 hover:text-white"}`}>
                {labels[i.key]}
                {active === i.key && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[color-mix(in_srgb,var(--b)_70%,#ff0a6c)] max-sm:inset-x-2 max-sm:bottom-1 max-sm:h-[2px]" />}
              </Link>
              )}
            </span>
          ))}
        </nav>
      </div>
    </div>
    <OfferRibbon org={org} active={active} />
    <SiteTracker slug={org.slug} section={active ?? "other"} />
    </>
  );
}
