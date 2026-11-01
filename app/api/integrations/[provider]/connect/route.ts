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

  const { org, role, user, supabase } = await requireOrg();
  if (!canManage(role)) return back("Only owners, admins and managers can connect integrations.");
  const missing = missingEnv(provider);
  if (missing.length) return back(`Connecting is disabled until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set in the environment variables.`);

  try {
    const nonce = newNonce();
    const verifier = OAUTH[provider].pkce ? newCodeVerifier() : "";
    const state = signState({ p: provider, o: org.id, u: user.id, n: nonce, t: Date.now() });
    // Xero Payroll (café roster timesheets) is asked for only when switched on, and kept on every reconnect after that
    let extraScopes: string[] | undefined;
    if (provider === "xero") {
      const { PAYROLL_SCOPES } = await import("@/lib/integrations/xero-payroll");
      const { data: cur } = await supabase.from("integrations").select("scopes").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle();
      const had = Array.isArray(cur?.scopes) && (cur!.scopes as string[]).some((x) => x.startsWith("payroll."));
      const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
      const st = (o?.settings ?? {}) as Record<string, unknown>;
      const roster = (st.roster ?? {}) as Record<string, unknown>;
      const ask = request.nextUrl.searchParams.get("payroll") === "1";
      if (ask && roster.payroll_off) await supabase.from("organisations").update({ settings: { ...st, roster: { ...roster, payroll_off: false } } }).eq("id", org.id);
      if (ask || (had && !roster.payroll_off)) extraScopes = PAYROLL_SCOPES;
    }
    const url = buildAuthorizeUrl(provider, { redirectUri: redirectUri(provider, request.nextUrl.origin), state, codeVerifier: verifier || undefined, extraScopes });
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
