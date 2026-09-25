/**
 * Duplicate / match scoring between an incoming record (Gmail sender, Xero contact) and existing customers.
 * Pure functions — no I/O — so they run under `npx tsx lib/integrations/matching.test.ts`.
 *
 * Weights (max 100):
 *   email exact ............ 60   (any customer or contact email)
 *   same company domain .... 10   (only when emails differ and the domain isn't a free mailbox)
 *   company similarity ..... 0–20 (names, or a company name vs the other side's email domain)
 *   phone (AU normalised) .. 20
 *   name similarity ........ 0–20
 * Nothing is merged automatically: callers show the score and reasons for a person to decide.
 */

export interface MatchRecord {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  /** Additional emails (contacts on a customer). */
  emails?: (string | null | undefined)[];
  phone?: string | null;
  phones?: (string | null | undefined)[];
}

export interface MatchResult {
  score: number; // 0–100
  reasons: string[];
}

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "live.com.au", "msn.com", "yahoo.com", "yahoo.com.au",
  "icloud.com", "me.com", "mac.com", "bigpond.com", "bigpond.net.au", "optusnet.com.au", "iinet.net.au", "tpg.com.au",
  "internode.on.net", "aol.com", "protonmail.com", "proton.me", "outlook.com.au", "hotmail.com.au",
  "example.com", // used by demo data: treat like a shared mailbox domain
]);

const COMPANY_NOISE = /\b(pty|ltd|limited|proprietary|inc|incorporated|llc|co|company|corp|corporation|group|holdings|the|and|trust|trustee|for|t\/as|trading as|australia|aust|au)\b/g;

export function normEmail(e: string | null | undefined) {
  const s = (e ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function emailDomain(e: string | null | undefined) {
  const n = normEmail(e);
  return n ? n.split("@")[1] : null;
}

/** "abc.com.au" → "abc"; "mail.bartonconsulting.com" → "bartonconsulting" */
export function domainStem(domain: string) {
  const parts = domain.toLowerCase().split(".");
  const tlds = new Set(["com", "net", "org", "edu", "gov", "asn", "id", "au", "nz", "uk", "co", "io", "biz", "info"]);
  while (parts.length > 1 && tlds.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? domain;
}

/** Australian phone normalisation → national significant number (9 digits) where possible. */
export function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  let d = p.replace(/[^\d+]/g, "");
  if (d.startsWith("+61")) d = d.slice(3);
  else if (d.startsWith("0061")) d = d.slice(4);
  else if (d.startsWith("61") && d.length === 11) d = d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length < 8) return null;
  return d.slice(-9);
}

export function normCompany(c: string | null | undefined) {
  return (c ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s/]/g, " ").replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function normName(n: string | null | undefined) {
  return (n ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s'-]/g, " ").replace(/['-]/g, "").replace(/\s+/g, " ").trim();
}

