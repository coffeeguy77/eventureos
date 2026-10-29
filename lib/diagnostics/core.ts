/**
 * Website & email checks (pure): turn raw DNS / web / registration answers into plain-English findings for the
 * accounts person — is the site still pointing at us, does email still work, when do the domain and SSL run out.
 * No network here, so it can be unit tested with node:test.
 */

export type Level = "ok" | "warn" | "bad" | "info";
export interface Finding { area: "web" | "email" | "domain" | "ssl"; level: Level; title: string; detail?: string }

export interface Raw {
  domain: string;
  a: string[]; aaaa: string[]; wwwA: string[]; wwwCname: string[];
  ns: string[];
  mx: { exchange: string; priority: number; ips: string[] }[];
  spf: string | null; dmarc: string | null;
  http: { ok: boolean; status: number | null; finalUrl: string | null; ms: number | null; server: string | null; error: string | null } | null;
  ssl: { validTo: string | null; issuer: string | null; error: string | null } | null;
  rdap: { expires: string | null; registrar: string | null; status: string[]; error: string | null } | null;
  /** errors looking things up (e.g. the domain doesn't exist) */
  dnsError: string | null;
}

/** What counts as "us": our hosting servers' addresses, plus LeadPages sites on Vercel. */
export interface Ours { ips: string[]; names: { ip: string; name: string }[] }
export const VERCEL_IPS = ["76.76.21.21", "76.76.21.22", "76.76.21.61", "76.76.21.93", "76.76.21.98", "76.76.21.123", "76.76.21.142", "76.76.21.164", "76.76.21.241"];

const lower = (s: string) => s.toLowerCase().replace(/\.$/, "");

/** Who runs a domain's email, from its MX hosts. */
export function mailProvider(mx: Raw["mx"], ours: Ours): { name: string; ours: boolean } | null {
  if (!mx.length) return null;
  const hosts = mx.map((m) => lower(m.exchange));
  const has = (re: RegExp) => hosts.some((h) => re.test(h));
  if (mx.some((m) => m.ips.some((ip) => ours.ips.includes(ip)))) {
    const n = ours.names.find((x) => mx.some((m) => m.ips.includes(x.ip)));
    return { name: n ? `our server (${n.name})` : "our server", ours: true };
  }
  if (has(/(^|\.)google\.com$|googlemail\.com$/)) return { name: "Google Workspace", ours: false };
  if (has(/mail\.protection\.outlook\.com$|outlook\.com$/)) return { name: "Microsoft 365", ours: false };
  if (has(/zoho\./)) return { name: "Zoho Mail", ours: false };
  if (has(/mimecast/)) return { name: "Mimecast", ours: false };
  if (has(/messagingengine\.com$/)) return { name: "Fastmail", ours: false };
  if (has(/secureserver\.net$/)) return { name: "GoDaddy", ours: false };
  if (has(/crazydomains|syrahost/)) return { name: "Crazy Domains", ours: false };
  if (has(/ventraip|syd\d*\.mail/)) return { name: "VentraIP", ours: false };
  return { name: hosts[0], ours: false };
}

/** Who answers for the domain's DNS (where records are changed). */
export function dnsHost(ns: string[]): string | null {
  const n = ns.map(lower);
  const has = (re: RegExp) => n.some((h) => re.test(h));
  if (!n.length) return null;
  if (has(/cloudflare\.com$/)) return "Cloudflare";
  if (has(/vercel-dns\.com$/)) return "Vercel";
  if (has(/siteground\.net$|sgvps\.net$/)) return "SiteGround";
  if (has(/liquidweb\.com$|sourcedns\.com$/)) return "Liquid Web";
  if (has(/awsdns/)) return "Amazon Route 53";
  if (has(/domaincontrol\.com$/)) return "GoDaddy";
  if (has(/crazydomains/)) return "Crazy Domains";
  if (has(/nameserver\.net\.au$|ventraip/)) return "VentraIP";
  if (has(/googledomains\.com$|google\.com$/)) return "Google";
  if (has(/azure-dns/)) return "Microsoft Azure";
  return n[0];
}

const daysUntil = (iso: string, now: Date) => Math.floor((Date.parse(iso) - now.getTime()) / 86_400_000);

