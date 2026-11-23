/**
 * Domain & email (pure parts): which DNS records keep a business's email and verifications working when its domain
 * moves to EventureOS (Vercel nameservers), and which of those EventureOS's DNS doesn't have yet.
 *
 * Never touches the website records (the apex/www address) — Vercel answers those itself once the domain is
 * connected. Only adds; never removes or changes a record that's already there.
 */

export interface DnsRecord { type: "A" | "AAAA" | "CNAME" | "MX" | "TXT"; name: string; value: string; priority?: number | null }

/** DKIM selectors mail services commonly use (Google, Microsoft 365, cPanel/SiteGround, Resend, Mailchimp, SendGrid…). */
export const DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "resend", "k1", "k2", "k3", "s1", "s2", "mail", "dkim", "sig1", "mandrill", "zoho", "protonmail", "protonmail2", "protonmail3"];

/** Relative name ("" = the domain itself) from a full DNS name. */
export function relName(full: string, domain: string): string {
  const n = full.toLowerCase().replace(/\.$/, ""), d = domain.toLowerCase().replace(/\.$/, "");
  if (!n || n === d || n === "@") return "";
  return n.endsWith(`.${d}`) ? n.slice(0, -(d.length + 1)) : n;
}

/** TXT data as DNS-over-HTTPS returns it ("abc" "def") → one string. */
export const txtValue = (v: string) => v.replace(/^"|"$/g, "").replace(/"\s*"/g, "").trim();
const host = (v: string) => v.toLowerCase().trim().replace(/\.$/, "");

export type MailProvider = "google" | "microsoft" | "other" | "none";
export function detectProvider(mx: string[]): MailProvider {
  if (!mx.length) return "none";
  if (mx.every((h) => /(^|\.)(google|googlemail)\.com$/.test(host(h)))) return "google";
  if (mx.every((h) => /\.mail\.protection\.outlook\.com$|\.mx\.microsoft$/.test(host(h)))) return "microsoft";
  return "other";
}
export const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Google Workspace", microsoft: "Microsoft 365 (Outlook)", other: "Another email provider", none: "No email found on this domain" };

/** Same record? (type, name, value; MX priority too) */
export function sameRecord(a: DnsRecord, b: DnsRecord): boolean {
  if (a.type !== b.type || a.name !== b.name) return false;
  const va = a.type === "TXT" ? txtValue(a.value) : host(a.value), vb = b.type === "TXT" ? txtValue(b.value) : host(b.value);
  return va === vb && (a.type !== "MX" || Number(a.priority ?? 0) === Number(b.priority ?? 0));
}

/** The found records EventureOS's DNS doesn't have yet. Website records (apex/www A, AAAA, CNAME) are left to Vercel. */
export function missingRecords(found: DnsRecord[], existing: DnsRecord[]): DnsRecord[] {
  return found.filter((f) => !(["A", "AAAA", "CNAME"].includes(f.type) && (f.name === "" || f.name === "www")) && !existing.some((e) => sameRecord(e, f)));
}

/** What each record is for, in words a business owner understands. */
export function describe(r: DnsRecord): string {
  const v = r.type === "TXT" ? txtValue(r.value) : r.value;
  if (r.type === "MX") return "Where your email is delivered";
  if (r.type === "TXT" && /^v=spf1/i.test(v)) return "Which services may send email as you (SPF)";
  if (r.name === "_dmarc") return "What to do with email that fails checks (DMARC)";
  if (/_domainkey$/.test(r.name)) return "Email signature key (DKIM)";
  if (/^google-site-verification=/.test(v)) return "Google verification";
  if (/^MS=/.test(v)) return "Microsoft verification";
  if (/verification|verify/i.test(v)) return "Service verification";
  if (r.name === "autodiscover") return "Outlook email setup";
  return r.type === "CNAME" ? "Points a subdomain at another service" : r.type === "A" ? "Points a subdomain at a server" : "Other";
}
