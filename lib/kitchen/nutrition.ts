/**
 * Nutrition information for catering items, worked out from their recipes (per serve) and each ingredient's nutrition
 * per 100 g — the way a nutrition information panel (NIP) is calculated for a label in Australia (FSANZ Standard 1.2.8):
 * energy, protein, fat (total), saturated fat, carbohydrate, sugars and sodium, per serve and per 100 g.
 * Also the ingredient list (heaviest first) and the allergen summary. Pure — no database.
 */
import type { RecipeLine } from "./core";

export interface Per100 { energy_kj: number; protein: number; fat: number; sat_fat: number; carbs: number; sugars: number; fibre?: number; sodium_mg: number }
export interface NutritionIngredient {
  id: string; name: string; unit: string;
  nutrition?: unknown; grams_each?: number | null; allergens?: string[] | null; nutrition_source?: string | null;
}

/** The allergens Australian labels must declare (plain-English names; sulphites when added at 10 mg/kg or more). */
export const ALLERGENS = ["gluten", "wheat", "milk", "egg", "soy", "sesame", "peanut", "tree nuts", "fish", "crustacea", "mollusc", "lupin", "sulphites"] as const;

const NUTRIENTS = ["energy_kj", "protein", "fat", "sat_fat", "carbs", "sugars", "fibre", "sodium_mg"] as const;
type Key = (typeof NUTRIENTS)[number];

/** Read stored nutrition (null when it isn't all there). */
export function readPer100(v: unknown): Per100 | null {
  const r = (v && typeof v === "object" && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
  if (!r) return null;
  const n = (k: string) => { const x = Number(r[k]); return Number.isFinite(x) && x >= 0 ? x : null; };
  const out: Partial<Record<Key, number>> = {};
  for (const k of NUTRIENTS) { const x = n(k); if (x == null && k !== "fibre") return null; if (x != null) out[k] = x; }
  return out as Per100;
}

/** Grams in one unit of the ingredient as the recipe counts it (g, kg, ml, L, or each/slice/piece with a weight set). */
export function gramsPerUnit(i: Pick<NutritionIngredient, "unit" | "grams_each">): number | null {
  const u = i.unit.trim().toLowerCase();
  if (u === "g") return 1;
  if (u === "kg") return 1000;
  if (u === "ml") return 1;             // close enough for sauces, dressings, milk (≈1 g/ml)
  if (u === "l") return 1000;
  if (u === "tbsp") return 15;
  return i.grams_each && i.grams_each > 0 ? Number(i.grams_each) : null;
}

export interface Panel {
  serveGrams: number;
  perServe: Record<Key, number>;
  per100: Record<Key, number>;
  /** Ingredients heaviest first (for the ingredient list) */
  ingredients: { name: string; grams: number; percent: number }[];
  allergens: string[];
  /** What's missing — the panel leaves these out until they're filled in */
  missingNutrition: string[]; missingWeight: string[];
  sources: string[];
}

/** The panel for one menu item from its recipe lines. null when it has no recipe. */
export function nutritionPanel(serviceId: string, recipes: RecipeLine[], ingredients: NutritionIngredient[]): Panel | null {
  const lines = recipes.filter((r) => r.service_id === serviceId && r.qty_per_serve > 0);
  if (!lines.length) return null;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const totals = Object.fromEntries(NUTRIENTS.map((k) => [k, 0])) as Record<Key, number>;
  const parts: { name: string; grams: number }[] = [];
  const missingNutrition: string[] = [], missingWeight: string[] = [];
  const allergens = new Set<string>(), sources = new Set<string>();
  let grams = 0;
  for (const l of lines) {
    const ing = byId.get(l.ingredient_id);
    if (!ing) continue;
    for (const a of ing.allergens ?? []) allergens.add(a);
    const per = gramsPerUnit(ing);
    if (per == null) { missingWeight.push(ing.name); continue; }
    const g = per * Number(l.qty_per_serve);
    grams += g;
    parts.push({ name: ing.name, grams: g });
    const n = ing.nutrition ? readPer100(ing.nutrition) : null;
    if (!n) { missingNutrition.push(ing.name); continue; }
    if (ing.nutrition_source) sources.add(ing.nutrition_source);
    for (const k of NUTRIENTS) totals[k] += ((n[k as keyof Per100] as number | undefined) ?? 0) * g / 100;
  }
  const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, grams > 0 ? (totals[k] / grams) * 100 : 0])) as Record<Key, number>;
  parts.sort((a, b) => b.grams - a.grams);
  return {
    serveGrams: grams, perServe: totals, per100,
    ingredients: parts.map((p) => ({ ...p, percent: grams > 0 ? (p.grams / grams) * 100 : 0 })),
    allergens: ALLERGENS.filter((a) => allergens.has(a)), missingNutrition, missingWeight, sources: [...sources],
  };
}

/** Numbers as they're usually shown on a panel: energy in whole kJ, grams to one decimal (no more than 3 figures), sodium in whole mg. */
export function fmtNutrient(k: Key, v: number): string {
  if (k === "energy_kj" || k === "sodium_mg") return String(Math.round(v));
  if (v >= 100) return String(Math.round(v));
  if (v < 1) return v.toFixed(1);
  return (Math.round(v * 10) / 10).toFixed(1);
}
export const kcal = (kj: number) => Math.round(kj / 4.184);

/** "Contains: gluten, wheat, milk, egg." */
export const allergenStatement = (list: string[]) => (list.length ? `Contains: ${list.join(", ")}.` : "No declared allergens in the recipe's ingredients.");

/** What the public menu shows behind its "Nutrition" pill — only for a finished panel (every ingredient has nutrition and a weight). */
export interface PublicNutrition { serveGrams: number; perServe: Record<Key, number>; per100: Record<Key, number>; ingredients: string[]; allergens: string[]; afcd: boolean }
export function publicNutrition(p: Panel | null): PublicNutrition | null {
  if (!p || p.missingNutrition.length || p.missingWeight.length || p.serveGrams <= 0) return null;
  return { serveGrams: p.serveGrams, perServe: p.perServe, per100: p.per100, ingredients: p.ingredients.map((i) => i.name), allergens: p.allergens, afcd: p.sources.some((s) => s.startsWith("AFCD")) };
}
export const NIP_ROWS: [Key, string, string][] = [
  ["energy_kj", "Energy", "kJ"], ["protein", "Protein", "g"], ["fat", "Fat, total", "g"], ["sat_fat", "– saturated", "g"],
  ["carbs", "Carbohydrate", "g"], ["sugars", "– sugars", "g"], ["fibre", "Dietary fibre", "g"], ["sodium_mg", "Sodium", "mg"],
];

/** Ingredient list for a label, heaviest first, with each ingredient's share of the serve. */
export const ingredientList = (p: Panel) => p.ingredients.map((i) => `${i.name} (${i.percent < 1 ? "<1" : Math.round(i.percent)}%)`).join(", ");
