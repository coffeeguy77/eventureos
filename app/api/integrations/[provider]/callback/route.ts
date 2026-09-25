import { NextResponse, type NextRequest } from "next/server";
import { canManage, getContext } from "@/lib/context";
import { calendarListWithToken } from "@/lib/integrations/google-calendar";
import { gmailProfileWithToken } from "@/lib/integrations/gmail";
import { exchangeCode, expiresAt, oauthCookieName, scopesFor, verifyState } from "@/lib/integrations/oauth";
import { getProvider, isLiveProvider, redirectUri, type LiveProviderId } from "@/lib/integrations/registry";
import { xeroConnectionsWithToken } from "@/lib/integrations/xero";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: verify signed state + nonce cookie, exchange the code, identify the account
 * (Gmail address / Google primary calendar / Xero tenant via GET https://api.xero.com/connections),
 * then store it with rpc save_integration_connection (tokens go straight into integration_credentials).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const sp = request.nextUrl.searchParams;
  const cookieName = oauthCookieName(provider);
  const finish = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.set(cookieName, "", { path: "/api/integrations", maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => finish(`/settings/integrations?error=${encodeURIComponent(msg)}`);
  if (!isLiveProvider(provider)) return fail("Unknown integration.");
  const name = getProvider(provider)!.name;

  const oauthError = sp.get("error");
  if (oauthError) {
    return fail(oauthError === "access_denied" ? `${name} wasn't connected — access was declined.` : `${name} returned an error: ${sp.get("error_description") ?? oauthError}`);
  }

  try {
    const state = verifyState(sp.get("state"));
    if (state.p !== provider) throw new Error("The sign-in response was for a different integration.");
    const [nonce, verifier] = (request.cookies.get(cookieName)?.value ?? "").split(".");
    if (!nonce || nonce !== state.n) throw new Error("This connection attempt was started in another browser or has expired. Please try again.");

    const ctx = await getContext();
    if (ctx.user.id !== state.u) throw new Error("You're signed in as a different user than the one who started connecting.");
    const membership = ctx.memberships.find((m) => m.organisation.id === state.o);
    if (!membership || !canManage(membership.role)) throw new Error("Only owners, admins and managers can connect integrations.");

    const code = sp.get("code");
    if (!code) throw new Error(`${name} didn't return an authorisation code.`);
    const tokens = await exchangeCode(provider, code, redirectUri(provider, request.nextUrl.origin), verifier || undefined);
    if (!tokens.refresh_token) {
      throw new Error(`${name} didn't grant offline access, so EventureOS couldn't keep syncing. Remove EventureOS from your account's third-party access and connect again.`);
    }

    const identity = await identify(provider, tokens.access_token);
    const { error } = await ctx.supabase.rpc("save_integration_connection", {
      p_org: state.o,
      p_provider: provider,
      p_account_label: identity.label,
      p_external_account_id: identity.externalId,
      p_scopes: tokens.scope ? tokens.scope.split(/\s+/) : scopesFor(provider),
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_at: expiresAt(tokens),
      p_settings: identity.settings,
    });
    if (error) throw new Error(`Couldn't save the connection: ${error.message}`);
    return finish(`/settings/integrations/${provider}?connected=1`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : `Couldn't connect ${name}.`);
  }
}

async function identify(provider: LiveProviderId, accessToken: string): Promise<{ label: string; externalId: string; settings: Record<string, unknown> }> {
  if (provider === "gmail") {
    const p = await gmailProfileWithToken(accessToken);
    // reset the incremental pointer: the next sync scans the last 14 days (existing messages are skipped)
    return { label: p.emailAddress, externalId: p.emailAddress.toLowerCase(), settings: { history_id: null } };
  }
  if (provider === "google_calendar") {
    const cals = await calendarListWithToken(accessToken);
    const primary = cals.find((c) => c.primary) ?? cals[0];
    if (!primary) throw new Error("No writable Google calendars were found on this account.");
    return {
      label: primary.id, externalId: primary.id,
      settings: { calendars: cals.map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary, backgroundColor: c.backgroundColor })), calendars_fetched_at: new Date().toISOString() },
    };
  }
  const conns = (await xeroConnectionsWithToken(accessToken)).filter((c) => c.tenantType === "ORGANISATION");
  if (!conns.length) throw new Error("No Xero organisation was authorised. Choose an organisation on the Xero consent screen.");
  const chosen = conns[0];
  return {
    label: chosen.tenantName ?? "Xero organisation", externalId: chosen.tenantId,
    settings: {
      tenant_id: chosen.tenantId, tenant_name: chosen.tenantName, tenants: conns.map((c) => ({ tenantId: c.tenantId, tenantName: c.tenantName, connectionId: c.id })),
      contacts_synced_at: null, invoices_synced_at: null, payments_synced_at: null,
    },
  };
}
