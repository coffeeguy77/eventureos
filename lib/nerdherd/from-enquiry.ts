import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { workDomain } from "@/lib/customers/company-match";

/**
 * Turning an enquiry (an email) into a support ticket: who sent it, which client they probably belong to (their email
 * on a contact or client, the same @company domain on a client, its contacts or its websites, or a similar name), and
 * that client's open tickets (to add to instead of opening another).
 */
export interface Sender { firstName: string; lastName: string; email: string | null; phone: string | null; company: string | null; domain: string | null }
export interface ClientMatch { id: string; name: string; why: string; contactId: string | null }
export interface TicketHit { id: string; number: number; subject: string; status: string; customer: string | null; domain: string | null }

const esc = (s: string) => s.replace(/[%_,()]/g, " ").trim();
export function splitName(name: string | null | undefined, email: string | null): { first: string; last: string } {
  const n = (name ?? "").replace(/["']/g, "").trim();
  if (n && !n.includes("@")) { const parts = n.split(/\s+/); return { first: parts[0], last: parts.slice(1).join(" ") }; }
  const local = (email ?? "").split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
  const parts = local.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1));
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** A phone number in the email body (Australian mobile / landline), if the enquiry doesn't have one. */
export function phoneIn(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/(?:\+?61\s?|0)[2-478](?:[\s-]?\d){8}/);
  return m ? m[0].trim() : null;
}

export async function clientMatches(db: SupabaseClient, orgId: string, s: { email: string | null; name: string; company: string | null }): Promise<ClientMatch[]> {
  const out = new Map<string, ClientMatch>();
  const add = (id: string, name: string, why: string, contactId: string | null = null) => { if (!out.has(id)) out.set(id, { id, name, why, contactId }); };
  const email = s.email?.trim().toLowerCase() ?? null;
  if (email) {
    const [{ data: cs }, { data: cu }] = await Promise.all([
      db.from("contacts").select("id, customer:customers!inner(id, name)").eq("organisation_id", orgId).ilike("email", email).limit(5),
      db.from("customers").select("id, name").eq("organisation_id", orgId).ilike("email", email).limit(5),
    ]);
    for (const c of (cs ?? []) as unknown as { id: string; customer: { id: string; name: string } }[]) add(c.customer.id, c.customer.name, "the sender is one of its contacts", c.id);
    for (const c of (cu ?? []) as { id: string; name: string }[]) add(c.id, c.name, "same email address");
  }
  const d = workDomain(email);
  if (d) {
    const like = `%@${esc(d)}`;
    const [{ data: a }, { data: b }, { data: w }] = await Promise.all([
      db.from("customers").select("id, name").eq("organisation_id", orgId).ilike("email", like).limit(5),
      db.from("contacts").select("customer:customers!inner(id, name)").eq("organisation_id", orgId).ilike("email", like).limit(10),
      db.from("websites").select("customer:customers!inner(id, name)").eq("organisation_id", orgId).or(`domain.ilike.${esc(d)},domain.ilike.www.${esc(d)},domain.ilike.%.${esc(d)}`).limit(5),
    ]);
    for (const c of (a ?? []) as { id: string; name: string }[]) add(c.id, c.name, `client email is @${d}`);
    for (const c of (b ?? []) as unknown as { customer: { id: string; name: string } }[]) add(c.customer.id, c.customer.name, `a contact uses @${d}`);
    for (const c of (w ?? []) as unknown as { customer: { id: string; name: string } }[]) add(c.customer.id, c.customer.name, `their website is ${d}`);
  }
  for (const term of [s.company, s.name].filter((x): x is string => !!x && x.trim().length >= 3)) {
    const { data } = await db.from("customers").select("id, name").eq("organisation_id", orgId).or(`name.ilike.%${esc(term)}%,company.ilike.%${esc(term)}%`).limit(5);
    for (const c of (data ?? []) as { id: string; name: string }[]) add(c.id, c.name, `name looks like “${term.trim()}”`);
  }
  return [...out.values()].slice(0, 8);
}

