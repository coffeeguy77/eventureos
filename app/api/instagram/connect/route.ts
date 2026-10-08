import { NextResponse, type NextRequest } from "next/server";
import { canManage, requireOrg } from "@/lib/context";
import { newNonce, signState, STATE_MAX_AGE_MS } from "@/lib/integrations/oauth";
import { igAuthorizeUrl, igMissingEnv, igRedirectUri } from "@/lib/cafe/instagram";

export const dynamic = "force-dynamic";
const COOKIE = "eos_oauth_instagram";

/** Start connecting Instagram (owners, admins and managers) — for the feed on the café page. */
export async function GET(request: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/website?tab=cafe&ig_error=${encodeURIComponent(msg)}`, request.url));
  const { org, role, user } = await requireOrg();
  if (!canManage(role)) return back("Only owners, admins and managers can connect Instagram.");
  const missing = igMissingEnv();
  if (missing.length) return back(`Connecting Instagram needs ${missing.join(", ")} set in the environment variables first.`);
  const nonce = newNonce();
  const state = signState({ p: "instagram", o: org.id, u: user.id, n: nonce, t: Date.now() });
  const res = NextResponse.redirect(igAuthorizeUrl(state, igRedirectUri(request.nextUrl.origin)));
  res.cookies.set(COOKIE, nonce, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/instagram", maxAge: Math.floor(STATE_MAX_AGE_MS / 1000) });
  return res;
}
