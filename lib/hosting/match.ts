/**
 * Hosting billing match (pure): which client each hosting account belongs to, and which repeating invoice bills it.
 * Evidence, strongest first: a repeating invoice or invoice that names the domain, the client's email being at the
 * domain, the server's contact email being the client's, the client's name matching the domain.
 * "Strong" = clear winner with real evidence (applied automatically); anything weaker is a suggestion to check.
 */
export interface MAccount { id: string; domain: string; server_email: string | null; customer_id: string | null }
export interface MCustomer { id: string; name: string; company: string | null; email: string | null }
export interface MText { customer_id: string | null; text: string }
export interface MRecurring { id: string; customer_id: string; text: string; category: string; hosting_account_id: string | null; status: string }

export interface Candidate { customerId: string; score: number; reasons: string[] }
export interface AccountMatch { accountId: string; best: Candidate | null; others: Candidate[]; strong: boolean }

const GENERIC = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.au", "bigpond.com", "bigpond.net.au", "icloud.com", "live.com", "live.com.au", "hotmail.com.au", "optusnet.com.au", "me.com", "msn.com", "iinet.net.au", "tpg.com.au", "internode.on.net", "outlook.com.au", "protonmail.com"]);
const bare = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const emailDomain = (e: string | null) => (e && e.includes("@") ? e.split("@").pop()!.trim().toLowerCase() : "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does this text name the domain (not just contain it inside a longer one)? */
export function mentions(text: string, domain: string) {
  const d = bare(domain);
  if (!d || !text.includes(d)) return false;
  return new RegExp(`(^|[^a-z0-9.-])(www\\.)?${esc(d)}($|[^a-z0-9.-]|\\.(?![a-z0-9]))`).test(text);
}

export function matchAccounts(accounts: MAccount[], customers: MCustomer[], invoices: MText[], recurring: MRecurring[]): AccountMatch[] {
  const inv = invoices.map((i) => ({ ...i, text: i.text.toLowerCase() }));
  const rec = recurring.map((r) => ({ ...r, text: r.text.toLowerCase() }));
  const byEmailDomain = new Map<string, MCustomer[]>();
  const byEmail = new Map<string, MCustomer[]>();
  const byName = new Map<string, MCustomer[]>();
  for (const c of customers) {
    const e = (c.email ?? "").trim().toLowerCase();
    if (e) { byEmail.set(e, [...(byEmail.get(e) ?? []), c]); const d = emailDomain(e); if (d && !GENERIC.has(d)) byEmailDomain.set(d, [...(byEmailDomain.get(d) ?? []), c]); }
    for (const n of new Set([alnum(c.name), alnum(c.company ?? "")])) if (n.length >= 6) byName.set(n, [...(byName.get(n) ?? []), c]);
  }
  // the agency's own addresses (on many accounts as the server contact) say nothing about the client
  const own = new Map<string, number>();
  for (const a of accounts) { const d = emailDomain(a.server_email); if (d) own.set(d, (own.get(d) ?? 0) + 1); }
  const ownDomains = new Set([...own].filter(([, n]) => n > 3).map(([d]) => d));
  return accounts.map((a) => {
    const d = bare(a.domain);
    const label = alnum(d.split(".")[0] ?? "");
    const cands = new Map<string, Candidate>();
    const add = (cid: string | null, score: number, reason: string) => {
      if (!cid) return;
      const c = cands.get(cid) ?? { customerId: cid, score: 0, reasons: [] };
      if (!c.reasons.includes(reason)) { c.score += score; c.reasons.push(reason); }
      cands.set(cid, c);
    };
    for (const r of rec) if (mentions(r.text, d)) add(r.customer_id, 100, "A repeating invoice names the domain");
    for (const i of inv) if (mentions(i.text, d)) add(i.customer_id, 80, "An invoice names the domain");
    if (!ownDomains.has(d)) for (const c of byEmailDomain.get(d) ?? []) add(c.id, 60, `Their email is @${d}`);
    const se = (a.server_email ?? "").trim().toLowerCase();
    if (se && !se.includes(",") && !ownDomains.has(emailDomain(se))) {
      for (const c of byEmail.get(se) ?? []) add(c.id, 60, "Same email as on the server");
      const sd = emailDomain(se);
      if (sd && sd !== d && !GENERIC.has(sd)) for (const c of byEmailDomain.get(sd) ?? []) add(c.id, 30, `Server email is @${sd}, like theirs`);
    }
    if (label.length >= 6) for (const c of byName.get(label) ?? []) add(c.id, 40, "Name matches the domain");
    const list = [...cands.values()].sort((x, y) => y.score - x.score);
    const best = list[0] ?? null;
    const second = list[1]?.score ?? 0;
    // a clear winner with real evidence — or the client's full name is exactly the domain and nobody else fits
    const strong = !!best && ((best.score >= 60 && second < best.score / 2) || (best.score === 40 && list.length === 1));
    return { accountId: a.id, best, others: list.slice(1, 4), strong };
  });
}

/** Which repeating invoice bills which account: one that names the domain; else, for a client with one site, their hosting one. */
export function matchRecurring(accounts: (MAccount & { customer_id: string | null })[], recurring: MRecurring[]) {
  const out = new Map<string, { accountId: string; reason: string }>();
  const taken = new Set<string>();
  // longest domains first, so "shop.example.com" wins over "example.com"
  const sorted = [...accounts].sort((x, y) => bare(y.domain).length - bare(x.domain).length);
  for (const r of recurring) {
    const t = r.text.toLowerCase();
    const hit = sorted.find((a) => mentions(t, a.domain));
    if (hit) { out.set(r.id, { accountId: hit.id, reason: "Names the domain" }); taken.add(hit.id); }
  }
  const sitesByCustomer = new Map<string, string[]>();
  for (const a of accounts) if (a.customer_id) sitesByCustomer.set(a.customer_id, [...(sitesByCustomer.get(a.customer_id) ?? []), a.id]);
  const hostingByCustomer = new Map<string, MRecurring[]>();
  for (const r of recurring) if (!out.has(r.id) && r.category === "hosting" && r.status !== "ended") hostingByCustomer.set(r.customer_id, [...(hostingByCustomer.get(r.customer_id) ?? []), r]);
  for (const [cid, rs] of hostingByCustomer) {
    const sites = (sitesByCustomer.get(cid) ?? []).filter((s) => !taken.has(s));
    if (rs.length === 1 && sites.length === 1) { out.set(rs[0].id, { accountId: sites[0], reason: "The client's only site and only hosting repeating invoice" }); taken.add(sites[0]); }
  }
  return out;
}
