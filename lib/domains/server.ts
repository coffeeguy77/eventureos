import "server-only";
import { DKIM_SELECTORS, detectProvider, relName, txtValue, type DnsRecord, type MailProvider } from "./dns";

/**
 * Domain & email (server): read a domain's public DNS, and connect it to EventureOS on Vercel — add it to the
 * EventureOS project, switch on Vercel DNS, and copy the records that keep email working. Needs VERCEL_ACCESS_TOKEN.
 */

/* ------------------------------------------------------------------ public DNS (DNS-over-HTTPS) */

type Doh = { Status: number; Answer?: { name: string; type: number; data: string }[] };
const TYPE_NUM: Record<string, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

async function doh(name: string, type: string): Promise<Doh | null> {
  for (const base of ["https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"]) {
    try {
      const r = await fetch(`${base}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (r.ok) return (await r.json()) as Doh;
    } catch { /* try the next resolver */ }
  }
  return null;
}
const answers = (d: Doh | null, type: string) => (d?.Answer ?? []).filter((a) => a.type === TYPE_NUM[type]);

/** The nameservers the world sees for this domain. */
export async function nameservers(domain: string): Promise<string[]> {
  return answers(await doh(domain, "NS"), "NS").map((a) => a.data.replace(/\.$/, "").toLowerCase()).sort();
}
export const onVercel = (ns: string[]) => ns.length > 0 && ns.every((n) => /(^|\.)vercel-dns\.com$/.test(n));

/** The records that keep email (and verifications) working: MX, TXT on the domain, DMARC, DKIM, Outlook autodiscover. */
export async function scanMail(domain: string): Promise<{ provider: MailProvider; records: DnsRecord[] }> {
  const out: DnsRecord[] = [];
  const [mx, txt, dmarc, auto, ...dkim] = await Promise.all([
    doh(domain, "MX"), doh(domain, "TXT"), doh(`_dmarc.${domain}`, "TXT"), doh(`autodiscover.${domain}`, "CNAME"),
    ...DKIM_SELECTORS.flatMap((s) => [doh(`${s}._domainkey.${domain}`, "CNAME"), doh(`${s}._domainkey.${domain}`, "TXT")]),
  ]);
  for (const a of answers(mx, "MX")) { const [p, h] = a.data.split(/\s+/); out.push({ type: "MX", name: "", value: (h ?? "").replace(/\.$/, ""), priority: Number(p) || 0 }); }
  for (const a of answers(txt, "TXT")) out.push({ type: "TXT", name: "", value: txtValue(a.data) });
  for (const a of answers(dmarc, "TXT")) out.push({ type: "TXT", name: "_dmarc", value: txtValue(a.data) });
  for (const a of answers(auto, "CNAME")) out.push({ type: "CNAME", name: "autodiscover", value: a.data.replace(/\.$/, "") });
  DKIM_SELECTORS.forEach((s, i) => {
    const cname = answers(dkim[i * 2], "CNAME");
    if (cname.length) { out.push({ type: "CNAME", name: `${s}._domainkey`, value: cname[0].data.replace(/\.$/, "") }); return; }
    for (const a of answers(dkim[i * 2 + 1], "TXT")) out.push({ type: "TXT", name: `${s}._domainkey`, value: txtValue(a.data) });
  });
  return { provider: detectProvider(out.filter((r) => r.type === "MX").map((r) => r.value)), records: out.filter((r) => r.value) };
}

/* ------------------------------------------------------------------ Vercel */

const TEAM = () => process.env.VERCEL_TEAM_ID || "team_BQ4banzz6IjssTvmRUNrkDV7";
const PROJECT = () => process.env.EVENTUREOS_VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_ID || "prj_3hwjgX0gispF5nHrKqdR01Sgbs11";
export const vercelReady = () => !!process.env.VERCEL_ACCESS_TOKEN?.trim();

async function vercel<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const token = process.env.VERCEL_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, status: 0, data: null, error: "EventureOS isn't connected to Vercel (VERCEL_ACCESS_TOKEN)." };
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(TEAM())}`;
  const r = await fetch(url, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string; code?: string } }) | null;
  return { ok: r.ok, status: r.status, data: r.ok ? j : null, error: r.ok ? null : j?.error?.message ?? `Vercel said ${r.status}` };
}

export interface VercelDomain { nameservers: string[]; zone: boolean; inTeam: boolean; inProject: boolean }
export async function vercelDomain(domain: string): Promise<VercelDomain> {
  const [d, p] = await Promise.all([
    vercel<{ domain: { nameservers?: string[]; zone?: boolean } }>(`/v5/domains/${encodeURIComponent(domain)}`),
    vercel<{ name: string }>(`/v9/projects/${PROJECT()}/domains/${encodeURIComponent(domain)}`),
  ]);
  return { nameservers: d.data?.domain.nameservers ?? [], zone: !!d.data?.domain.zone, inTeam: d.ok, inProject: p.ok };
}

export async function vercelRecords(domain: string): Promise<(DnsRecord & { id: string; system: boolean; comment: string | null })[]> {
  const r = await vercel<{ records: { id: string; type: string; name: string; value: string; mxPriority?: number; creator?: string; comment?: string }[] }>(`/v4/domains/${encodeURIComponent(domain)}/records?limit=200`);
  return (r.data?.records ?? []).map((x) => ({
    id: x.id, type: x.type as DnsRecord["type"], name: relName(x.name, domain), value: x.type === "TXT" ? txtValue(x.value) : x.value.replace(/\.$/, ""),
    priority: x.mxPriority ?? null, system: x.creator === "system", comment: x.comment ?? null,
  }));
}

/** Add the domain (and www → it) to EventureOS, and switch on Vercel DNS for it. */
export async function connectDomain(domain: string): Promise<string[]> {
  const notes: string[] = [];
  const add = async (name: string, redirect?: string) => {
    const r = await vercel(`/v10/projects/${PROJECT()}/domains`, { method: "POST", body: redirect ? { name, redirect, redirectStatusCode: 308 } : { name } });
    if (!r.ok && !/already|exists|in use by this project/i.test(r.error ?? "")) throw new Error(`Couldn't add ${name}: ${r.error}`);
    if (r.ok) notes.push(`Added ${name}${redirect ? ` (goes to ${redirect})` : ""}`);
  };
  await add(domain);
  await add(`www.${domain}`, domain);
  const z = await vercel(`/v3/domains/${encodeURIComponent(domain)}`, { method: "PATCH", body: { op: "update", zone: true } });
  if (!z.ok && !/already/i.test(z.error ?? "")) throw new Error(`Couldn't switch on EventureOS DNS for ${domain}: ${z.error}`);
  return notes;
}

export async function addRecord(domain: string, r: DnsRecord, comment: string): Promise<void> {
  const body: Record<string, unknown> = { type: r.type, name: r.name, value: r.value, ttl: 3600, comment: comment.slice(0, 500) };
  if (r.type === "MX") body.mxPriority = Number(r.priority ?? 10);
  const res = await vercel(`/v2/domains/${encodeURIComponent(domain)}/records`, { method: "POST", body });
  if (!res.ok && !/already exists|duplicate/i.test(res.error ?? "")) throw new Error(`${r.type} ${r.name || "@"}: ${res.error}`);
}
