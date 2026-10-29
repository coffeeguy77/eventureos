import "server-only";
import { Resolver } from "node:dns/promises";
import { connect } from "node:tls";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ours, Raw } from "./core";

/** Live lookups for the website & email checks. Public DNS (Cloudflare and Google) so answers are fresh. */
function resolver() {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}
const safe = async <T,>(p: Promise<T>, d: T): Promise<T> => { try { return await p; } catch { return d; } };
const timeout = <T,>(p: Promise<T>, ms: number, d: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(d), ms))]);

/** Our hosting servers' addresses (from Hosting → Servers). */
export async function ourServers(db: SupabaseClient, orgId: string): Promise<Ours> {
  const { data } = await db.from("hosting_servers").select("name, host").eq("organisation_id", orgId);
  const r = resolver();
  const names: { ip: string; name: string }[] = [];
  for (const s of (data ?? []) as { name: string; host: string | null }[]) {
    const host = (s.host ?? "").replace(/^[a-z]+:\/\//i, "").replace(/[:/].*$/, "");
    if (!host) continue;
    const ips = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? [host] : await safe(r.resolve4(host), [] as string[]);
    for (const ip of ips) names.push({ ip, name: s.name });
  }
  return { ips: [...new Set(names.map((n) => n.ip))], names };
}

async function http(domain: string) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch(`https://${domain}/`, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "EventureOS site check" }, cache: "no-store" });
    clearTimeout(timer);
    return { ok: res.status < 400, status: res.status, finalUrl: res.url || null, ms: Date.now() - t0, server: res.headers.get("server"), error: null };
  } catch (e) {
    const m = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
    return { ok: false, status: null, finalUrl: null, ms: null, server: null, error: /abort/i.test(m) ? "Took longer than 9 seconds" : m.slice(0, 200) };
  }
}

function ssl(domain: string): Promise<Raw["ssl"]> {
  return timeout(new Promise((resolve) => {
    const sock = connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: 7000 }, () => {
      const c = sock.getPeerCertificate();
      const ok = sock.authorized;
      sock.end();
      if (!c || !c.valid_to) return resolve({ validTo: null, issuer: null, error: "No certificate" });
      const issuer = (c.issuer && (c.issuer.O || c.issuer.CN)) || null;
      const names = String(c.subjectaltname ?? "");
      const covers = names.split(/,\s*/).some((n) => { const h = n.replace(/^DNS:/, ""); return h === domain || (h.startsWith("*.") && domain.endsWith(h.slice(1))); });
      resolve({ validTo: new Date(c.valid_to).toISOString(), issuer: Array.isArray(issuer) ? issuer[0] : issuer, error: ok ? null : covers ? String(sock.authorizationError ?? "Not trusted") : `Certificate is for ${names.replace(/DNS:/g, "") || "another site"}` });
    });
    sock.on("error", (e) => resolve({ validTo: null, issuer: null, error: e.message.slice(0, 200) }));
    sock.on("timeout", () => { sock.destroy(); resolve({ validTo: null, issuer: null, error: "No answer on https (port 443)" }); });
  }), 9000, { validTo: null, issuer: null, error: "No answer on https" });
}

/** Registration (expiry, registrar) from the public RDAP service. Not every domain type publishes an expiry date. */
async function rdap(domain: string): Promise<Raw["rdap"]> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: ctl.signal, headers: { accept: "application/rdap+json" }, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return { expires: null, registrar: null, status: [], error: res.status === 404 ? "Not found in the registry" : `Registry answered ${res.status}` };
    const j = await res.json() as { events?: { eventAction: string; eventDate: string }[]; status?: string[]; entities?: { roles?: string[]; vcardArray?: unknown[] }[] };
    const exp = j.events?.find((e) => /expiration/i.test(e.eventAction))?.eventDate ?? null;
    const reg = j.entities?.find((e) => e.roles?.includes("registrar"));
    const card = Array.isArray(reg?.vcardArray?.[1]) ? (reg!.vcardArray![1] as unknown[][]) : [];
    const fn = card.find((x) => x[0] === "fn")?.[3];
    return { expires: exp, registrar: typeof fn === "string" ? fn : null, status: j.status ?? [], error: null };
  } catch (e) {
    return { expires: null, registrar: null, status: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Everything about a domain, in parallel (about 2–10 seconds). `quick` skips the website, SSL and registration. */
export async function lookup(domain: string, quick = false): Promise<Raw> {
  const r = resolver();
  let dnsError: string | null = null;
  const err = (e: unknown) => { const c = (e as { code?: string }).code; if (c === "ENOTFOUND" || c === "ENODATA") return; if (!dnsError) dnsError = c === "ESERVFAIL" ? "DNS servers for this domain aren't answering" : c ?? String(e); };
  const q = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch (e) { err(e); return d; } };
  const [a, aaaa, wwwA, wwwCname, ns, mxRaw, txt, dmarcTxt] = await Promise.all([
    q(r.resolve4(domain), [] as string[]), q(r.resolve6(domain), [] as string[]),
    safe(r.resolve4(`www.${domain}`), [] as string[]), safe(r.resolveCname(`www.${domain}`), [] as string[]),
    q(r.resolveNs(domain), [] as string[]), q(r.resolveMx(domain), [] as { exchange: string; priority: number }[]),
    safe(r.resolveTxt(domain), [] as string[][]), safe(r.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
  ]);
  if (!a.length && !ns.length && !mxRaw.length && !dnsError) dnsError = "This domain has no DNS records";
  const mx = await Promise.all(mxRaw.map(async (m) => ({ ...m, ips: m.exchange ? await safe(r.resolve4(m.exchange), [] as string[]) : [] })));
  const flat = (t: string[][]) => t.map((x) => x.join(""));
  const spf = flat(txt).find((x) => /^v=spf1/i.test(x)) ?? null;
  const dmarc = flat(dmarcTxt).find((x) => /^v=DMARC1/i.test(x)) ?? null;
  const [h, s, d] = quick || !a.length
    ? [null, null, quick ? null : await rdap(domain)]
    : await Promise.all([http(domain), ssl(domain), rdap(domain)]);
  return { domain, a, aaaa, wwwA, wwwCname, ns, mx, spf, dmarc, http: h, ssl: s, rdap: d, dnsError };
}
