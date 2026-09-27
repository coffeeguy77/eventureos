import { NextResponse, type NextRequest } from "next/server";
import { handlePlatformWebhook } from "@/lib/payments/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stripe Connect webhook for EventureOS's platform account — one endpoint for all connected businesses.
 * In Stripe (platform) → Developers → Webhooks: "Events on Connected accounts",
 * events checkout.session.completed, checkout.session.async_payment_succeeded, account.application.deauthorized.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  try {
    const result = await handlePlatformWebhook(raw, req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[stripe/webhook] platform: ${msg}`);
    const bad = /signature|Missing Stripe|Malformed|isn't set/i.test(msg);
    return NextResponse.json({ received: false, error: msg }, { status: bad ? 400 : 500 });
  }
}
