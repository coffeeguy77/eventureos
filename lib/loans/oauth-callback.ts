import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, expiresAt, verifyState, type OAuthState } from "@/lib/integrations/oauth";
import { redirectUri } from "@/lib/integrations/registry";
import { gmailProfileWithToken } from "@/lib/integrations/gmail";
import { xeroConnectionsWithToken } from "@/lib/integrations/xero";
import { todayISO } from "@/lib/format";
import { pullXero, scanGmail, serviceDb, FILE_COLS, type LoanFileRow } from "./server";

/**
 * The return from Xero / Google when a loan client connected their own account (state.l = the loan file).
 * Saves the connection to the file, then straight away pulls the Xero reports (and lets go of Xero again, so no
 * standing access is kept) or looks through Gmail for the documents asked for. Back to their link either way.
 */
export async function loanOAuthCallback(request: NextRequest, provider: "xero" | "gmail2", cookieName: string): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const db = serviceDb();
  let state: OAuthState;
  try { state = verifyState(sp.get("state")); } catch (e) { return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect.")}`, request.url)); }
  const { data } = await db.from("loan_files").select(FILE_COLS).eq("id", state.l!).maybeSingle();
  const file = data as LoanFileRow | null;
  const name = provider === "xero" ? "Xero" : "Gmail";
  const finish = (q: string) => {
    const res = NextResponse.redirect(new URL(file ? `/apply/${encodeURIComponent(file.token)}?step=connect&${q}` : "/", request.url));
    res.cookies.set(cookieName, "", { path: "/api/integrations", maxAge: 0 });
    return res;
  };
  if (!file || file.status === "closed") return finish("error=" + encodeURIComponent("This application link isn't active any more."));
  if (sp.get("error")) return finish("error=" + encodeURIComponent(sp.get("error") === "access_denied" ? `${name} wasn't connected — you said no, which is fine.` : `${name} returned an error.`));
  try {
    if (state.p !== provider) throw new Error("The sign-in response was for a different connection.");
    const [nonce, verifier] = (request.cookies.get(cookieName)?.value ?? "").split(".");
    if (!nonce || nonce !== state.n) throw new Error("This was started in another browser or took too long — please try again.");
    const code = sp.get("code"); if (!code) throw new Error(`${name} didn't return a code.`);
    const tokens = await exchangeCode(provider, code, redirectUri(provider, request.nextUrl.origin), verifier || undefined);

    let label = "", external = "", data: Record<string, unknown> = {};
    if (provider === "xero") {
      // only the organisations chosen just now (the same Xero login may also be connected for other things)
      const ev = jwtClaim(tokens.access_token, "authentication_event_id");
      const cons = await xeroConnectionsWithToken(tokens.access_token);
      const orgs = cons.filter((c) => c.tenantType === "ORGANISATION" && (!ev || (c as { authEventId?: string }).authEventId === ev));
      if (!orgs.length) throw new Error("No Xero organisation was chosen.");
      label = orgs.map((c) => c.tenantName).join(", ").slice(0, 250); external = orgs.map((c) => c.tenantId).sort().join(",").slice(0, 250);
      data = { tenants: orgs.map((c) => ({ id: c.tenantId, name: c.tenantName, connectionId: c.id })) };
    } else {
      const p = await gmailProfileWithToken(tokens.access_token);
      label = p.emailAddress; external = p.emailAddress.toLowerCase();
    }
    const kind = provider === "xero" ? "xero" : "gmail";
    const { data: conn, error } = await db.from("loan_connections").upsert({
      organisation_id: file.organisation_id, file_id: file.id, provider: kind, account_label: label, external_id: external, status: "connected", data, error: null, connected_at: new Date().toISOString(),
    }, { onConflict: "file_id,provider,external_id" }).select("id").single();
    if (error || !conn) throw new Error(`Couldn't save the connection: ${error?.message ?? "unknown"}`);
    await db.from("loan_credentials").upsert({ connection_id: conn.id, access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null, expires_at: expiresAt(tokens), updated_at: new Date().toISOString() });
    await db.from("loan_messages").insert({ organisation_id: file.organisation_id, file_id: file.id, from_side: "system", body: `${name} connected (${label}).` });

    if (provider === "xero") {
      const { data: org } = await db.from("organisations").select("timezone").eq("id", file.organisation_id).single();
      try {
        const n = await pullXero(db, file, conn.id, todayISO(org?.timezone ?? "Australia/Sydney"));
        await db.from("loan_messages").insert({ organisation_id: file.organisation_id, file_id: file.id, from_side: "system", body: `Xero: ${n} year${n === 1 ? "" : "s"} of profit and loss and balance sheet added.` });
      } finally {
        // let go of Xero once the reports are in: nothing standing is kept, and it frees the connection
        await releaseXero(db, conn.id, tokens.access_token);
      }
      return finish("connected=xero");
    }
    const found = await scanGmail(db, file, conn.id);
    return finish(`connected=gmail&found=${found.length}`);
  } catch (e) {
    return finish("error=" + encodeURIComponent(e instanceof Error ? e.message : `Couldn't connect ${name}.`));
  }
}

/** Disconnect the client's Xero (DELETE /connections/{id}) and forget the tokens; the pulled reports stay. */
export async function releaseXero(db: ReturnType<typeof serviceDb>, connId: string, accessToken?: string) {
  const { data: conn } = await db.from("loan_connections").select("id, data").eq("id", connId).maybeSingle();
  const tenants = (((conn?.data ?? {}) as { tenants?: { connectionId?: string }[] }).tenants ?? []);
  let token = accessToken;
  if (!token) { const { data: c } = await db.from("loan_credentials").select("access_token").eq("connection_id", connId).maybeSingle(); token = c?.access_token as string | undefined; }
  // never disconnect an organisation a business uses for its own Xero sync (same Xero login) — only forget our tokens
  const { data: own } = await db.from("integrations").select("external_account_id").eq("provider", "xero");
  const keep = new Set((own ?? []).map((r) => String(r.external_account_id ?? "")));
  if (token) for (const t of tenants as { id?: string; connectionId?: string }[]) if (t.connectionId && !keep.has(String(t.id))) await fetch(`https://api.xero.com/connections/${t.connectionId}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  await db.from("loan_credentials").delete().eq("connection_id", connId);
  await db.from("loan_connections").update({ status: "disconnected" }).eq("id", connId);
}

/** A claim from a JWT access token (not verified — only used to narrow what we just got from Xero itself). */
function jwtClaim(token: string, claim: string): string | null {
  try { const v = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"))[claim]; return typeof v === "string" ? v : null; } catch { return null; }
}
