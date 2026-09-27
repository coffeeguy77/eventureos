import { NextResponse, type NextRequest } from "next/server";
import { canManage, requireOrg } from "@/lib/context";
import { newNonce, signState, STATE_MAX_AGE_MS } from "@/lib/integrations/oauth";
import { appBaseUrl } from "@/lib/integrations/registry";
import { platformStripe } from "@/lib/payments/service";
import { connectAuthorizeUrl } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";
const COOKIE = "eos_oauth_stripe";

/** Start Stripe Connect: the business signs in to Stripe (or creates an account) and approves EventureOS. */
export async function GET(request: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings/integrations/stripe?error=${encodeURIComponent(msg)}`, request.url));
  const { org, role, user, supabase } = await requireOrg();
  if (!canManage(role)) return back("Only owners, admins and managers can connect Stripe.");
  const p = platformStripe();
  if (!p.ready) return back(`Stripe Connect isn't set up on EventureOS yet (${p.missing.join(", ")}).`);
  try {
    const nonce = newNonce();
    const state = signState({ p: "stripe", o: org.id, u: user.id, n: nonce, t: Date.now() });
    const { data: o } = await supabase.from("organisations").select("name, contact_email, website").eq("id", org.id).maybeSingle();
    const url = connectAuthorizeUrl({
      clientId: p.clientId!, state, redirectUri: `${appBaseUrl()}/api/stripe/connect/callback`,
      email: (o?.contact_email as string | null) ?? user.email ?? null, businessName: (o?.name as string | null) ?? org.name,
      url: (o as { website?: string | null } | null)?.website ?? null, country: "AU",
    });
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/stripe/connect", maxAge: Math.floor(STATE_MAX_AGE_MS / 1000) });
    return res;
  } catch (e) {
    return back(e instanceof Error ? e.message : "Couldn't start connecting Stripe.");
  }
}
