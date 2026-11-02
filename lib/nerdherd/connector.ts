import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Talks to the Web Culture Connector WordPress plugin (Tools → Web Culture on each site).
 * Every request is signed with the site's connection key:
 *   X-WCC-Timestamp, X-WCC-Nonce, X-WCC-Signature = hex HMAC-SHA256(key, ts \n nonce \n METHOD \n /route \n body)
 * The key lives in website_connector_keys (server only) and never reaches the browser.
 */

export const KEY_PATTERN = /^wcc_[a-f0-9]{64}$/;
const NS = "/webculture/v1";

export type ConnectorStatus = {
  site: { name: string; url: string };
  connector: string;
  environment: { wp: string; wp_update: string | null; php: string; https: boolean; debug: boolean; fs_method: string; disk_free_mb: number | null; admins: number; cron_late: number } & Record<string, unknown>;
  woocommerce: { version: string; currency: string; db_ok: boolean } | null;
  updates: { core: number; plugins: number; themes: number };
  plugins: { file: string; name: string; version: string; active: boolean; update: string | null; update_ok: boolean | null }[];
  themes: { slug: string; name: string; version: string; active: boolean; update: string | null }[];
};

export type UpdateResult = {
  summary: string;
  core: { ok: boolean; from: string; to: string; error: string | null } | null;
  plugins: { file: string; name: string; from: string | null; to: string | null; ok: boolean; error: string | null }[];
  themes: { slug: string; from: string; to: string; ok: boolean; error: string | null }[];
  health_before: { ok: boolean; code: number; message: string };
  health_after: { ok: boolean; code: number; message: string };
};

/** The site URL must be on the website's own domain (or a subdomain of it, e.g. www.). */
export function sameSite(siteUrl: string, domain: string) {
  const h = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/** https://example.com.au — no path, no trailing slash. */
export function normaliseSiteUrl(raw: string) {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Use the site's web address, e.g. https://example.com.au");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || /\.(local|internal|lan)$/.test(host) || !host.includes(".")) {
    throw new Error("Use the site's public web address, e.g. https://example.com.au");
  }
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/wp-admin.*$/i, "").replace(/\/+$/, "")}`;
}

export async function callConnector<T>(siteUrl: string, key: string, method: "GET" | "POST", path: string, body?: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
  const route = `${NS}${path}`;
  const raw = body ? JSON.stringify(body) : "";
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", key).update(`${ts}\n${nonce}\n${method}\n${route}\n${raw}`).digest("hex");
  const headers: Record<string, string> = {
    "X-WCC-Timestamp": ts, "X-WCC-Nonce": nonce, "X-WCC-Signature": sig,
    "Accept": "application/json", "User-Agent": "EventureOS-NerdHerd/1.0 (+https://webculture.au)",
  };
  if (raw) headers["Content-Type"] = "application/json";

  const attempt = async (url: string) => {
    const res = await fetch(url, { method, headers, body: raw || undefined, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { res, json, text };
  };

  let r;
  try {
    r = await attempt(`${siteUrl}/wp-json${route}`);
    // Sites without pretty links: fall back to ?rest_route=
    if (r.res.status === 404 && !(r.json && typeof r.json === "object" && "code" in (r.json as object) && String((r.json as { code: string }).code).startsWith("wcc_"))) {
      r = await attempt(`${siteUrl}/?rest_route=${encodeURIComponent(route)}`);
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(/timeout|aborted/i.test(m) ? "The site took too long to answer." : `Couldn't reach the site (${m}).`);
  }
  if (!r.res.ok) {
    const j = r.json as { code?: string; message?: string } | null;
    if (r.res.status === 404 && (!j || j.code === "rest_no_route")) throw new Error("The Web Culture Connector plugin isn't installed or active on this site.");
    if (r.res.status === 401 || r.res.status === 403) throw new Error(j?.code === "wcc_stale" ? "The site's clock is out by more than 5 minutes." : "The site rejected the key. Copy it again from Tools → Web Culture on the site.");
    throw new Error(j?.message ? `The site said: ${j.message}` : `The site answered with HTTP ${r.res.status}.`);
  }
  if (r.json === null) throw new Error("The site didn't send back a proper answer (a security plugin or firewall may be blocking it).");
  return r.json as T;
}

/** Save a status snapshot from the plugin onto the website_connectors row. */
export async function storeStatus(db: SupabaseClient, websiteId: string, s: ConnectorStatus) {
  const { error } = await db.from("website_connectors").update({
    connector_version: s.connector,
    wp_version: s.environment.wp, wp_update: s.environment.wp_update, php_version: s.environment.php,
    wc_version: s.woocommerce?.version ?? null, currency: s.woocommerce?.currency ?? null,
    updates_core: s.updates.core, updates_plugins: s.updates.plugins, updates_themes: s.updates.themes,
    plugins: s.plugins.map((p) => ({ file: p.file, name: p.name, version: p.version, active: p.active, update: p.update, update_ok: p.update_ok })),
    themes: s.themes.map((t) => ({ slug: t.slug, name: t.name, version: t.version, active: t.active, update: t.update })),
    environment: s.environment, last_checked_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }).eq("website_id", websiteId);
  if (error) throw new Error(error.message);
}
