/**
 * Turn an invoice line into a comparable price: per kg, per litre, or per each.
 *
 *   LongPark    "$18.90 / kg"                         → $18.90 per kg
 *   Bidfood     "$65.98 / CTN", pack "5kg"             → $13.20 per kg
 *               "$55.53 / TRAY", pack "200x7gr"        → $39.66 per kg (1.4 kg)
 *               "$28.10 / KG" (sold by weight)          → $28.10 per kg
 *   Fresho      "$30.75 / CTN (6 x 2L)"                → $2.56 per L
 * Anything whose pack size can't be read is compared per invoice unit ("each").
 */
export type BaseUnit = "kg" | "L" | "ea";

export interface UnitPrice {
  baseUnit: BaseUnit;
  baseQty: number;        // kg / L / each in ONE invoice unit
  pricePerBase: number;   // $ per kg / L / each, ex GST
}

const G = { kg: 1, g: 0.001, gr: 0.001, gm: 0.001, grm: 0.001, l: 1, lt: 1, ltr: 1, litre: 1, ml: 0.001 } as const;

/** "8x4x70gr" → { unit: kg, amount: 2.24 };  "CTN (6 x 2L)" → { L, 12 };  "1.5kg" → { kg, 1.5 } */
export function parsePack(text: string | null | undefined): { unit: "kg" | "L"; amount: number } | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/,/g, ".");
  // a multiplier chain ending in a measured size: 6x2kg, 200 x 7gr, 8x4x70gr, 6 x 2l
  const m = t.match(/((?:\d+(?:\.\d+)?\s*x\s*)*)(\d+(?:\.\d+)?)\s*(kg|grm|gm|gr|g|ltr|litre|lt|ml|l)\b/);
  if (!m) return null;
  let amount = Number(m[2]) * G[m[3] as keyof typeof G];
  for (const f of (m[1] ?? "").split("x").map((x) => x.trim()).filter(Boolean)) amount *= Number(f);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { unit: /^(kg|grm|gm|gr|g)$/.test(m[3]) ? "kg" : "L", amount };
}

export function unitPrice(item: { unitPrice: number | null; unit: string | null; packSize: string | null; description: string }): UnitPrice | null {
  if (item.unitPrice === null || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) return null;
  const unit = (item.unit ?? "").trim().toLowerCase();
  // sold by weight / volume
  if (item.packSize === "per kg" || /^(kg|kgs|kilo)$/.test(unit) || /\bkg$/.test(unit) && !/\d/.test(unit)) {
    return { baseUnit: "kg", baseQty: 1, pricePerBase: round(item.unitPrice) };
  }
  if (/^(l|lt|ltr|litre)$/.test(unit)) return { baseUnit: "L", baseQty: 1, pricePerBase: round(item.unitPrice) };
  // the pack size is often only in the product name ("Vanilla Syrup 700ml", "Oat Milk 12 x 1L")
  const pack = parsePack(item.packSize) ?? parsePack(item.unit) ?? parsePack(item.description);
  if (pack) return { baseUnit: pack.unit, baseQty: round(pack.amount, 4), pricePerBase: round(item.unitPrice / pack.amount) };
  return { baseUnit: "ea", baseQty: 1, pricePerBase: round(item.unitPrice) };
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export const BASE_LABEL: Record<BaseUnit, string> = { kg: "/kg", L: "/L", ea: " each" };
