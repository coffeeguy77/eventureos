import type { SupabaseClient } from "@supabase/supabase-js";

/** Email domains anyone can sign up to — a shared one says nothing about who someone works for. */
const FREE = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.com.au", "hotmail.com", "hotmail.com.au", "live.com", "live.com.au", "msn.com",
  "yahoo.com", "yahoo.com.au", "ymail.com", "icloud.com", "me.com", "mac.com", "bigpond.com", "bigpond.net.au", "optusnet.com.au",
  "iinet.net.au", "tpg.com.au", "internode.on.net", "westnet.com.au", "aol.com", "protonmail.com", "proton.me", "gmx.com", "zoho.com", "fastmail.com",
]);

export const workDomain = (email: string | null | undefined) => {
  const d = email?.trim().toLowerCase().split("@")[1];
  return d && !FREE.has(d) ? d : null;
};

/**
 * The company customer a person most likely belongs to: one that has them as a contact (same email), or — failing
 * that — the only company customer whose email or contacts use the same work domain. Null when there's no clear answer.
 */
export async function belongsToCompany(db: SupabaseClient, orgId: string, customerId: string, email: string | null): Promise<{ id: string; name: string; why: string } | null> {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  const { data: byContact } = await db.from("contacts").select("customer:customers!inner(id, name, kind)")
    .eq("organisation_id", orgId).ilike("email", e).neq("customer_id", customerId).eq("customer.kind", "company").limit(2);
  const hit = ((byContact ?? []) as unknown as { customer: { id: string; name: string } }[]).map((r) => r.customer);
  if (hit.length === 1) return { ...hit[0], why: `${e} is one of its contacts` };
  const d = workDomain(e);
  if (!d) return null;
  const like = `%@${d.replace(/[%_]/g, "")}`;
  const [{ data: cos }, { data: viaContacts }] = await Promise.all([
    db.from("customers").select("id, name").eq("organisation_id", orgId).eq("kind", "company").neq("id", customerId).ilike("email", like).limit(3),
    db.from("contacts").select("customer:customers!inner(id, name, kind)").eq("organisation_id", orgId).neq("customer_id", customerId).eq("customer.kind", "company").ilike("email", like).limit(10),
  ]);
  const all = new Map<string, string>();
  for (const c of (cos ?? []) as { id: string; name: string }[]) all.set(c.id, c.name);
  for (const r of (viaContacts ?? []) as unknown as { customer: { id: string; name: string } }[]) all.set(r.customer.id, r.customer.name);
  if (all.size !== 1) return null;
  const [[id, name]] = [...all];
  return { id, name, why: `same email domain, ${d}` };
}
