import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { STATE_SECRET_ENV, type LiveProviderId } from "@/lib/integrations/registry";

/**
 * OAuth 2.0 authorization-code flow for Google (Gmail, Google Calendar) and Xero.
 *
 * Google — https://developers.google.com/identity/protocols/oauth2/web-server
 *   authorize: https://accounts.google.com/o/oauth2/v2/auth  (client_id, redirect_uri, response_type=code, scope,
 *              access_type=offline, prompt=consent, state, login_hint)
 *   token:     https://oauth2.googleapis.com/token  (form: client_id, client_secret, code, grant_type, redirect_uri /
 *              refresh_token + grant_type=refresh_token) → { access_token, expires_in, refresh_token, scope, token_type }
 *   revoke:    https://oauth2.googleapis.com/revoke  (form: token)
 *   PKCE (code_challenge / code_challenge_method=S256 / code_verifier) is documented for Google's authorization
 *   server at https://developers.google.com/identity/protocols/oauth2/native-app — we use it in addition to the secret.
 *
 * Xero — endpoints from Xero's official OpenAPI spec (securitySchemes)
 *   https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml
 *   authorize: https://login.xero.com/identity/connect/authorize
 *   token:     https://identity.xero.com/connect/token  (Authorization: Basic base64(client_id:client_secret);
 *              form: grant_type=authorization_code, code, redirect_uri / grant_type=refresh_token, refresh_token).
 *              Refresh tokens ROTATE on every refresh — always store the new one.
 *   Guide: https://developer.xero.com/documentation/guides/oauth2/auth-flow/
 *   PKCE in Xero is a separate flow for apps without a client secret, so the confidential web flow doesn't use it.
 */

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  pkce: boolean;
  /** How the client authenticates at the token endpoint. */
  tokenAuth: "body" | "basic";
  extraAuthParams?: Record<string, string>;
}

/*
 * Scopes (least privilege):
 *  Gmail:
 *    gmail.readonly — read messages/threads/history for sync (https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
 *    gmail.send     — send replies (https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
 *    (gmail.modify is NOT requested: EventureOS never changes labels or deletes mail.)
 *  Google Calendar:
 *    calendar.calendarlist.readonly — list the user's calendars so admins can choose (calendarList.list)
 *    calendar.events                — create/update events and read busy events (events.insert/patch/list)
 *  Xero (granular scopes; apps created on/after 2 Mar 2026 can only use these —
 *        https://devblog.xero.com/upcoming-changes-to-xero-accounting-api-scopes-705c5a9621a0):
 *    offline_access            — refresh tokens
 *    accounting.contacts       — read contacts for matching; create a contact when pushing an invoice
 *    accounting.invoices       — read invoices + credit notes; create invoices
 *    accounting.payments.read  — read payments (Xero stays authoritative for payment status)
 *  Override with XERO_SCOPES (space separated) if your Xero app predates granular scopes.
 */
export const OAUTH: Record<LiveProviderId, OAuthProviderConfig> = {
  gmail: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    pkce: true, tokenAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  google_calendar: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"],
    pkce: true, tokenAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  xero: {
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    clientIdEnv: "XERO_CLIENT_ID", clientSecretEnv: "XERO_CLIENT_SECRET",
    scopes: ["offline_access", "accounting.contacts", "accounting.invoices", "accounting.payments.read"],
    pkce: false, tokenAuth: "basic",
  },
};

export function scopesFor(provider: LiveProviderId) {
  if (provider === "xero" && process.env.XERO_SCOPES?.trim()) return process.env.XERO_SCOPES.trim().split(/\s+/);
  return OAUTH[provider].scopes;
}

// ------------------------------------------------------------------------------------------------
// Signed state (HMAC-SHA256) + PKCE
// ------------------------------------------------------------------------------------------------

