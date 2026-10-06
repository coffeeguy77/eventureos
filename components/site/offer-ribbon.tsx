import { ribbonOffer } from "@/lib/offers/server";
import { offerPath, offerShort, offerWhere, type OfferPlace } from "@/lib/offers/core";
import type { SiteSection } from "@/lib/site-nav";
import { RibbonBar } from "./ribbon-bar";

/** Midnight at the end of a date in the business's time zone, as a timestamp. */
function endOfDay(date: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return guess - (asIfUtc - guess);
}

const PLACE: Record<SiteSection, OfferPlace | null> = { lessons: "classes", gifts: "gifts", shop: "shop", jobs: null, events: null };

/**
 * The website ribbon: an offer the business has chosen to show, across the top of every public page while it runs —
 * name, discount, code, a countdown in the last fortnight, and a button that opens the right page with the code applied.
 */
export async function OfferRibbon({ org, active }: { org: { id: string; slug: string; timezone: string }; active?: SiteSection }) {
  const place = active ? PLACE[active] : null;
  const o = await ribbonOffer(org.id, org.timezone, place).catch(() => null);
  if (!o) return null;
  const here = place && o.works_on.includes(place);
  const href = here
    ? `${place === "classes" ? `/${org.slug}` : place === "gifts" ? `/book/${org.slug}/gift` : `/shop/${org.slug}`}?code=${encodeURIComponent(o.code)}`
    : offerPath(o, org.slug);
  const endsAt = o.ends_on ? endOfDay(o.ends_on, org.timezone) : null;
  return (
    <RibbonBar code={o.code} headline={o.headline} short={offerShort(o)} deal={`${offerShort(o)} ${offerWhere(o)}`} href={href} endsAt={endsAt}
      endsLabel={o.ends_on ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(o.ends_on + "T00:00:00Z")) : null} />
  );
}
