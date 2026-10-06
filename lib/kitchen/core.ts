/**
 * Catering kitchen: turns upcoming catering deliveries + recipes into a production list, a shopping (order) list and a run sheet.
 * Pure — no database.
 */

export interface Ingredient { id: string; name: string; unit: string; pack_size: number | null; pack_label: string | null; supplier: string | null; station: string | null; notes?: string | null; active?: boolean }
export interface RecipeLine { id?: string; service_id: string; ingredient_id: string; qty_per_serve: number; prep_note: string | null }
export interface DeliveryItem { service_id: string | null; name: string; qty: number }
export interface Delivery {
  event_id: string; event_number: string | null; title: string; customer: string | null; status: string; firm: boolean;
  date: string; time: string | null; label: string; address: string | null; venue: string | null; guests: number | null; notes: string | null;
  items: DeliveryItem[];
}

export interface ProductionRow { service_id: string | null; name: string; total: number; byDate: Record<string, number>; prep: string[]; noRecipe: boolean }
export interface ShoppingRow { ingredient: Ingredient; needed: number; packs: number | null; buy: number; usedIn: string[] }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How many of each menu item to make, across the deliveries. */
export function production(deliveries: Delivery[], recipes: RecipeLine[]): ProductionRow[] {
  const withRecipe = new Set(recipes.map((r) => r.service_id));
  const m = new Map<string, ProductionRow>();
  for (const d of deliveries) for (const it of d.items) {
    if (it.qty <= 0) continue;
    const key = it.service_id ?? `name:${it.name.toLowerCase()}`;
    const row = m.get(key) ?? { service_id: it.service_id, name: it.name, total: 0, byDate: {}, prep: [], noRecipe: !it.service_id || !withRecipe.has(it.service_id) };
    row.total += it.qty;
    row.byDate[d.date] = (row.byDate[d.date] ?? 0) + it.qty;
    m.set(key, row);
  }
  for (const row of m.values()) row.prep = [...new Set(recipes.filter((r) => r.service_id === row.service_id && r.prep_note).map((r) => r.prep_note!))];
  return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** What to order: ingredients × serves, rounded up to whole packs, grouped later by supplier. */
export function shoppingList(deliveries: Delivery[], recipes: RecipeLine[], ingredients: Ingredient[]): ShoppingRow[] {
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const need = new Map<string, { n: number; used: Set<string> }>();
  for (const d of deliveries) for (const it of d.items) {
    if (!it.service_id || it.qty <= 0) continue;
    for (const r of recipes.filter((x) => x.service_id === it.service_id)) {
      if (!ing.has(r.ingredient_id)) continue;
      const x = need.get(r.ingredient_id) ?? { n: 0, used: new Set<string>() };
      x.n += r.qty_per_serve * it.qty;
      x.used.add(it.name);
      need.set(r.ingredient_id, x);
    }
  }
  return [...need.entries()].map(([id, x]) => {
    const i = ing.get(id)!;
    const needed = r3(x.n);
    const packs = i.pack_size ? Math.ceil(needed / i.pack_size - 1e-9) : null;
    return { ingredient: i, needed, packs, buy: packs !== null ? r3(packs * i.pack_size!) : needed, usedIn: [...x.used].sort() };
  }).sort((a, b) => (a.ingredient.supplier ?? "~").localeCompare(b.ingredient.supplier ?? "~") || a.ingredient.name.localeCompare(b.ingredient.name));
}

/** Run sheet: deliveries in time order per day. */
export function runSheet(deliveries: Delivery[]) {
  const days = new Map<string, Delivery[]>();
  for (const d of deliveries) (days.get(d.date) ?? days.set(d.date, []).get(d.date)!).push(d);
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, deliveries: list.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99")) }));
}

const FIRM = ["confirmed", "awaiting_approval"];

/** Turn events.catering (from the website order) into deliveries. */
export function deliveriesFromEvent(e: { id: string; number: number | null; title: string; status: string; event_date: string | null; start_time: string | null; address: string | null; venue: string | null; guest_count: number | null; customer_notes: string | null; catering: unknown; customer?: string | null }): Delivery[] {
  const list = Array.isArray(e.catering) ? (e.catering as Record<string, unknown>[]) : [];
  return list.map((c) => ({
    event_id: e.id, event_number: e.number ? `EV-${e.number}` : null, title: e.title, customer: e.customer ?? null, status: e.status, firm: FIRM.includes(e.status),
    date: typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : e.event_date ?? "",
    time: typeof c.time === "string" ? c.time.slice(0, 5) : e.start_time?.slice(0, 5) ?? null,
    label: typeof c.label === "string" ? c.label : "Delivery",
    address: e.address, venue: e.venue, guests: e.guest_count, notes: e.customer_notes,
    items: (Array.isArray(c.items) ? (c.items as Record<string, unknown>[]) : []).map((i) => ({ service_id: typeof i.service_id === "string" ? i.service_id : null, name: String(i.name ?? "Item"), qty: Number(i.qty) || 0 })).filter((i) => i.qty > 0),
  })).filter((d) => d.date && d.items.length);
}

/** Format an amount with its unit, e.g. 1.5 kg, 24 each. */
export const amount = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, "")} ${unit}`;
