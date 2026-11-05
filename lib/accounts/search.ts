import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find a customer from Accounts the way you'd look them up on the phone: part of their name or company
 * ("lock", "lock doctor"), a contact's name ("donald"), an email, a phone number, or a website / hosting domain.
 * Searches every client, not just those who owe money.
 */
export interface AccountHit { id: string; name: string; company: string | null; why: string | null; domains: string[] }

const esc = (s: string) => s.replace(/[%_,()\\*]/g, " ").replace(/\s+/g, " ").trim();

export async function searchAccountCustomers(db: SupabaseClient, orgId: string, q: string): Promise<AccountHit[]> {
  const t = esc(q);
  if (t.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 6 ? digits.slice(-8) : null;
  const like = `%${t}%`;
  const [cust, cont, sites, hosts] = await Promise.all([
    db.from("customers").select("id, name, company").eq("organisation_id", orgId)
      .or([`name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, phone ? `phone.ilike.%${phone}%` : null].filter(Boolean).join(",")).order("name").limit(40),
    db.from("contacts").select("first_name, last_name, email, customer:customers!inner(id, name, company)").eq("organisation_id", orgId)
      .or([`first_name.ilike.${like}`, `last_name.ilike.${like}`, `email.ilike.${like}`, phone ? `phone.ilike.%${phone}%` : null].filter(Boolean).join(",")).limit(40),
    db.from("websites").select("domain, customer:customers!inner(id, name, company)").eq("organisation_id", orgId).ilike("domain", like).limit(40),
    db.from("hosting_accounts").select("domain, customer:customers!inner(id, name, company)").eq("organisation_id", orgId).ilike("domain", like).limit(40),
  ]);
  // "donald smith" → also match a contact by first + last name
  const parts = t.split(" ");
  const full = parts.length >= 2
    ? await db.from("contacts").select("first_name, last_name, email, customer:customers!inner(id, name, company)").eq("organisation_id", orgId).ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts.slice(1).join(" ")}%`).limit(20)
    : { data: [] };

  type C = { id: string; name: string; company: string | null };
  const out = new Map<string, AccountHit>();
  const add = (c: C | null | undefined, why: string | null) => { if (c && !out.has(c.id)) out.set(c.id, { id: c.id, name: c.name, company: c.company, why, domains: [] }); };
  for (const c of (cust.data ?? []) as C[]) add(c, null);
  for (const r of [...((full.data ?? []) as unknown[]), ...((cont.data ?? []) as unknown[])] as { first_name: string; last_name: string | null; customer: C }[]) add(r.customer, `contact ${`${r.first_name} ${r.last_name ?? ""}`.trim()}`);
  for (const r of [...((sites.data ?? []) as unknown[]), ...((hosts.data ?? []) as unknown[])] as { domain: string; customer: C }[]) add(r.customer, `website ${r.domain}`);
  const hits = [...out.values()].slice(0, 30);
  if (!hits.length) return hits;
  // Their websites, to show under each name
  const ids = hits.map((h) => h.id);
  const [{ data: w }, { data: h }] = await Promise.all([
    db.from("websites").select("domain, customer_id").eq("organisation_id", orgId).in("customer_id", ids).limit(200),
    db.from("hosting_accounts").select("domain, customer_id").eq("organisation_id", orgId).in("customer_id", ids).limit(200),
  ]);
  const by = new Map<string, Set<string>>();
  for (const r of [...(w ?? []), ...(h ?? [])] as { domain: string | null; customer_id: string }[]) {
    const d = String(r.domain ?? "").replace(/^www\./, "").toLowerCase();
    if (d) by.set(r.customer_id, (by.get(r.customer_id) ?? new Set()).add(d));
  }
  for (const x of hits) x.domains = [...(by.get(x.id) ?? [])].slice(0, 4);
  return hits;
}
