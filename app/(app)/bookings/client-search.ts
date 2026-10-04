"use server";

import { requireOrg } from "@/lib/context";

/** Clients to bill for an agency (company clients first). */
export async function searchClientsForAgency(q: string): Promise<{ id: string; name: string; xero: boolean }[]> {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff" || role === "customer") return [];
  const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const { data } = await supabase.from("customers").select("id, name, xero_contact_id, kind").eq("organisation_id", org.id).ilike("name", `%${term}%`).order("kind").order("name").limit(12);
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, xero: !!c.xero_contact_id }));
}
