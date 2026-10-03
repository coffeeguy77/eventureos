import { NextResponse } from "next/server";
import { crewOrg } from "@/lib/crew/server";

/** Makes the staff app installable to a phone's home screen, opening straight into this organisation's staff app. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await crewOrg(slug);
  if (!org) return new NextResponse("Not found", { status: 404 });
  const colour = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  return NextResponse.json({
    id: `/crew/${slug}`,
    name: `${org.name} Staff`,
    short_name: org.name.length > 14 ? `${org.name.split(/\s+/)[0]} Staff` : org.name,
    description: `Shifts, job details and pay for ${org.name} staff.`,
    start_url: `/crew/${slug}`,
    scope: `/crew/${slug}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F7F9",
    theme_color: colour,
    icons: [
      { src: `/crew/${slug}/app-icon/192`, sizes: "192x192", type: "image/png" },
      { src: `/crew/${slug}/app-icon/512`, sizes: "512x512", type: "image/png" },
      { src: `/crew/${slug}/app-icon/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } });
}
