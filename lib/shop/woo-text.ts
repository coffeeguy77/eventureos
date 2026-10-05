/** WooCommerce text helpers (pure — no database). */
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#8217": "’", "#8216": "‘", "#8211": "–", "#8212": "—", nbsp: " ", "#038": "&", hellip: "…", "#8230": "…", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" };
export const decode = (t: string) => t.replace(/&(#?\w+);/g, (m, k: string) => ENT[k] ?? (k.startsWith("#") ? String.fromCharCode(Number(k.slice(1))) : m));

const GRIND_NAMES: Record<string, string> = { "whole-beans": "Whole beans", "whole beans": "Whole beans", espresso: "Espresso", stovetop: "Stovetop", "filter-machine": "Filter machine", "filter machine": "Filter machine", plunger: "Plunger" };
export const grindName = (raw: string) => GRIND_NAMES[raw.toLowerCase().trim()] ?? decode(raw).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Text that names a different coffee (e.g. a description copied from "Supreme" onto another blend) isn't published. */
export function copiedText(productName: string, t: string) {
  const other = t.match(/\b(Supreme)\b/);
  return !!other && !productName.toLowerCase().includes(other[1].toLowerCase());
}

/** Pull the useful parts out of a Bean-Culture-style WooCommerce description: "SUITABLE FOR …", "ABOUT THIS COFFEE …", recipe. */
export function splitDescription(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  const cut = t.split(/MAKE THINGS EASIER WITH A SUBSCRIPTION\??|GRIND:/i)[0].trim();
  const suitable = cut.match(/SUITABLE FOR\s+(.+?)\s+(ABOUT THIS COFFEE|TASTING NOTES|$)/i)?.[1]?.trim() ?? null;
  const about = cut.match(/ABOUT THIS COFFEE\s+(.+?)\s+(TASTING NOTES|ESPRESSO RECIPE|$)/i)?.[1]?.trim() ?? null;
  const notes = cut.match(/TASTING NOTES\s+(.+?)\s+(ESPRESSO RECIPE|$)/i)?.[1]?.trim() ?? null;
  const recipe = cut.match(/ESPRESSO RECIPE\s+(.+)$/i)?.[1]?.trim() ?? null;
  const pretty = (x: string | null, keys: string[]) => {
    if (!x) return null;
    let y = x;
    for (const k of keys) y = y.replace(new RegExp(`\\b${k}\\b`, "g"), `\n${k[0]}${k.slice(1).toLowerCase()}:`);
    return y.trim();
  };
  const parts = [
    about,
    notes ? `Tasting notes${pretty(notes, ["AROMA", "ACIDITY", "BODY", "FINISH"])}` : null,
    recipe ? `Espresso recipe${pretty(recipe, ["DOSE", "BREW TIME", "YIELD", "TEMP"])}` : null,
  ].filter(Boolean) as string[];
  return { bestFor: suitable, description: parts.length ? parts.join("\n\n") : cut || null };
}
