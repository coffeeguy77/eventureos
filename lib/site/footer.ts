/**
 * The site-wide footer's contents, built from what the business has switched on — so it always lists the real pages
 * (café, coffee shop, classes and academy, roasting space, events, wholesale, job board, info pages) and nothing else.
 */
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { cafePages, readCafe } from "@/lib/cafe/core";
import { readLearnSettings } from "@/lib/learn/core";
import { readSite } from "@/lib/site/site";

export type FooterIcon = "cafe" | "coffee" | "learn" | "roast" | "events" | "wholesale" | "jobs";
export interface FooterLink { label: string; href: string; external?: boolean }
export interface FooterGroup { key: FooterIcon; title: string; blurb: string; links: FooterLink[] }
export interface FooterModel {
  name: string; logo: string | null; home: string;
  /** The three things most people come for */
  actions: FooterLink[];
  groups: FooterGroup[];
  /** About, contact, franchise, policies… (the business's own info pages) */
  company: FooterLink[];
  contact: { address: string | null; directions: string | null; phone: string | null; email: string | null };
  social: FooterLink[];
}

export function footerModel(org: PublicOrg): FooterModel {
  const s = org.rawSettings;
  const base = org.slug;
  const labels = readSiteNav(s);
  const shop = readShop(s);
  const learn = readLearnSettings(s);
  const cafe = readCafe(s);
  const cp = cafePages(cafe);
  const events = readEvents(s);
  const jobs = readJobSettings(s, org.name);
  const site = readSite(s);
  const classes = !!org.settings.enabled;
  const gifts = org.stripeReady;

  const groups: FooterGroup[] = [];
  if (cp.home) groups.push({ key: "cafe", title: "Café", blurb: "Breakfast, lunch and coffee roasted on site.", links: [
    { label: "Our café", href: `/cafe/${base}` },
    ...(cp.order ? [{ label: "Order online", href: `/cafe/${base}/order` }] : cp.appOrder ? [{ label: "Order in our app", href: cafe.appUrl, external: true }] : []),
    ...(cp.reserve ? [{ label: "Reserve a table", href: `/cafe/${base}/reserve` }] : []),
  ] });
  if (shop.enabled) groups.push({ key: "coffee", title: labels.shop || "Coffee", blurb: "Freshly roasted coffee, delivered.", links: [
    { label: "Shop coffee", href: `/shop/${base}` },
    { label: "Subscriptions", href: `/shop/${base}/subscriptions` },
    { label: "My account", href: `/shop/${base}/account` },
    ...(gifts ? [{ label: "Coffee gift cards", href: `/shop/${base}/gift-card` }] : []),
  ] });
  if (classes || learn.enabled) groups.push({ key: "learn", title: labels.lessons || "Barista lessons", blurb: "Hands-on classes and learning online.", links: [
    ...(classes ? [{ label: "Hands-on classes", href: `/${base}` }] : []),
    ...(learn.enabled ? [{ label: learn.name, href: `/academy/${base}` }, { label: "Online lessons", href: `/academy/${base}/course` }, { label: "Roast simulator", href: `/academy/${base}/roast` }] : []),
    ...(learn.enabled && learn.ai.enabled ? [{ label: "AI coach", href: `/academy/${base}/coach` }] : []),
    ...(classes && gifts ? [{ label: "Class gift certificates", href: `/book/${base}/gift` }] : []),
    ...(classes ? [{ label: "My bookings", href: `/book/${base}/account` }] : []),
  ] });
  if (cp.club) groups.push({ key: "roast", title: cafe.clubTitle || "Roasting club", blurb: "A shared roastery for your own coffee.", links: [
    { label: "Roast with us", href: `/cafe/${base}/roasting-club` },
    { label: "Roaster hire & prices", href: `/cafe/${base}/roasting-club#equipment` },
    { label: "Profit calculator", href: `/cafe/${base}/roasting-club#calculator` },
  ] });
  if (events.enabled) groups.push({ key: "events", title: labels.events || "Events", blurb: "Coffee carts, vans and catering.", links: [
    { label: "Coffee cart hire", href: `/hire/${base}` },
    { label: "Catering", href: `/hire/${base}/catering` },
    { label: "Get a quote", href: `/hire/${base}/quote` },
    { label: "Client sign-in", href: `/p/${base}` },
  ] });
  if (cp.wholesale) groups.push({ key: "wholesale", title: "Wholesale", blurb: "Coffee for cafés, offices and restaurants.", links: [
    { label: "Wholesale coffee", href: `/cafe/${base}/wholesale` },
    { label: "Get our rates", href: `/cafe/${base}/wholesale#rates` },
  ] });
  if (jobs.enabled) groups.push({ key: "jobs", title: labels.jobs || "Job board", blurb: "Barista jobs and staff for hire.", links: [
    { label: "Find barista work", href: `/jobs/${base}` },
  ] });

  const company = site.pages.filter((p) => p.footer && p.slug).map((p) => ({ label: p.title, href: `/site/${base}/${p.slug}` }));

  const ig = cafe.instagram ? `https://www.instagram.com/${cafe.instagram}/` : org.settings.social.instagram ?? null;
  const social: (FooterLink | null)[] = [
    ig ? { label: "Instagram", href: ig, external: true } : null,
    org.settings.social.facebook ? { label: "Facebook", href: org.settings.social.facebook, external: true } : null,
  ];

  const actions: (FooterLink | null)[] = [
    cp.order ? { label: "Order online", href: `/cafe/${base}/order` } : cp.appOrder ? { label: "Order online", href: cafe.appUrl, external: true } : null,
    classes ? { label: "Book a class", href: `/${base}` } : null,
    events.enabled ? { label: "Hire a coffee cart", href: `/hire/${base}` } : null,
    shop.enabled ? { label: "Buy coffee", href: `/shop/${base}` } : null,
  ];

  return {
    name: org.name, logo: org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null,
    home: site.home ? `/site/${base}` : `/${base}`,
    actions: actions.filter((x): x is FooterLink => !!x).slice(0, 3), groups, company,
    contact: {
      address: org.address, directions: org.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}` : null,
      phone: org.contact_phone, email: org.contact_email,
    },
    social: social.filter((x): x is FooterLink => !!x),
  };
}
