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
  lock?: { locked: boolean; since?: number } | null;
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
  // The signature covers the route only (WordPress's get_route() has no query string); the query is sent as-is.
  const [routePath, query = ""] = path.split("?");
  const route = `${NS}${routePath}`;
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
    r = await attempt(`${siteUrl}/wp-json${route}${query ? `?${query}` : ""}`);
    // Sites without pretty links: fall back to ?rest_route=
    if (r.res.status === 404 && !(r.json && typeof r.json === "object" && "code" in (r.json as object) && String((r.json as { code: string }).code).startsWith("wcc_"))) {
      r = await attempt(`${siteUrl}/?rest_route=${encodeURIComponent(route)}${query ? `&${query}` : ""}`);
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(/timeout|aborted/i.test(m) ? "The site took too long to answer." : `Couldn't reach the site (${m}).`);
  }
  if (!r.res.ok) {
    const j = r.json as { code?: string; message?: string } | null;
    if (r.res.status === 404 && (!j || j.code === "rest_no_route")) throw new Error("The Web Culture Connector plugin isn't installed or active on this site.");
    // only the authentication codes mean a key problem; other refusals (e.g. a content tool saying no) carry their own message
    if ((r.res.status === 401 || r.res.status === 403) && (!j?.code || ["wcc_signature", "wcc_forbidden", "wcc_stale", "wcc_replay", "wcc_nonce", "rest_forbidden"].includes(j.code))) {
      throw new Error(j?.code === "wcc_stale" ? "The site's clock is out by more than 5 minutes." : "The site rejected the key. Copy it again from Tools → Web Culture on the site.");
    }
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
    locked: !!s.lock?.locked, locked_since: s.lock?.locked && s.lock.since ? new Date(s.lock.since * 1000).toISOString() : null,
  }).eq("website_id", websiteId);
  if (error) throw new Error(error.message);
}

type LogEntry = { time: number; action: string; message: string; data?: unknown };
type UpdData = { plugins?: { name: string; from: string | null; to: string | null; ok: boolean }[]; themes?: { slug: string; from: string; to: string; ok: boolean }[]; core?: { ok: boolean; from: string; to: string } | null; health_after?: { ok: boolean } };

/** Plain-English summary of an update run, e.g. "Updated WordPress 7.1 → 7.1.4, WooCommerce 11.0.1 → 11.2.1 and 3 more". */
export function describeUpdate(d: UpdData | null | undefined, fallback: string) {
  if (!d) return fallback;
  const done: string[] = [];
  if (d.core?.ok) done.push(`WordPress ${d.core.from} → ${d.core.to}`);
  for (const p of d.plugins ?? []) if (p.ok) done.push(`${p.name} ${p.from ?? ""} → ${p.to ?? ""}`.replace(/\s+/g, " ").trim());
  for (const t of d.themes ?? []) if (t.ok) done.push(`${t.slug} theme ${t.from} → ${t.to}`);
  const failed = [...(d.plugins ?? []).filter((p) => !p.ok).map((p) => p.name), ...(d.themes ?? []).filter((t) => !t.ok).map((t) => t.slug)];
  if (!done.length && !failed.length) return fallback;
  let s = done.length ? `Updated ${done.length} item${done.length === 1 ? "" : "s"}` : "No updates applied";
  if (failed.length) s += ` · not updated: ${failed.join(", ")}`;
  if (d.health_after && !d.health_after.ok) s += " · site check failed afterwards";
  return s;
}

/** Copy the site's own maintenance log into website_maintenance_runs (skips entries already copied). */
export async function syncLog(db: SupabaseClient, orgId: string, websiteId: string, url: string, key: string) {
  const log = await callConnector<LogEntry[]>(url, key, "GET", "/log?limit=200");
  if (!Array.isArray(log) || !log.length) return 0;
  const map: Record<string, string> = { update: "update", cache: "purge", lock: "lock", unlock: "unlock", backup: "backup", content: "content" };
  const rows = log.map((e) => {
    const action = map[e.action] ?? "other";
    const data = (e.data && typeof e.data === "object" ? e.data : null) as UpdData | null;
    const items = action === "update" && data ? [
      ...(data.core?.ok ? [{ name: "WordPress", from: data.core.from, to: data.core.to }] : []),
      ...(data.plugins ?? []).filter((p) => p.ok).map((p) => ({ name: p.name, from: p.from, to: p.to })),
      ...(data.themes ?? []).filter((t) => t.ok).map((t) => ({ name: `${t.slug} theme`, from: t.from, to: t.to })),
    ] : null;
    return {
      // content changes are reported (in plain English) by the AI job that made them, so the raw entries stay internal
      organisation_id: orgId, website_id: websiteId, action, source: "site", public: action !== "other" && action !== "content",
      ok: action === "update" ? (data?.health_after?.ok ?? true) : true,
      summary: (action === "update" ? describeUpdate(data, e.message) : e.message).slice(0, 2000),
      detail: items ? { items, message: e.message } : { message: e.message },
      external_key: `${e.time}:${e.action}:${e.message}`.slice(0, 500),
      created_at: new Date(e.time * 1000).toISOString(),
    };
  });
  const { error, count } = await db.from("website_maintenance_runs").upsert(rows, { onConflict: "website_id,external_key", ignoreDuplicates: true, count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
