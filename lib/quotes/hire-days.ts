import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withHireDays, type EventDay } from "@/lib/events/days";
import { shiftDays, type StaffDetails } from "@/lib/quotes/line-helpers";

/**
 * A job's days changed: on its quotes that aren't accepted yet, each hire line (the coffee cart / van / caravan item
 * of a package in Services & pricing) becomes one per day — times the carts running that day on the barista line —
 * with "4 days hire – Tue 20, Wed 21, Thu 22 & Fri 23 October 2026" in its description. Delivery / pickup lines
 * aren't hire items, so they're left alone. Accepted quotes are locked and never touched.
 */
export async function applyHireDays(db: SupabaseClient, orgId: string, eventId: string, days: EventDay[]) {
  const { data: pkgs } = await db.from("service_packages").select("rules").eq("organisation_id", orgId).eq("active", true);
  const hire = new Set(((pkgs ?? []) as { rules: { hire?: { service_id?: string } | null } | null }[]).map((p) => p.rules?.hire?.service_id).filter((x): x is string => !!x));
  if (!hire.size) return 0;
  const { data: quotes } = await db.from("quotes").select("id, status, quote_items(id, service_id, quantity, description, details)")
    .eq("organisation_id", orgId).eq("event_id", eventId).in("status", ["draft", "sent", "viewed"]);
  type Item = { id: string; service_id: string | null; quantity: number; description: string | null; details: { kind?: string } | null };
  let changed = 0;
  for (const q of (quotes ?? []) as { id: string; quote_items: Item[] }[]) {
    const staff = q.quote_items.map((i) => i.details).find((d) => d?.kind === "staff");
    const units = new Map((staff ? shiftDays(staff as unknown as StaffDetails) : []).filter((d) => d.date).map((d) => [d.date!, d.units]));
    for (const it of q.quote_items.filter((i) => i.service_id && hire.has(i.service_id))) {
      const r = withHireDays(it.description, days.map((d) => ({ date: d.date, units: units.get(d.date) ?? 1 })));
      const patch: Record<string, unknown> = {};
      if ((r.description || null) !== (it.description || null)) patch.description = r.description || null;
      if (r.quantity != null && Number(it.quantity) !== r.quantity) patch.quantity = r.quantity;
      if (!Object.keys(patch).length) continue;
      const { error } = await db.from("quote_items").update(patch).eq("id", it.id).eq("organisation_id", orgId);
      if (!error) changed++;
    }
  }
  return changed;
}
