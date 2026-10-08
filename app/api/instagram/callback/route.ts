import { NextResponse, type NextRequest } from "next/server";
import { canManage, getContext } from "@/lib/context";
import { verifyState } from "@/lib/integrations/oauth";
import { IG_PROVIDER, igExchange, igRedirectUri } from "@/lib/cafe/instagram";

export const dynamic = "force-dynamic";
const COOKIE = "eos_oauth_instagram";

/** Instagram sign-in callback: verify state + nonce, swap the code for a 60-day token, save it as the "instagram" integration. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const finish = (q: string) => {
    const res = NextResponse.redirect(new URL(`/website?tab=cafe&${q}`, request.url));
    res.cookies.set(COOKIE, "", { path: "/api/instagram", maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => finish(`ig_error=${encodeURIComponent(msg)}`);
  if (sp.get("error")) return fail(sp.get("error_reason") === "user_denied" || sp.get("error") === "access_denied" ? "Instagram wasn't connected — access was declined." : `Instagram returned an error: ${sp.get("error_description") ?? sp.get("error")}`);
  try {
    const state = verifyState(sp.get("state"));
    if (state.p !== "instagram") throw new Error("The response was for a different integration.");
    if (!state.n || request.cookies.get(COOKIE)?.value !== state.n) throw new Error("This connection was started in another browser or has expired. Please try again.");
    const ctx = await getContext();
    if (ctx.user.id !== state.u) throw new Error("You're signed in as a different user than the one who started connecting.");
    const membership = ctx.memberships.find((m) => m.organisation.id === state.o);
    if (!membership || !canManage(membership.role)) throw new Error("Only owners, admins and managers can connect Instagram.");
    const code = (sp.get("code") ?? "").replace(/#_$/, "");
    if (!code) throw new Error("Instagram didn't return an authorisation code.");
    const t = await igExchange(code, igRedirectUri(request.nextUrl.origin));
    const { error } = await ctx.supabase.rpc("save_integration_connection", {
      p_org: state.o, p_provider: IG_PROVIDER, p_account_label: t.username ? `@${t.username}` : "Instagram", p_external_account_id: t.userId,
      p_scopes: ["instagram_business_basic"], p_access_token: t.token, p_refresh_token: null, p_expires_at: t.expiresAt,
      p_settings: { username: t.username, feed: [], feed_at: null },
    });
    if (error) throw new Error(`Couldn't save the connection: ${error.message}`);
    return finish("ig_connected=1");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't connect Instagram.");
  }
}
