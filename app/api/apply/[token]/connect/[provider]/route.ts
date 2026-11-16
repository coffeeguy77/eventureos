import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, newCodeVerifier, newNonce, oauthCookieName, OAUTH, signState, STATE_MAX_AGE_MS } from "@/lib/integrations/oauth";
import { missingEnv, redirectUri } from "@/lib/integrations/registry";
import { LOAN_SCOPES, openLink, serviceDb } from "@/lib/loans/server";

export const dynamic = "force-dynamic";

/**
 * A loan client connects their own Xero or Gmail (read only) from their application link — no EventureOS account.
 * The signed state carries the loan file; the callback (the normal Xero/Gmail return address) saves it to that file.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; provider: string }> }) {
  const { token, provider: which } = await params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/apply/${encodeURIComponent(token)}?step=connect&error=${encodeURIComponent(msg)}`, request.url));
  if (which !== "xero" && which !== "gmail") return back("That connection isn't available.");
  const provider = which === "xero" ? "xero" : "gmail2";
  const link = await openLink(serviceDb(), token);
  if (!link) return NextResponse.redirect(new URL(`/apply/${encodeURIComponent(token)}`, request.url));
  // the return from Xero/Google lands on the main application link, so only the first applicant connects accounts
  if (link.me !== 1) return back("Xero and Gmail are connected from the first applicant's link — upload your documents here instead.");
  const file = link.file;
  const missing = missingEnv(provider);
  if (missing.length) return back(`${which === "xero" ? "Xero" : "Gmail"} connecting isn't set up yet — upload the documents instead.`);
  try {
    const nonce = newNonce();
    const verifier = OAUTH[provider].pkce ? newCodeVerifier() : "";
    const state = signState({ p: provider, o: file.organisation_id, u: "loan-client", n: nonce, t: Date.now(), l: file.id });
    const url = buildAuthorizeUrl(provider, { redirectUri: redirectUri(provider, request.nextUrl.origin), state, codeVerifier: verifier || undefined, scopes: LOAN_SCOPES[which] });
    const res = NextResponse.redirect(url);
    res.cookies.set(oauthCookieName(provider), `${nonce}.${verifier}`, {
      httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/integrations", maxAge: Math.floor(STATE_MAX_AGE_MS / 1000),
    });
    return res;
  } catch (e) {
    return back(e instanceof Error ? e.message : "Couldn't start connecting.");
  }
}
