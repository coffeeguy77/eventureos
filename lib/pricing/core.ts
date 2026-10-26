/**
 * Pricing (pure): matching the same product across invoices, Gmail searches for a supplier's invoices,
 * and grouping similar products across suppliers for search ("syrup" → every supplier's syrups).
 */

/** Same product from the same supplier: its code when the invoice prints one, otherwise the cleaned name. */
export function matchKey(description: string, code?: string | null) {
  const c = (code ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (c && c.length >= 2) return `code:${c}`;
  return `desc:${description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

export interface SupplierRules { match_from: string[]; match_subject: string | null; match_exclude: string[] }

/** The Gmail search for a supplier's invoices after a date (sender and/or subject; both when both are set). */
export function buildQuery(s: SupplierRules, after: string) {
  const parts: string[] = [];
  const froms = s.match_from.map((f) => f.trim()).filter((f) => /^@?[^\s@()"]+(@[^\s@()"]+)?$/.test(f));
  if (froms.length) parts.push(`from:(${froms.join(" OR ")})`);
  if (s.match_subject?.trim()) parts.push(`subject:(${JSON.stringify(s.match_subject.trim())})`);
  if (!parts.length) return null;
  for (const x of s.match_exclude.map((w) => w.trim()).filter(Boolean)) parts.push(`-subject:(${JSON.stringify(x)})`);
  parts.push("has:attachment", `after:${after.replace(/-/g, "/")}`);
  return parts.join(" ");
}

/** Clean list of sender addresses / domains typed by a person. */
export function cleanSenders(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const v of list) {
    const t = String(v ?? "").trim().toLowerCase().replace(/^mailto:/, "");
    if ((/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) || /^@?[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

const STOP = new Set(["the", "and", "of", "x", "pk", "pack", "ctn", "carton", "each", "ea", "btl", "bottle", "box", "bag", "case", "tub", "jar", "tin", "can"]);
/** Words that identify a product, for search and for lining up similar products from different suppliers. */
export function productWords(description: string): string[] {
  return description.toLowerCase().replace(/(\d+(?:\.\d+)?)\s*(ml|l|lt|ltr|kg|g|gm|gr)\b/g, " ").replace(/[^a-z]+/g, " ").split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Does a product match a search? Every word typed must start a word in the product name (or its supplier). */
export function matchesSearch(text: string, q: string) {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => words.some((w) => w.startsWith(t)));
}
