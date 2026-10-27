import "server-only";
import https from "node:https";

/** WHM JSON API (port 2087), authorised with an API token: `Authorization: whm user:token`. */
export interface WhmServer { host: string; port: number; username: string; token: string; verify_tls: boolean }
export interface WhmAccount { username: string; domain: string; owner: string; plan: string; email: string; diskUsedMb: number; diskLimitMb: number | null; suspended: boolean; suspendReason: string | null }
export interface WhmResult { ok: boolean; message: string }

const HOST = /^[a-z0-9.-]{3,253}$/i;

function call(s: WhmServer, endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  if (!HOST.test(s.host)) return Promise.reject(new Error("The server address doesn't look right."));
  const qs = new URLSearchParams({ "api.version": "1", ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: s.host, port: s.port || 2087, path: `/json-api/${endpoint}?${qs}`, method: "GET", headers: { Authorization: `whm ${s.username}:${s.token}` }, rejectUnauthorized: s.verify_tls }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; if (data.length > 20_000_000) req.destroy(new Error("WHM sent too much data")); });
      res.on("end", () => {
        if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error("WHM refused the login — check the username and API token."));
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`WHM didn't send JSON (HTTP ${res.statusCode})`)); }
      });
    });
    req.on("error", (e) => reject(new Error(/certificate|self.signed/i.test(e.message) ? `${e.message} — turn off "check the certificate" for this server if it uses its own certificate.` : e.message)));
    req.setTimeout(20_000, () => req.destroy(new Error("WHM didn't answer in 20 seconds")));
    req.end();
  });
}

function result(d: unknown, okMsg: string, failMsg: string): WhmResult {
  const o = (d ?? {}) as Record<string, unknown>;
  const meta = o.metadata as Record<string, unknown> | undefined;
  if (meta) return { ok: meta.result === 1, message: String(meta.reason ?? (meta.result === 1 ? okMsg : failMsg)) };
  const legacy = (o.result as Record<string, unknown>[] | undefined)?.[0];
  if (legacy) return { ok: legacy.status === 1, message: String(legacy.statusmsg ?? (legacy.status === 1 ? okMsg : failMsg)) };
  return { ok: false, message: failMsg };
}

export async function whmVersion(s: WhmServer): Promise<string> {
  const d = (await call(s, "version")) as { data?: { version?: string }; version?: string; metadata?: { result?: number; reason?: string } };
  if (d.metadata && d.metadata.result !== 1) throw new Error(d.metadata.reason ?? "WHM refused the request");
  return d.data?.version ?? d.version ?? "unknown";
}

const mb = (v: unknown) => { const s = String(v ?? "").trim(); if (!s || /unlimited/i.test(s)) return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

export async function whmAccounts(s: WhmServer): Promise<WhmAccount[]> {
  const d = (await call(s, "listaccts")) as { data?: { acct?: Record<string, unknown>[] }; acct?: Record<string, unknown>[]; metadata?: { result?: number; reason?: string } };
  if (d.metadata && d.metadata.result !== 1) throw new Error(d.metadata.reason ?? "WHM refused to list accounts");
  return (d.data?.acct ?? d.acct ?? []).map((a) => ({
    username: String(a.user ?? ""), domain: String(a.domain ?? "").toLowerCase(), owner: String(a.owner ?? ""), plan: String(a.plan ?? ""), email: String(a.email ?? ""),
    diskUsedMb: mb(a.diskused) ?? 0, diskLimitMb: mb(a.disklimit),
    suspended: a.suspended === 1 || a.suspended === "1" || a.suspended === true, suspendReason: a.suspendreason ? String(a.suspendreason) : a.suspendReason ? String(a.suspendReason) : null,
  })).filter((a) => a.username && a.domain);
}

export async function whmSuspend(s: WhmServer, user: string, reason: string): Promise<WhmResult> {
  try { return result(await call(s, "suspendacct", { user, reason }), "Suspended", "Suspend failed"); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Suspend failed" }; }
}
export async function whmUnsuspend(s: WhmServer, user: string): Promise<WhmResult> {
  try { return result(await call(s, "unsuspendacct", { user }), "Unsuspended", "Unsuspend failed"); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Unsuspend failed" }; }
}
/** Terminate (delete) a cPanel account: its website, email and files are removed from the server. Permanent. */
export async function whmTerminate(s: WhmServer, user: string): Promise<WhmResult> {
  try { return result(await call(s, "removeacct", { username: user, keepdns: "0" }), "Account removed", "Removal failed"); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Removal failed" }; }
}
