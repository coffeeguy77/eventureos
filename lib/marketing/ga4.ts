import "server-only";
import { createSign } from "crypto";

/**
 * Minimal Google Analytics 4 Data API client.
 *
 * Reads one Google service-account key (set once in Vercel as GA4_SERVICE_ACCOUNT_JSON) and uses it to read any GA4
 * property that has added the service account's email as a Viewer. No npm dependency: the service-account JWT is
 * signed with Node's built-in crypto and exchanged for a short-lived access token, which is cached in memory.
 *
 * This is a platform credential (like ANTHROPIC_API_KEY), not a per-user token, so it does not go through the
 * integration-token RPCs. It is read-only (analytics.readonly) and never exposed to the browser.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

interface ServiceAccount { client_email: string; private_key: string }

/** Parse the service-account JSON from the environment. Returns null when it isn't set up yet (honest "not connected"). */
export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GA4_SERVICE_ACCOUNT_JSON isn't valid JSON. Paste the whole service-account key file (the one that starts with {\"type\":\"service_account\"...}) into the Vercel environment variable, with no characters removed."
    );
  }
  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GA4_SERVICE_ACCOUNT_JSON is missing client_email or private_key. Use the full service-account key file from Google Cloud.");
  }
  return { client_email: sa.client_email, private_key: sa.private_key };
}

/** The service account's email — the address to add as a Viewer on each client's GA4 property. */
export function serviceAccountEmail(): string | null {
  return serviceAccount()?.client_email ?? null;
}

export function ga4Configured(): boolean {
  return !!process.env.GA4_SERVICE_ACCOUNT_JSON?.trim();
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires > now + 60) return cached.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signingInput = `${header}.${claims}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(signingInput).sign(sa.private_key, "base64url");
  } catch {
    throw new Error("Couldn't sign in to Google Analytics — the service-account private key looks malformed. Re-download the key file from Google Cloud and paste it in again.");
  }
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google Analytics sign-in was rejected: ${data.error_description || data.error || res.statusText}. Check the service-account key is current and the Analytics Data API is enabled in Google Cloud.`);
  }
  cached = { token: data.access_token, expires: now + 3300 };
  return data.access_token;
}

export interface Ga4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }
export interface Ga4Report { dimensionHeaders: { name: string }[]; metricHeaders: { name: string; type: string }[]; rows: Ga4Row[] }

export interface RunReportRequest {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  orderBys?: unknown[];
  limit?: number;
}

/** Run one GA4 Data API report against a property. propertyId is the numeric id, e.g. "393878887". */
export async function runReport(propertyId: string, body: RunReportRequest): Promise<Ga4Report> {
  const sa = serviceAccount();
  if (!sa) throw new Error("NOT_CONFIGURED");
  const token = await accessToken(sa);

  const res = await fetch(`${DATA_API}/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 403) {
    throw new Error("NO_ACCESS");
  }
  const data = (await res.json().catch(() => ({}))) as Partial<Ga4Report> & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Google Analytics report failed: ${data.error?.message || res.statusText}`);
  }
  return { dimensionHeaders: data.dimensionHeaders ?? [], metricHeaders: data.metricHeaders ?? [], rows: data.rows ?? [] };
}
