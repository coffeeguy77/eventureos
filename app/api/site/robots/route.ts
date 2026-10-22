import { NextResponse, type NextRequest } from "next/server";
import { publicOrg } from "@/lib/bookings/server";
import { readSite } from "@/lib/site/site";

export const dynamic = "force-dynamic";

/** robots.txt for a business's own domain. */
export async function GET(req: NextRequest) {
  const org = await publicOrg(req.nextUrl.searchParams.get("org") ?? "");
  if (!org) return new NextResponse("Not found", { status: 404 });
  const site = readSite(org.rawSettings);
  const base = site.domain ? `https://${site.domain}` : req.nextUrl.origin;
  const body = ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /p/", "Disallow: /pay/", "Disallow: /q/", "Disallow: /order/", "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
