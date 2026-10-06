import { NextResponse } from "next/server";
import { giftByToken, orgById } from "@/lib/bookings/server";
import { giftPdf } from "@/lib/bookings/gift-pdf";
import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";

/**
 * A gift certificate as a double-sided PDF to print at home (front artwork, back with the message and code).
 * The token is the long unguessable one from the gift's own page link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();
  const g = await giftByToken(token, db).catch(() => null);
  if (!g || (g.status !== "active" && g.status !== "redeemed")) return new NextResponse("Gift certificate not found", { status: 404 });
  try {
    const org = await orgById(db, g.organisation_id);
    const pdf = await giftPdf(org, g);
    if (!pdf) return new NextResponse("This business doesn't have a printable certificate design yet.", { status: 404 });
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(pdf.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${pdf.file}"`, "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("gift pdf", e);
    return new NextResponse("Couldn't make the certificate just now — please try again.", { status: 500 });
  }
}
