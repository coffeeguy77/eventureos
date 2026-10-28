import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { publicOrg } from "@/lib/bookings/server";
import { readSite } from "@/lib/site/site";
import { newPages } from "@/lib/site/pages";
import { agencyMode } from "@/lib/site/agency/server";
import { AGENCY_PAGES } from "@/lib/site/agency/content";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** sitemap.xml for a business's own domain: every page it has switched on, its courses and its coffee. */
export async function GET(req: NextRequest) {
  const org = await publicOrg(req.nextUrl.searchParams.get("org") ?? "");
  if (!org) return new NextResponse("Not found", { status: 404 });
  const site = readSite(org.rawSettings);
  const base = site.domain ? `https://${site.domain}` : `${req.nextUrl.origin}`;
  const paths = newPages(org.rawSettings, org.name).filter((p) => p.path !== "/hire/quote").map((p) => p.path);
  const db = createServiceClient();
  const [{ data: courses }, { data: products }] = await Promise.all([
    db.from("booking_courses").select("slug").eq("organisation_id", org.id).eq("active", true).eq("public", true),
    db.from("shop_products").select("slug").eq("organisation_id", org.id).eq("status", "active").then((r) => r, () => ({ data: null })),
  ]);
  if (paths.includes("/classes")) for (const c of (courses ?? []) as { slug: string }[]) paths.push(`/book/${c.slug}`);
  if (await agencyMode(org.slug)) paths.push("/", ...AGENCY_PAGES.map((p) => `/${p}`)); // web/IT agency pages
  if (paths.includes("/shop")) for (const p of (products ?? []) as { slug: string | null }[]) if (p.slug) paths.push(`/shop/p/${p.slug}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)].map((p) => `  <url><loc>${esc(base + p)}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new NextResponse(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
