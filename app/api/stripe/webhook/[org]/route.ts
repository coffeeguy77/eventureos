import { NextResponse, type NextRequest } from "next/server";
import { handleStripeWebhook } from "@/lib/payments/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stripe → EventureOS. Each organisation adds https://…/api/stripe/webhook/<organisation id> in its own Stripe
 * dashboard (event: checkout.session.completed); the signature is checked with that organisation's signing secret.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const raw = await req.text();
  try {
    const result = await handleStripeWebhook(org, raw, req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[stripe/webhook] ${org}: ${msg}`);
    // 400 for bad signatures (Stripe shows it in the dashboard); 500 makes Stripe retry for anything else
    const bad = /signature|Missing Stripe|Malformed|not connected|Unknown organisation/i.test(msg);
    return NextResponse.json({ received: false, error: msg }, { status: bad ? 400 : 500 });
  }
}
