import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who a quote or invoice is for — the client, the person looking after it, and how to reach them.
 * Shown as "Prepared for" on quotes and "Bill to" on invoices. `billToLines` is pure (tested with tsx).
 */
export interface BillTo {
  name: string;
  company?: string | null;
  contact?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

/** The lines to print, in order: organisation, attention-of person, address lines, phone, email. */
export function billToLines(b: BillTo | null | undefined): { main: string; sub: string[] } | null {
  if (!b?.name?.trim()) return null;
  const org = (b.company?.trim() || b.name.trim());
  const person = b.contact?.trim() && b.contact.trim().toLowerCase() !== org.toLowerCase() ? b.contact.trim() : null;
  const sub: string[] = [];
  if (person) sub.push(`Attn: ${person}${b.position?.trim() ? `, ${b.position.trim()}` : ""}`);
  if (b.address?.trim()) {
    // One line per address line; a single-line address is split at its commas
    const raw = b.address.includes("\n") ? b.address.split(/\r?\n/) : b.address.split(/,\s*/);
    sub.push(...raw.map((l) => l.trim()).filter(Boolean));
  }
  if (b.phone?.trim()) sub.push(b.phone.trim());
  if (b.email?.trim()) sub.push(b.email.trim());
  return { main: org, sub };
}

/**
 * Load the client's details for a document. `contactId` (the event's primary contact) wins over the
 * client's primary contact; the person's own email/phone are used when the client record has none.
 */
export async function loadBillTo(db: SupabaseClient, orgId: string, customerId: string, contactId?: string | null): Promise<BillTo | null> {
  const [{ data: c }, { data: people }] = await Promise.all([
    db.from("customers").select("name, company, email, phone, address, kind").eq("id", customerId).eq("organisation_id", orgId).maybeSingle(),
    db.from("contacts").select("id, first_name, last_name, email, phone, position, is_primary").eq("customer_id", customerId).eq("organisation_id", orgId),
  ]);
  if (!c) return null;
  const list = (people ?? []) as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; position: string | null; is_primary: boolean }[];
  const p = (contactId && list.find((x) => x.id === contactId)) || list.find((x) => x.is_primary) || list[0] || null;
  const personName = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() : null;
  return {
    name: c.name, company: c.company, contact: personName, position: p?.position ?? null,
    email: c.email || p?.email || null, phone: c.phone || p?.phone || null, address: c.address,
  };
}
