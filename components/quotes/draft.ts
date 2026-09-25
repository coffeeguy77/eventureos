import { numStr, parseNum, priceStr } from "./calc";
import type { ItemPatch, QItem } from "./types";

/** A line item as edited in the browser: numeric fields are kept as the text the user typed. */
export interface ItemDraft extends Omit<QItem, "quantity" | "unit_price" | "tax_rate" | "discount_percent"> {
  quantity: string;
  unit_price: string;
  tax_rate: string;
  discount_percent: string;
}

export type NumField = "quantity" | "unit_price" | "tax_rate" | "discount_percent";
export type TextField = "name" | "description" | "unit" | "image_url";
export type BoolField = "is_optional" | "is_package";

export const NUM_FIELDS: NumField[] = ["quantity", "unit_price", "tax_rate", "discount_percent"];

export function toDraft(i: QItem): ItemDraft {
  return {
    ...i,
    quantity: numStr(i.quantity),
    unit_price: priceStr(i.unit_price),
    tax_rate: numStr(i.tax_rate),
    discount_percent: numStr(i.discount_percent),
  };
}

/** Numbers used for live totals (unparseable input counts as 0 until corrected). */
export function draftNums(d: ItemDraft) {
  return {
    section_id: d.section_id,
    is_optional: d.is_optional,
    quantity: parseNum(d.quantity) ?? 0,
    unit_price: parseNum(d.unit_price) ?? 0,
    tax_rate: parseNum(d.tax_rate) ?? 0,
    discount_percent: parseNum(d.discount_percent) ?? 0,
  };
}

/** Patch for one edited field, or null if the typed value isn't a valid number yet. */
export function fieldPatch(field: NumField | TextField | BoolField, value: string | boolean): ItemPatch | null {
  if (typeof value === "boolean") return { [field]: value } as ItemPatch;
  if ((NUM_FIELDS as string[]).includes(field)) {
    const n = parseNum(value);
    if (n == null) return null;
    return { [field]: n } as ItemPatch;
  }
  if (field === "name") return { name: value };
  return { [field]: value.trim() ? value : null } as ItemPatch;
}
