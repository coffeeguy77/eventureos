import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { certificateByToken, renderCertificate } from "@/lib/bookings/certificates";

export const dynamic = "force-dynamic";

/** A certificate as a PDF. The token is the unguessable one printed on the certificate's QR code. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();
  const c = await certificateByToken(token, db).catch(() => null);
  if (!c || c.status !== "issued") return new NextResponse("Certificate not found", { status: 404 });
  try {
    const { bytes } = await renderCertificate(db, c);
    const file = `${c.course_name} - ${c.person_name}`.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || c.number;
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${file}.pdf"`, "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("certificate pdf", e);
    return new NextResponse("Couldn't make the certificate just now — please try again.", { status: 500 });
  }
}
