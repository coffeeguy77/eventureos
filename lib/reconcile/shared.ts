import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f-]{36}$/i;

/** This business and any that share its Xero file (one trading as the other): their invoices are in the same Xero. */
export async function sharedOrgIds(db: SupabaseClient, orgId: string): Promise<string[]> {
  const { data: me } = await db.from("integrations").select("id, settings").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
  if (!me) return [orgId];
  const s = (me.settings ?? {}) as { shared_from?: string; shared_with?: string[] };
  const lenderId = s.shared_from && UUID.test(s.shared_from) ? s.shared_from : (me.id as string);
  const { data: lender } = await db.from("integrations").select("organisation_id, settings").eq("id", lenderId).maybeSingle();
  const borrowers = ((lender?.settings as { shared_with?: string[] } | null)?.shared_with ?? []).filter((x) => UUID.test(x));
  const ids = new Set([orgId, (lender?.organisation_id as string) ?? orgId]);
  if (borrowers.length) {
    const { data: b } = await db.from("integrations").select("organisation_id").in("id", borrowers);
    for (const r of (b ?? []) as { organisation_id: string }[]) ids.add(r.organisation_id);
  }
  return [...ids];
}