export function stateSecret(): string | null {
  for (const k of STATE_SECRET_ENV) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export interface OAuthState {
  p: LiveProviderId; // provider
  o: string;         // organisation id
  u: string;         // user id who started the flow
  n: string;         // nonce (also stored in an httpOnly cookie)
  t: number;         // issued at (ms)
}

export const STATE_MAX_AGE_MS = 15 * 60 * 1000;
export const oauthCookieName = (provider: string) => `eos_oauth_${provider}`;

export function signState(s: OAuthState): string {
  const secret = stateSecret();
  if (!secret) throw new Error("Connecting is disabled until OAUTH_STATE_SECRET (or CRON_SECRET) is set.");
  const body = b64url(Buffer.from(JSON.stringify(s)));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(raw: string | null): OAuthState {
  const secret = stateSecret();
  if (!secret) throw new Error("OAUTH_STATE_SECRET (or CRON_SECRET) is not set.");
  if (!raw || !raw.includes(".")) throw new Error("The sign-in response was missing its security token. Please try connecting again.");
  const [body, sig] = raw.split(".");
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("The sign-in response could not be verified. Please try connecting again.");
  const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (Date.now() - s.t > STATE_MAX_AGE_MS) throw new Error("The connection attempt expired. Please try again.");
  return s;
}

export function newNonce() {
  return b64url(randomBytes(18));
}
/** RFC 7636 verifier: 43–128 chars of unreserved characters. */
export function newCodeVerifier() {
  return b64url(randomBytes(48)); // 64 chars
}
export function codeChallengeS256(verifier: string) {
  return b64url(createHash("sha256").update(verifier).digest());
}

// ------------------------------------------------------------------------------------------------
// Authorization URL, code exchange, refresh
// ------------------------------------------------------------------------------------------------

export function clientCredentials(provider: LiveProviderId) {
  const cfg = OAUTH[provider];
  const id = process.env[cfg.clientIdEnv]?.trim();
  const secret = process.env[cfg.clientSecretEnv]?.trim();
  if (!id || !secret) throw new Error(`${provider === "xero" ? "Xero" : "Google"} isn't set up yet: add ${cfg.clientIdEnv} and ${cfg.clientSecretEnv} to the environment variables.`);
  return { id, secret };
}

export function buildAuthorizeUrl(provider: LiveProviderId, opts: { redirectUri: string; state: string; codeVerifier?: string; loginHint?: string }) {
  const cfg = OAUTH[provider];
  const { id } = clientCredentials(provider);
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", scopesFor(provider).join(" "));
  u.searchParams.set("state", opts.state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) u.searchParams.set(k, v);
  if (opts.loginHint && provider !== "xero") u.searchParams.set("login_hint", opts.loginHint);
  if (cfg.pkce && opts.codeVerifier) {
    u.searchParams.set("code_challenge", codeChallengeS256(opts.codeVerifier));
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function tokenRequest(provider: LiveProviderId, params: Record<string, string>): Promise<TokenSet> {
  const cfg = OAUTH[provider];
  const { id, secret } = clientCredentials(provider);
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (cfg.tokenAuth === "basic") headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  else { body.set("client_id", id); body.set("client_secret", secret); }
  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body, cache: "no-store" });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* keep text for the error */ }
  if (!res.ok || typeof json.access_token !== "string") {
    const why = (json.error_description ?? json.error ?? text.slice(0, 200)) as string;
    const err = new Error(`${provider === "xero" ? "Xero" : "Google"} token request failed (${res.status}): ${why}`);
    (err as Error & { oauthError?: string }).oauthError = typeof json.error === "string" ? json.error : undefined;
    throw err;
  }
  return json as unknown as TokenSet;
}

export function exchangeCode(provider: LiveProviderId, code: string, redirectUri: string, codeVerifier?: string) {
  const p: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri };
  if (OAUTH[provider].pkce && codeVerifier) p.code_verifier = codeVerifier;
  return tokenRequest(provider, p);
}

export function refreshAccessToken(provider: LiveProviderId, refreshToken: string) {
  return tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Best-effort revoke on disconnect (Google only; Xero connections are removed via DELETE /connections/{id}). */
export async function revokeGoogleToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }),
    });
  } catch { /* ignore — disconnect still removes our copy of the tokens */ }
}

export function expiresAt(t: TokenSet) {
  return new Date(Date.now() + Math.max(60, (t.expires_in ?? 1800) - 60) * 1000).toISOString();
}