/** Search clients by name, company, email, phone, contact or website. */
export async function searchClients(db: SupabaseClient, orgId: string, q: string): Promise<ClientMatch[]> {
  const t = esc(q);
  if (t.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const [{ data: a }, { data: b }, { data: w }] = await Promise.all([
    db.from("customers").select("id, name").eq("organisation_id", orgId).or([`name.ilike.%${t}%`, `company.ilike.%${t}%`, `email.ilike.%${t}%`, digits.length >= 6 ? `phone.ilike.%${digits.slice(-6)}%` : null].filter(Boolean).join(",")).limit(10),
    db.from("contacts").select("id, first_name, last_name, customer:customers!inner(id, name)").eq("organisation_id", orgId).or([`first_name.ilike.%${t}%`, `last_name.ilike.%${t}%`, `email.ilike.%${t}%`, digits.length >= 6 ? `phone.ilike.%${digits.slice(-6)}%` : null].filter(Boolean).join(",")).limit(10),
    db.from("websites").select("customer:customers!inner(id, name), domain").eq("organisation_id", orgId).ilike("domain", `%${t}%`).limit(10),
  ]);
  const out = new Map<string, ClientMatch>();
  for (const c of (a ?? []) as { id: string; name: string }[]) out.set(c.id, { id: c.id, name: c.name, why: "client", contactId: null });
  for (const c of (b ?? []) as unknown as { id: string; first_name: string; last_name: string | null; customer: { id: string; name: string } }[]) if (!out.has(c.customer.id)) out.set(c.customer.id, { id: c.customer.id, name: c.customer.name, why: `contact ${c.first_name} ${c.last_name ?? ""}`.trim(), contactId: null });
  for (const c of (w ?? []) as unknown as { domain: string; customer: { id: string; name: string } }[]) if (!out.has(c.customer.id)) out.set(c.customer.id, { id: c.customer.id, name: c.customer.name, why: `website ${c.domain}`, contactId: null });
  return [...out.values()].slice(0, 15);
}

/** Search tickets by number, subject, client, contact, phone or website domain. Open ones first. */
export async function searchTickets(db: SupabaseClient, orgId: string, q: string, customerIds: string[] = []): Promise<TicketHit[]> {
  const sel = "id, number, subject, status, customers(name), websites(domain)";
  const rows: Record<string, unknown>[] = [];
  const num = q.trim().replace(/^#/, "");
  if (/^\d{1,7}$/.test(num)) { const { data } = await db.from("support_tickets").select(sel).eq("organisation_id", orgId).eq("number", Number(num)).limit(1); rows.push(...(data ?? [])); }
  const ids = new Set(customerIds);
  const t = esc(q);
  if (t.length >= 2) {
    for (const c of await searchClients(db, orgId, q)) ids.add(c.id);
    const [{ data: subj }, { data: sites }] = await Promise.all([
      db.from("support_tickets").select(sel).eq("organisation_id", orgId).ilike("subject", `%${t}%`).order("last_activity_at", { ascending: false }).limit(15),
      db.from("websites").select("id").eq("organisation_id", orgId).ilike("domain", `%${t}%`).limit(10),
    ]);
    rows.push(...(subj ?? []));
    const siteIds = ((sites ?? []) as { id: string }[]).map((s) => s.id);
    if (siteIds.length) { const { data } = await db.from("support_tickets").select(sel).eq("organisation_id", orgId).in("website_id", siteIds).order("last_activity_at", { ascending: false }).limit(15); rows.push(...(data ?? [])); }
  }
  if (ids.size) { const { data } = await db.from("support_tickets").select(sel).eq("organisation_id", orgId).in("customer_id", [...ids]).order("last_activity_at", { ascending: false }).limit(25); rows.push(...(data ?? [])); }
  const seen = new Set<string>();
  const open = (s: string) => !["resolved", "closed"].includes(s);
  return (rows as unknown as { id: string; number: number; subject: string; status: string; customers: { name: string } | null; websites: { domain: string } | null }[])
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => Number(open(b.status)) - Number(open(a.status)) || b.number - a.number)
    .slice(0, 20).map((r) => ({ id: r.id, number: r.number, subject: r.subject, status: r.status, customer: r.customers?.name ?? null, domain: r.websites?.domain ?? null }));
}

export const workDomainOf = (email: string | null | undefined) => workDomain(email);