/** Plain-English findings, worst first. */
export function findings(r: Raw, ours: Ours, now = new Date()): Finding[] {
  const out: Finding[] = [];
  if (r.dnsError && !r.a.length && !r.mx.length && !r.ns.length) {
    out.push({ area: "domain", level: "bad", title: "The domain doesn't answer", detail: `${r.dnsError} — it may have expired, been cancelled, or been typed wrong.` });
  }

  // Website: pointing at us?
  const ipNames = (ips: string[]) => ips.map((ip) => ours.names.find((x) => x.ip === ip)?.name ?? (VERCEL_IPS.includes(ip) ? "LeadPages (Vercel)" : null)).filter(Boolean) as string[];
  const usA = r.a.filter((ip) => ours.ips.includes(ip) || VERCEL_IPS.includes(ip));
  const vercelCname = r.wwwCname.some((c) => /vercel-dns\.com\.?$/i.test(c));
  if (r.a.length) {
    if (usA.length === r.a.length) out.push({ area: "web", level: "ok", title: `Website points to us — ${[...new Set(ipNames(r.a))].join(", ") || "our server"}`, detail: r.a.join(", ") });
    else if (usA.length) out.push({ area: "web", level: "warn", title: "Website points partly to us", detail: `${r.a.join(", ")} — some of these addresses aren't ours` });
    else out.push({ area: "web", level: "bad", title: "Website no longer points to our server", detail: `It points to ${r.a.join(", ")}. The client may have moved their website to someone else.` });
  } else if (!r.dnsError) out.push({ area: "web", level: "bad", title: "No website address (no A record)", detail: "Visitors can't reach the site." });
  if (r.wwwCname.length && !vercelCname && r.wwwA.length && !r.wwwA.some((ip) => ours.ips.includes(ip) || VERCEL_IPS.includes(ip)) && usA.length) {
    out.push({ area: "web", level: "warn", title: "www. points somewhere else", detail: `www.${r.domain} → ${r.wwwCname.join(", ")}` });
  }

  if (r.http) {
    if (r.http.ok) out.push({ area: "web", level: (r.http.ms ?? 0) > 4000 ? "warn" : "ok", title: `Website loads (${r.http.status}${r.http.ms != null ? `, ${(r.http.ms / 1000).toFixed(1)}s` : ""})`, detail: [r.http.finalUrl && r.http.finalUrl !== `https://${r.domain}/` ? `Ends up at ${r.http.finalUrl}` : null, r.http.server ? `Server: ${r.http.server}` : null].filter(Boolean).join(" · ") || undefined });
    else out.push({ area: "web", level: "bad", title: r.http.status ? `Website returns an error (${r.http.status})` : "Website doesn't load", detail: r.http.error ?? r.http.finalUrl ?? undefined });
  }

  // Email
  const mp = mailProvider(r.mx, ours);
  if (!r.mx.length) {
    if (!r.dnsError || r.ns.length) out.push({ area: "email", level: "bad", title: "No email records (MX) — email to this domain is bouncing", detail: "Nobody can email them at this domain until MX records are added back." });
  } else {
    const dead = r.mx.filter((m) => !m.ips.length);
    if (dead.length === r.mx.length) out.push({ area: "email", level: "bad", title: "Email server can't be found — email is bouncing", detail: `MX points to ${dead.map((m) => lower(m.exchange)).join(", ")}, which doesn't exist.` });
    else out.push({ area: "email", level: mp?.ours ? "ok" : "info", title: `Email is with ${mp?.name ?? "another provider"}`, detail: r.mx.sort((a, b) => a.priority - b.priority).map((m) => `${lower(m.exchange)} (${m.priority})`).join(", ") });
    if (dead.length && dead.length < r.mx.length) out.push({ area: "email", level: "warn", title: "One of the email servers doesn't exist", detail: dead.map((m) => lower(m.exchange)).join(", ") });
  }
  if (r.mx.length) {
    if (!r.spf) out.push({ area: "email", level: "warn", title: "No SPF record — their emails are more likely to land in junk", detail: "Add a TXT record starting v=spf1 that lists the servers that send their email." });
    else if (/[?+]all/.test(r.spf)) out.push({ area: "email", level: "warn", title: "SPF record is too open", detail: r.spf });
    else out.push({ area: "email", level: "ok", title: "SPF record found", detail: r.spf });
    if (!r.dmarc) out.push({ area: "email", level: "warn", title: "No DMARC record — Gmail and Outlook may junk their emails", detail: `Add a TXT record at _dmarc.${r.domain}, e.g. v=DMARC1; p=none` });
    else out.push({ area: "email", level: "ok", title: "DMARC record found", detail: r.dmarc });
  }

  // SSL
  if (r.ssl) {
    if (r.ssl.validTo) {
      const d = daysUntil(r.ssl.validTo, now);
      out.push({ area: "ssl", level: d < 0 ? "bad" : d < 14 ? "warn" : "ok", title: d < 0 ? `SSL certificate expired ${-d} days ago — browsers show a warning` : `SSL certificate valid for ${d} more days`, detail: [r.ssl.issuer, new Date(r.ssl.validTo).toISOString().slice(0, 10)].filter(Boolean).join(" · ") });
    } else if (r.ssl.error && r.a.length) out.push({ area: "ssl", level: "bad", title: "No working SSL certificate (https)", detail: r.ssl.error });
  }

  // Registration
  if (r.rdap?.expires) {
    const d = daysUntil(r.rdap.expires, now);
    out.push({ area: "domain", level: d < 0 ? "bad" : d < 30 ? "warn" : "ok", title: d < 0 ? `Domain registration expired ${-d} days ago` : `Domain registered until ${r.rdap.expires.slice(0, 10)} (${d} days)`, detail: r.rdap.registrar ? `Registrar: ${r.rdap.registrar}` : undefined });
  } else if (r.rdap?.registrar) out.push({ area: "domain", level: "info", title: `Registrar: ${r.rdap.registrar}`, detail: "Expiry date isn't published for this domain type." });
  if (r.rdap?.status.some((s) => /hold|redemption|pending ?delete|expired/i.test(s))) out.push({ area: "domain", level: "bad", title: "Domain is on hold or expiring", detail: r.rdap.status.join(", ") });
  const host = dnsHost(r.ns);
  if (host) out.push({ area: "domain", level: "info", title: `DNS is managed at ${host}`, detail: r.ns.map(lower).join(", ") });

  const rank: Record<Level, number> = { bad: 0, warn: 1, ok: 2, info: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Domain from whatever was typed or stored ("https://www.Example.com.au/page" → "example.com.au"). */
export function cleanDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}
