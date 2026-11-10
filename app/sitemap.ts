import type { MetadataRoute } from "next";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";
import { hirePageSlug, offered, readEvents } from "@/lib/events/core";
import { cafePages, readCafe } from "@/lib/cafe/core";
import { readSite } from "@/lib/site/site";
import { readHireSettings } from "@/lib/hire/core";
import { isAgencyAccess } from "@/lib/site/agency/support";
import { AGENCY_PAGES } from "@/lib/site/agency/content";
import { readShop } from "@/lib/shop/core";
import { readJobSettings } from "@/lib/jobs/core";
import { readLearnSettings } from "@/lib/learn/core";
import { readMachines } from "@/lib/machines/core";
import { readPrinting } from "@/lib/printing/core";
// The site's own public pages, listed by scripts/gen-public-pages.mjs before every build
import PUBLIC_PAGES from "@/lib/public-pages.generated.json";

export const revalidate = 3600;
const BASE = "https://www.eventureos.com.au";

/**
 * sitemap.xml, rebuilt hourly: the site's own public pages (found automatically at build time — a new page is added
 * without touching this file), plus every business's public pages straight from the database — cafés, hire, shops
 * and their products, courses, jobs boards, academies and agency sites — so a business that switches a page on
 * appears within the hour.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const LEGAL = new Set(["/privacy", "/terms"]);
  const out: MetadataRoute.Sitemap = [
    ...(PUBLIC_PAGES as string[]).map((p) => ({
      url: p === "/" ? `${BASE}/` : `${BASE}${p}`,
      changeFrequency: (p === "/" ? "weekly" : LEGAL.has(p) ? "yearly" : "monthly") as "weekly" | "yearly" | "monthly",
      priority: p === "/" ? 1 : LEGAL.has(p) ? 0.3 : 0.8,
    })),
    { url: `${BASE}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
  if (!serviceRoleConfigured()) return out;
  try {
    const db = createServiceClient();
    const { data: all } = await db.from("organisations").select("id, slug, settings, app_access").eq("status", "active");
    // A business on its own domain lists its pages in its own sitemap (www.its-domain/sitemap.xml), not here
    const orgs = (all ?? []).filter((o) => !readSite(o.settings).live);
    // web/IT agencies (Nerd Herd): their home page plus the service, quote and support pages
    for (const o of orgs as { slug: string; app_access: unknown }[]) {
      if (!isAgencyAccess(o.app_access)) continue;
      out.push({ url: `${BASE}/site/${o.slug}`, changeFrequency: "weekly", priority: 0.9 });
      for (const p of AGENCY_PAGES) out.push({ url: `${BASE}/site/${o.slug}/${p}`, changeFrequency: "monthly", priority: p === "support" || p === "quote" ? 0.5 : 0.8 });
    }
    for (const o of (orgs ?? []) as { slug: string; settings: Record<string, unknown> | null }[]) {
      const cp = cafePages(readCafe(o.settings));
      const cb = `${BASE}/cafe/${o.slug}`;
      if (cp.home) out.push({ url: cb, changeFrequency: "weekly", priority: 0.8 });
      if (cp.order) out.push({ url: `${cb}/order`, changeFrequency: "daily", priority: 0.8 });
      if (cp.reserve) out.push({ url: `${cb}/reserve`, changeFrequency: "weekly", priority: 0.6 });
      if (cp.club) out.push({ url: `${cb}/roasting-club`, changeFrequency: "monthly", priority: 0.7 });
      if (cp.wholesale) out.push({ url: `${cb}/wholesale`, changeFrequency: "monthly", priority: 0.7 });
    }
    for (const o of (orgs ?? []) as { slug: string; settings: Record<string, unknown> | null }[]) {
      const ev = readEvents(o.settings);
      if (!ev.enabled) continue;
      const h = `${BASE}/hire/${o.slug}`;
      out.push({ url: h, changeFrequency: "weekly", priority: 0.9 });
      for (const k of offered(ev)) if (k !== "diy") out.push({ url: `${h}/${hirePageSlug(k, ev)}`, changeFrequency: "weekly", priority: 0.9 });
      for (const p of ["quote", "drinks", "branding", "catering"]) out.push({ url: `${h}/${p}`, changeFrequency: "weekly", priority: 0.7 });
    }
    // hire extras: coffee machine sales, repairs and printing
    for (const o of orgs as { slug: string; settings: Record<string, unknown> | null }[]) {
      if (!readEvents(o.settings).enabled) continue;
      const m = readMachines(o.settings);
      if (m.enabled) out.push({ url: `${BASE}/hire/${o.slug}/machines`, changeFrequency: "weekly", priority: 0.7 });
      if (m.serviceEnabled) out.push({ url: `${BASE}/hire/${o.slug}/repairs`, changeFrequency: "monthly", priority: 0.6 });
      if (readPrinting(o.settings).enabled) out.push({ url: `${BASE}/hire/${o.slug}/printing`, changeFrequency: "monthly", priority: 0.6 });
    }
    // online shops (coffee etc.) and their product pages
    for (const o of orgs as { id: string; slug: string; settings: Record<string, unknown> | null }[]) {
      if (!readShop(o.settings).enabled) continue;
      out.push({ url: `${BASE}/shop/${o.slug}`, changeFrequency: "daily", priority: 0.9 });
      const { data: ps, error } = await db.from("shop_products").select("slug").eq("organisation_id", o.id).eq("status", "active").not("slug", "is", null).limit(1000);
      if (!error) for (const p of (ps ?? []) as { slug: string }[]) out.push({ url: `${BASE}/shop/${o.slug}/p/${p.slug}`, changeFrequency: "weekly", priority: 0.8 });
    }
    // barista jobs boards (only where the business has set one up) and online academies
    for (const o of orgs as { slug: string; name?: string; settings: Record<string, unknown> | null }[]) {
      if (o.settings?.jobs && readJobSettings(o.settings, "").enabled) out.push({ url: `${BASE}/jobs/${o.slug}`, changeFrequency: "daily", priority: 0.7 });
      if (readLearnSettings(o.settings).enabled) out.push({ url: `${BASE}/academy/${o.slug}`, changeFrequency: "weekly", priority: 0.7 });
    }
    // online hire shops and their item pages
    const shops = ((orgs ?? []) as { id: string; slug: string; settings: Record<string, unknown> | null; app_access: string[] | null }[]).filter((o) => {
      const h = readHireSettings(o.settings);
      return h.shop.enabled && (Array.isArray(o.app_access) ? o.app_access.includes("rentals") : h.enabled);
    });
    for (const o of shops) {
      out.push({ url: `${BASE}/hire/${o.slug}/shop`, changeFrequency: "daily", priority: 0.9 });
      const { data: items, error } = await db.from("hire_items").select("slug, updated_at").eq("organisation_id", o.id).eq("active", true).eq("show_online", true).not("slug", "is", null).limit(2000);
      if (!error) for (const it of (items ?? []) as { slug: string; updated_at: string }[]) out.push({ url: `${BASE}/hire/${o.slug}/shop/${it.slug}`, lastModified: it.updated_at, changeFrequency: "weekly", priority: 0.8 });
    }
    const live = ((orgs ?? []) as { id: string; slug: string; settings: Record<string, unknown> | null }[])
      .filter((o) => !!o.settings?.booking && (o.settings.booking as { enabled?: boolean }).enabled !== false);
    if (!live.length) return out;
    const { data: courses } = await db.from("booking_courses").select("organisation_id, slug, updated_at").in("organisation_id", live.map((o) => o.id)).eq("active", true).eq("public", true);
    for (const o of live) {
      const mine = ((courses ?? []) as { organisation_id: string; slug: string; updated_at: string }[]).filter((c) => c.organisation_id === o.id);
      if (!mine.length) continue;
      out.push({ url: `${BASE}/book/${o.slug}`, changeFrequency: "daily", priority: 0.8 });
      for (const c of mine) out.push({ url: `${BASE}/book/${o.slug}/${c.slug}`, lastModified: c.updated_at, changeFrequency: "daily", priority: 0.7 });
    }
  } catch { /* sitemap still works without the booking pages */ }
  return out;
}
