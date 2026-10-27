import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 1×1 transparent GIF
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open tracking for Accounts chasing emails. Always answers with the image, whatever happens. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try { const { recordCollectionOpen } = await import("@/lib/accounts/track"); await recordCollectionOpen(id); } catch { /* never break the image */ }
  }
  return new NextResponse(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0", "content-length": String(GIF.length) } });
}
