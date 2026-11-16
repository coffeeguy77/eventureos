import { NextResponse, type NextRequest } from "next/server";
import { currentBroker, redeemBrokerLink } from "@/lib/loans/broker-auth";
import { logAccess } from "@/lib/loans/log";

export const dynamic = "force-dynamic";

/** The link in a broker's email: sign them in and take them to their loan files. */
export async function GET(request: NextRequest) {
  const r = await redeemBrokerLink(request.nextUrl.searchParams.get("t") ?? "");
  if (!r.ok) return NextResponse.redirect(new URL(`/broker?error=${encodeURIComponent(r.error)}`, request.url));
  const b = await currentBroker();
  if (b) await logAccess({ orgId: b.organisation_id, fileId: null, kind: "broker", name: b.name, email: b.email, action: "signed_in" });
  return NextResponse.redirect(new URL("/broker", request.url));
}
