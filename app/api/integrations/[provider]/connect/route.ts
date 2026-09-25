import { NextResponse, type NextRequest } from "next/server";
import { canManage, requireOrg } from "@/lib/context";
import { buildAuthorizeUrl, newCodeVerifier, newNonce, oauthCookieName, OAUTH, signState, STATE_MAX_AGE_MS } from "@/lib/integrations/oauth";
import { isLiveProvider, missingEnv, redirectUri } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/** Start OAuth: managers only. Redirects to Google / Xero consent. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent(msg)}`, request.url));
  if (!isLiveProvider(provider)) return back("That integration isn't available yet.");

  const { org, role, user } = await requireOrg();
  if (!canManage(role)) return back("Only owners, admins and managers can connect integrations.");
  const missing = missingEnv(provider);
  if (missing.length) return back(`Connecting is disabled until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set in the environment variables.`);

  try {
    const nonce = newNonce();
    const verifier = OAUTH[provider].pkce ? newCodeVerifier() : "";
    const state = signState({ p: provider, o: org.id, u: user.id, n: nonce, t: Date.now() });
    const url = buildAuthorizeUrl(provider, { redirectUri: redirectUri(provider, request.nextUrl.origin), state, codeVerifier: verifier || undefined });
    const res = NextResponse.redirect(url);
    res.cookies.set(oauthCookieName(provider), `${nonce}.${verifier}`, {
      httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
      path: "/api/integrations", maxAge: Math.floor(STATE_MAX_AGE_MS / 1000),
    });
    return res;
  } catch (e) {
    return back(e instanceof Error ? e.message : "Couldn't start the connection.");
  }
}
