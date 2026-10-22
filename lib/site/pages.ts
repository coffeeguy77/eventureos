/**
 * Every public page a business has switched on, at its clean address on the business's own domain
 * (used for the sitemap, matching old addresses to new pages, and the SEO Saver's "send to" list). Pure.
 */
import { hirePageSlug, offered, readEvents } from "@/lib/events/core";
import { cafePages, readCafe } from "@/lib/cafe/core";
import { readShop } from "@/lib/shop/core";
import { readJobSettings } from "@/lib/jobs/core";
import { readLearnSettings } from "@/lib/learn/core";
import { readSettings } from "@/lib/bookings/core";
import { readSite } from "./site";

export interface NewPage { path: string; title: string; group: string }

export function newPages(settings: unknown, orgName = ""): NewPage[] {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const site = readSite(raw);
  const out: NewPage[] = [{ path: "/", title: site.home ? "Home" : "Home (classes page)", group: "Home" }];
  for (const p of site.pages) out.push({ path: `/${p.slug}`, title: p.title, group: "Pages" });
  if (readSettings(raw).enabled) out.push({ path: "/classes", title: "Barista classes / courses", group: "Classes" }, { path: "/book/gift", title: "Class gift certificates", group: "Classes" });
  const ev = readEvents(raw);
  if (ev.enabled) {
    out.push({ path: "/hire", title: "Event hire", group: "Events" });
    for (const k of offered(ev)) if (k !== "diy") out.push({ path: `/hire/${hirePageSlug(k, ev)}`, title: `${ev.labels[k]} hire`, group: "Events" });
    out.push({ path: "/hire/catering", title: "Catering menu", group: "Events" }, { path: "/hire/drinks", title: "Drinks menu", group: "Events" },
      { path: "/hire/branding", title: "Branding", group: "Events" }, { path: "/hire/quote", title: "Get a quote", group: "Events" });
  }
  const cp = cafePages(readCafe(raw));
  if (cp.home) out.push({ path: "/cafe", title: "Café, espresso bar and menu", group: "Café" });
  if (cp.order) out.push({ path: "/cafe/order", title: "Order online", group: "Café" });
  if (cp.reserve) out.push({ path: "/cafe/reserve", title: "Reserve a table", group: "Café" });
  if (cp.club) out.push({ path: "/cafe/roasting-club", title: "Roasting Club coffee roasting", group: "Café" });
  if (cp.wholesale) out.push({ path: "/cafe/wholesale", title: "Wholesale coffee", group: "Café" });
  if (readShop(raw).enabled) out.push({ path: "/shop", title: "Shop coffee beans", group: "Shop" }, { path: "/shop/subscriptions", title: "Coffee subscriptions", group: "Shop" }, { path: "/shop/gift-card", title: "Coffee gift card", group: "Shop" });
  if (readLearnSettings(raw).enabled) out.push({ path: "/academy", title: "Online barista academy course", group: "Academy" });
  if (readJobSettings(raw, orgName).enabled) out.push({ path: "/jobs", title: "Barista jobs", group: "Jobs" });
  return out;
}
