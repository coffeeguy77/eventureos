/**
 * Turn a Xero quote's lines (EventureOS's copy) into quote lines, keeping Xero's quantities and prices exactly.
 * Lines whose item code matches a price-list item are linked to it (name, unit and GST from the price list);
 * others come across as one-off lines named from their description's first line. Pure — tested with `npx tsx`.
 */
export interface XeroLine { item_code?: string | null; description?: string | null; quantity?: number | null; unit_amount?: number | null; line_amount?: number | null; account_code?: string | null }
export interface PriceItem { id: string; code: string | null; name: string; unit: string | null; tax_rate: number }
export interface ImportedLine { service_id: string | null; name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number }

const DEFAULT_GST = 10;

export function xeroLinesToQuoteLines(lines: XeroLine[], priceList: PriceItem[]): ImportedLine[] {
  const byCode = new Map(priceList.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p]));
  return lines.flatMap((l): ImportedLine[] => {
    const desc = (l.description ?? "").replace(/\r/g, "").trim();
    const qty = Number(l.quantity ?? 0), price = Number(l.unit_amount ?? 0);
    if (!desc && !qty && !price) return [];
    const svc = l.item_code ? byCode.get(l.item_code.toLowerCase()) : undefined;
    const [first, ...rest] = desc.split("\n");
    if (svc) {
      // Xero descriptions usually start with the item's name — don't repeat it under the name
      const body = first.trim().toLowerCase() === svc.name.toLowerCase() ? rest.join("\n").trim() : desc;
      return [{ service_id: svc.id, name: svc.name, description: body || null, quantity: qty || 1, unit: svc.unit, unit_price: price, tax_rate: svc.tax_rate }];
    }
    const name = (first || l.item_code || "Item").trim().slice(0, 200);
    return [{ service_id: null, name, description: rest.join("\n").trim() || null, quantity: qty || (price ? 1 : 0), unit: null, unit_price: price, tax_rate: DEFAULT_GST }];
  });
}
