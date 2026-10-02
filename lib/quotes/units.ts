/**
 * A line's unit shown with its quantity: "1 Day Hire", "3 Days Hire", "2 Carts", "1 Event".
 * Only the first word is made plural, and only ordinary words (not "each", "per hour", "hrs"…).
 */
const KEEP = new Set(["each", "ea", "per", "x", "lot", "pax", "hrs", "kg", "g", "ml", "l", "km", "m"]);
const IRREGULAR: Record<string, string> = { person: "people", child: "children", box: "boxes", batch: "batches" };

export function pluralUnit(unit: string, qty: number): string {
  const u = unit.trim();
  if (!u || Number(qty) === 1) return u;
  const m = /^([A-Za-z]+)(.*)$/.exec(u);
  if (!m) return u;
  const [, word, rest] = m;
  const lower = word.toLowerCase();
  if (KEEP.has(lower) || /s$/i.test(word) || word.length < 2) return u;
  let plural = IRREGULAR[lower] ?? (/[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`);
  if (word === word.toUpperCase()) plural = plural.toUpperCase();
  else if (word[0] === word[0].toUpperCase()) plural = plural[0].toUpperCase() + plural.slice(1);
  return plural + rest;
}

/** "3 Days Hire" — quantity and unit together */
export const qtyUnit = (qty: number, unit: string | null | undefined) => `${Number(qty)}${unit?.trim() ? ` ${pluralUnit(unit, Number(qty))}` : ""}`;
