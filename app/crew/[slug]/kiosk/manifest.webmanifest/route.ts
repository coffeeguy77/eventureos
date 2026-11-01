import { NextResponse, type NextRequest } from "next/server";
import { crewOrg } from "@/lib/crew/server";

/** The café iPad's home-screen app: opens straight into the clock-on screen (its secret link included). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await crewOrg(slug);
  if (!org) return new NextResponse("Not found", { status: 404 });
  const k = (req.nextUrl.searchParams.get("k") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const colour = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  return NextResponse.json({
    id: `/crew/${slug}/kiosk`, name: `${org.name} Clock on`, short_name: "Clock on",
    start_url: `/crew/${slug}/kiosk?k=${k}`, scope: `/crew/${slug}/kiosk`, display: "standalone", orientation: "any",
    background_color: "#F7F7F9", theme_color: colour,
    icons: [{ src: `/crew/${slug}/app-icon/192`, sizes: "192x192", type: "image/png" }, { src: `/crew/${slug}/app-icon/512`, sizes: "512x512", type: "image/png" }],
  }, { headers: { "content-type": "application/manifest+json", "cache-control": "private, no-store" } });
}
