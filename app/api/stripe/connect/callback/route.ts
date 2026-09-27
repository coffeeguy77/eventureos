import { NextResponse, type NextRequest } from "next/server";
import { canManage, getContext } from "@/lib/context";
import { verifyState } from "@/lib/integrations/oauth";
import { platformStripe } from "@/lib/payments/service";
import { connectExchange, getAccount } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";
const COOKIE = "eos_oauth_stripe";

/** Stripe Connect callback: verify state + nonce, exchange the code for the account id, save the connection. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const finish = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations/stripe?${q}`, request.url));
    res.cookies.set(COOKIE, "", { path: "/api/stripe/connect", maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => finish(`error=${encodeURIComponent(msg)}`);
  if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "Stripe wasn't connected — access was declined." : `Stripe returned an error: ${sp.get("error_description") ?? sp.get("error")}`);

  try {
    const state = verifyState(sp.get("state"));
    if (state.p !== "stripe") throw new Error("The response was for a different integration.");
    if (!state.n || request.cookies.get(COOKIE)?.value !== state.n) throw new Error("This connection was started in another browser or has expired. Please try again.");
    const ctx = await getContext();
    if (ctx.user.id !== state.u) throw new Error("You're signed in as a different user than the one who started connecting.");
    const membership = ctx.memberships.find((m) => m.organisation.id === state.o);
    if (!membership || !canManage(membership.role)) throw new Error("Only owners, admins and managers can connect Stripe.");

    const p = platformStripe();
    if (!p.key) throw new Error("STRIPE_SECRET_KEY isn't set.");
    const code = sp.get("code");
    if (!code) throw new Error("Stripe didn't return an authorisation code.");
    const tok = await connectExchange(p.key, code);
    const acct = await getAccount(p.key, tok.stripe_user_id).catch(() => null);
    const name = acct?.settings?.dashboard?.display_name || acct?.business_profile?.name || acct?.email || tok.stripe_user_id;
    const mode = tok.livemode ? "live" : "test";

    const { data: cur } = await ctx.supabase.from("integrations").select("settings").eq("organisation_id", state.o).eq("provider", "stripe").maybeSingle();
    const { error } = await ctx.supabase.rpc("save_integration_connection", {
      p_org: state.o, p_provider: "stripe", p_account_label: `${name}${mode === "test" ? " (test mode)" : ""}`, p_external_account_id: tok.stripe_user_id,
      p_scopes: [tok.scope], p_access_token: `connect:${tok.stripe_user_id}`, p_refresh_token: null, p_expires_at: null,
      p_settings: { ...((cur?.settings as Record<string, unknown>) ?? {}), connect: true, mode, account_name: name },
    });
    if (error) throw new Error(`Couldn't save the connection: ${error.message}`);
    return finish(`connected=1${acct && acct.charges_enabled === false ? "&setup=1" : ""}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't connect Stripe.");
  }
}