function bigrams(s: string) {
  const t = s.replace(/\s+/g, " ");
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice coefficient on character bigrams, 0–1. */
export function dice(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

/** Name similarity that tolerates order ("Smith John"), initials ("J Smith") and middle names. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tx = x.split(" "), ty = y.split(" ");
  const sorted = (t: string[]) => [...t].sort().join(" ");
  if (sorted(tx) === sorted(ty)) return 0.97;
  // first + last match, ignoring middle names
  if (tx.length >= 2 && ty.length >= 2 && tx[0] === ty[0] && tx[tx.length - 1] === ty[ty.length - 1]) return 0.95;
  // initial + surname ("J Smith" vs "John Smith")
  const lastX = tx[tx.length - 1], lastY = ty[ty.length - 1];
  if (lastX === lastY && tx.length >= 2 && ty.length >= 2 && (tx[0][0] === ty[0][0]) && (tx[0].length === 1 || ty[0].length === 1)) return 0.85;
  return Math.max(dice(x, y), dice(sorted(tx), sorted(ty)) * 0.95);
}

export function companySimilarity(a: string | null | undefined, b: string | null | undefined) {
  const x = normCompany(a), y = normCompany(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const cx = x.replace(/\s/g, ""), cy = y.replace(/\s/g, "");
  if (cx === cy) return 0.98;
  if (cx.length >= 3 && cy.length >= 3 && (cx.startsWith(cy) || cy.startsWith(cx))) return 0.85;
  return dice(x, y);
}

function emailsOf(r: MatchRecord) {
  return [...new Set([r.email, ...(r.emails ?? [])].map(normEmail).filter((e): e is string => !!e))];
}
function phonesOf(r: MatchRecord) {
  return [...new Set([r.phone, ...(r.phones ?? [])].map(normPhone).filter((p): p is string => !!p))];
}
/** Company-like names for a record: company, or the name itself when it looks like a business. */
function companiesOf(r: MatchRecord) {
  const out = [r.company].filter(Boolean) as string[];
  if (r.name && /\b(pty|ltd|limited|inc|group|co\b|company|consulting|council|club|association|foundation|agency|studio|events|cafe|school|university|services)\b/i.test(r.name)) out.push(r.name);
  return out;
}

export function scoreMatch(incoming: MatchRecord, existing: MatchRecord): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  const ei = emailsOf(incoming), ee = emailsOf(existing);
  const sharedEmail = ei.find((e) => ee.includes(e));
  if (sharedEmail) {
    score += 60;
    reasons.push(`Same email ${sharedEmail}`);
  } else {
    const di = new Set(ei.map((e) => e.split("@")[1]).filter((d) => !FREE_MAIL_DOMAINS.has(d)));
    const shared = ee.map((e) => e.split("@")[1]).find((d) => di.has(d));
    if (shared) { score += 10; reasons.push(`Same company email domain @${shared}`); }
  }

  // Company: compare company names, else company vs the other side's email domain
  const ci = companiesOf(incoming), ce = companiesOf(existing);
  let comp = 0; let compWhy = "";
  for (const a of ci) for (const b of ce) {
    const s = companySimilarity(a, b);
    if (s > comp) { comp = s; compWhy = s >= 0.98 ? `Same company “${b}”` : `Similar company “${a}” ≈ “${b}”`; }
  }
  const domainCheck = (companies: string[], emails: string[]) => {
    for (const c of companies) for (const e of emails) {
      const d = e.split("@")[1];
      if (FREE_MAIL_DOMAINS.has(d)) continue;
      const stem = domainStem(d), nc = normCompany(c).replace(/\s/g, "");
      if (stem.length >= 3 && nc.length >= 3 && (stem === nc || nc.startsWith(stem) || stem.startsWith(nc))) {
        return { s: 0.8, why: `Company “${c}” matches email domain @${d}` };
      }
    }
    return null;
  };
  const dc = domainCheck(ci, ee) ?? domainCheck(ce, ei);
  if (dc && dc.s > comp) { comp = dc.s; compWhy = dc.why; }
  if (comp >= 0.6) { score += Math.round(comp * 20); reasons.push(compWhy); }

  const pi = phonesOf(incoming), pe = phonesOf(existing);
  const sharedPhone = pi.find((p) => pe.includes(p));
  if (sharedPhone) { score += 20; reasons.push("Same phone number"); }

  // Name: person names; skip when one side's "name" is just the company
  let nm = nameSimilarity(incoming.name, existing.name);
  const personOf = (r: MatchRecord) => (r.name && !companiesOf(r).includes(r.name) ? r.name : null);
  if (!nm) nm = 0;
  if (nm < 0.6) {
    // The Xero side is often "ABC Pty Ltd" with the person elsewhere; compare person names only when both exist
    const a = personOf(incoming), b = personOf(existing);
    nm = a && b ? nameSimilarity(a, b) : nm;
  }
  if (nm >= 0.6) { score += Math.round(nm * 20); reasons.push(nm >= 0.95 ? `Same name “${existing.name}”` : `Similar name “${incoming.name}” ≈ “${existing.name}”`); }

  return { score: Math.min(100, score), reasons };
}

export interface Candidate<T> { item: T; score: number; reasons: string[] }

/** Best-scoring existing record (or null below `min`). */
export function bestMatch<T>(incoming: MatchRecord, existing: T[], toRecord: (t: T) => MatchRecord, min = 40): Candidate<T> | null {
  let best: Candidate<T> | null = null;
  for (const item of existing) {
    const r = scoreMatch(incoming, toRecord(item));
    if (r.score >= min && (!best || r.score > best.score)) best = { item, ...r };
  }
  return best;
}

/** How a score should be presented: exact duplicates vs possible matches. */
export function matchBand(score: number): "certain" | "likely" | "possible" | "none" {
  if (score >= 90) return "certain";
  if (score >= 70) return "likely";
  if (score >= 40) return "possible";
  return "none";
}
