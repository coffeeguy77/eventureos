import { ImageResponse } from "next/og";
import { crewOrg } from "@/lib/crew/server";

/** The staff app's home-screen icon: the business's initials on its brand colour. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size } = await params;
  const px = size === "180" ? 180 : size === "192" ? 192 : 512;
  const org = await crewOrg(slug);
  const colour = /^#[0-9a-f]{6}$/i.test(org?.brand_colour ?? "") ? org!.brand_colour! : "#6028EC";
  const initials = (org?.name ?? "Staff").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: colour, color: "white" }}>
        <div style={{ fontSize: px * 0.38, fontWeight: 700, letterSpacing: -px * 0.01, lineHeight: 1 }}>{initials}</div>
        <div style={{ fontSize: px * 0.1, fontWeight: 600, marginTop: px * 0.04, opacity: 0.85, letterSpacing: px * 0.01 }}>STAFF</div>
      </div>
    ),
    { width: px, height: px, headers: { "cache-control": "public, max-age=86400" } },
  );
}
