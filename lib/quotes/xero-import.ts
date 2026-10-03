/**
 * Old quotes and invoices (EventureOS's copy of Xero's) → today's price list.
 *
 * Each old line is matched to a price-list item by its Xero item code, or by a remembered "old code → new item"
 * match (`aliases`, saved from the old quote/invoice view). Lines that match nothing are flagged so they can be
 * brought into line with the current items. Pure — tested with `npx tsx`.
 */
export interface XeroLine { item_code?: string | null; description?: string | null; quantity?: number | null; unit_amount?: number | null; line_amount?: number | null; account_code?: string | null }
export interface PriceItem { id: string; code: string | null; name: string; unit: string | null; tax_rate: number; unit_price?: number | null; active?: boolean | null }
export interface ImportedLine { service_id: string | null; name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number }
/** lower-cased old item code → price-list item id */
export type ItemAliases = Record<string, string>;

export interface MatchedLine {
  code: string | null;
  /** First line of the old description, and the rest */
  title: string;
  rest: string | null;
  /** The whole old description */
  text: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  /** The price-list item it matches, if any */
  item: PriceItem | null;
  via: "code" | "alias" | null;
  /** A heading / note line with no quantity or price — nothing to match */
  note: boolean;
}

const DEFAULT_GST = 10;

/** Keep only well-formed aliases that point at items that still exist. */
export function cleanAliases(raw: unknown, priceList?: PriceItem[]): ItemAliases {
  const ids = priceList ? new Set(priceList.map((p) => p.id)) : null;
  const out: ItemAliases = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = k.trim().toLowerCase().slice(0, 100);
    if (!code || typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) continue;
    if (ids && !ids.has(v)) continue;
    out[code] = v;
  }
  return out;
}

export function matchLines(lines: XeroLine[], priceList: PriceItem[], aliases: ItemAliases = {}): MatchedLine[] {
  const byCode = new Map(priceList.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p]));
  const byId = new Map(priceList.map((p) => [p.id, p]));
  return lines.flatMap((l): MatchedLine[] => {
    const desc = (l.description ?? "").replace(/\r/g, "").trim();
    const qty = Number(l.quantity ?? 0), price = Number(l.unit_amount ?? 0);
    if (!desc && !qty && !price) return [];
    const code = l.item_code?.trim() || null;
    const key = code?.toLowerCase();
    let item: PriceItem | null = null, via: MatchedLine["via"] = null;
    if (key && byCode.has(key)) { item = byCode.get(key)!; via = "code"; }
    else if (key && aliases[key] && byId.has(aliases[key])) { item = byId.get(aliases[key])!; via = "alias"; }
    const [first, ...rest] = desc.split("\n");
    return [{
      code, title: (first || code || "Item").trim(), rest: rest.join("\n").trim() || null, text: desc,
      quantity: qty, unitAmount: price, lineAmount: Number(l.line_amount ?? qty * price),
      item, via, note: !item && !qty && !price,
    }];
  });
}

/**
 * Turn old lines into quote lines. Quantities always come across; prices are the old ones unless
 * `prices: "current"`, which uses today's price-list price for matched lines. Unmatched lines come in
 * as one-off lines (no price-list link) named from their description's first line.
 */
export function xeroLinesToQuoteLines(lines: XeroLine[], priceList: PriceItem[], opts: { aliases?: ItemAliases; prices?: "old" | "current" } = {}): ImportedLine[] {
  return matchLines(lines, priceList, opts.aliases).map((m): ImportedLine => {
    if (m.item) {
      const s = m.item;
      // Old descriptions usually start with the item's name — don't repeat it under the name
      const body = m.title.toLowerCase() === s.name.toLowerCase() ? m.rest ?? "" : m.text;
      const price = opts.prices === "current" && s.unit_price != null ? Number(s.unit_price) : m.unitAmount;
      return { service_id: s.id, name: s.name, description: body || null, quantity: m.quantity || 1, unit: s.unit, unit_price: price, tax_rate: Number(s.tax_rate) };
    }
    return { service_id: null, name: m.title.slice(0, 200), description: m.rest, quantity: m.quantity || (m.unitAmount ? 1 : 0), unit: null, unit_price: m.unitAmount, tax_rate: DEFAULT_GST };
  });
}
