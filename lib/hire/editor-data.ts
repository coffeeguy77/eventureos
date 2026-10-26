import type { SupabaseClient } from "@supabase/supabase-js";
import { loadItems } from "./server";
import type { PickItem } from "@/components/rentals/booking-editor";

/** What the booking screen needs: clients, open events and the items you hire out. */
export async function editorData(db: SupabaseClient, orgId: string) {
  const [cust, evs, items] = await Promise.all([
    db.from("customers").select("id, name").eq("organisation_id", orgId).order("name").limit(5000),
    db.from("events").select("id, number, name, event_date, customer_id").eq("organisation_id", orgId).not("status", "in", "(cancelled,completed)").order("event_date", { ascending: true, nullsFirst: false }).limit(500),
    loadItems(db, orgId, { activeOnly: true }),
  ]);
  if (cust.error) throw new Error(cust.error.message);
  return {
    customers: (cust.data ?? []) as { id: string; name: string }[],
    events: ((evs.data ?? []) as { id: string; number: number; name: string; event_date: string | null; customer_id: string }[]).map((e) => ({ id: e.id, label: `EV-${e.number} ${e.name}${e.event_date ? ` · ${e.event_date}` : ""}`, customerId: e.customer_id })),
    items: items.map((i): PickItem => ({ id: i.id, name: i.name, code: i.code, kind: i.kind, category: i.category, quantity: i.quantity, companions: i.companions, package_lines: i.package_lines })),
  };
}
