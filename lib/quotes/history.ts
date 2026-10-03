import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanAliases, type ItemAliases, type PriceItem } from "./xero-import";

/**
 * The price list plus the remembered "old Xero item code → today's item" matches, for viewing and copying old
 * quotes and invoices. Read with the server's access, scoped to the organisation (callers have already checked
 * the person belongs to it) — the matches live in the Xero connection's settings, which staff can't read directly.
 */
export async function loadMatchContext(orgId: string): Promise<{ priceList: PriceItem[]; aliases: ItemAliases }> {
  const db = createServiceClient();
  const [svc, xero] = await Promise.all([
    db.from("services").select("id, code, name, unit, unit_price, tax_rate, active, category, position").eq("organisation_id", orgId).order("position"),
    db.from("integrations").select("settings").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle(),
  ]);
  if (svc.error) throw new Error(`Couldn't load the price list: ${svc.error.message}`);
  const priceList = (svc.data ?? []).map((s) => ({ ...s, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate) })) as (PriceItem & { category: string | null })[];
  const aliases = cleanAliases((xero.data?.settings as Record<string, unknown> | null)?.item_aliases, priceList);
  return { priceList, aliases };
}

/** Shape matched lines and the price list for the old-lines view (plain data for the client). */
export function forView(matched: import("./xero-import").MatchedLine[], priceList: (PriceItem & { category?: string | null })[]) {
  const lines = matched.map((m) => ({
    code: m.code, title: m.title, rest: m.rest, quantity: m.quantity, unitAmount: m.unitAmount, lineAmount: m.lineAmount, note: m.note, via: m.via,
    item: m.item ? { id: m.item.id, name: m.item.name, unit: m.item.unit, unit_price: m.item.unit_price ?? null } : null,
  }));
  const options = priceList.filter((p) => p.active !== false)
    .map((p) => ({ id: p.id, name: p.name, code: p.code, unit: p.unit, unit_price: Number(p.unit_price ?? 0), category: p.category ?? null }));
  return { lines, options };
}
