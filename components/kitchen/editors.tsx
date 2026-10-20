"use client";
import { useMemo, useState, useTransition } from "react";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { Ingredient, RecipeLine } from "@/lib/kitchen/core";
import { AFCD, afcdSource } from "@/lib/kitchen/afcd";
import { ALLERGENS } from "@/lib/kitchen/nutrition";
import * as office from "@/app/(app)/kitchen/actions";
import type { IngredientInput, RecipeInput } from "@/lib/kitchen/store";

type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
/** Where the editors save — the office Kitchen actions by default, or the chef's staff-app actions. */
export interface KitchenActions {
  saveIngredient: (i: IngredientInput) => Promise<R>;
  archiveIngredient: (id: string, active: boolean) => Promise<R>;
  saveRecipe: (serviceId: string, lines: RecipeInput[]) => Promise<R>;
}
const OFFICE: KitchenActions = { saveIngredient: office.saveIngredient, archiveIngredient: office.archiveIngredient, saveRecipe: office.saveRecipe };

export function PrintButton() {
  return <Button type="button" size="sm" onClick={() => window.print()} className="print:hidden"><Printer className="h-3.5 w-3.5" />Print</Button>;
}

const UNITS = ["each", "g", "kg", "ml", "L", "slice", "loaf", "dozen", "punnet", "bunch", "tbsp"];
const NUT_FIELDS: [string, string][] = [["energy_kj", "Energy (kJ)"], ["protein", "Protein (g)"], ["fat", "Fat, total (g)"], ["sat_fat", "– saturated (g)"], ["carbs", "Carbohydrate (g)"], ["sugars", "– sugars (g)"], ["fibre", "Dietary fibre (g)"], ["sodium_mg", "Sodium (mg)"]];
const blank = { id: null as string | null, name: "", unit: "each", pack_size: null as number | null, pack_label: "", supplier: "", station: "", notes: "",
  grams_each: "" as string, nut: {} as Record<string, string>, source: "", allergens: [] as string[] };
type LabelInfo = { nutrition?: Record<string, number> | null; nutrition_source?: string | null; grams_each?: number | null; allergens?: string[] | null };

export function IngredientsEditor({ items, actions = OFFICE, labels = false }: { items: (Ingredient & { active: boolean } & LabelInfo)[]; actions?: KitchenActions; labels?: boolean }) {
  const { saveIngredient, archiveIngredient } = actions;
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [pending, start] = useTransition();
  const list = items.filter((i) => showHidden || i.active);
  const save = () => edit && start(async () => {
    const nutrition = NUT_FIELDS.every(([k]) => k === "fibre" || (edit.nut[k] ?? "").trim() !== "") ? Object.fromEntries(NUT_FIELDS.filter(([k]) => (edit.nut[k] ?? "").trim() !== "").map(([k]) => [k, Number(edit.nut[k])])) : null;
    const { grams_each, nut: _n, source, allergens, ...rest } = edit;
    const r = await saveIngredient({ ...rest, pack_label: edit.pack_label || null, supplier: edit.supplier || null, station: edit.station || null, notes: edit.notes || null,
      ...(labels ? { nutrition, nutrition_source: source.trim() || null, grams_each: grams_each ? Number(grams_each) : null, allergens } : {}) });
    if (r.ok) { setEdit(null); setMsg("Saved."); } else setMsg(r.error);
  });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-ink">Ingredients</h2><p className="text-[0.8125rem] text-ink-muted">What you buy. Pack size rounds the order list up to whole packs (e.g. eggs by the dozen, flour by the 10 kg bag).</p></div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[0.7812rem] text-ink-muted"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />Show hidden</label>
          <Button type="button" variant="primary" size="sm" onClick={() => setEdit({ ...blank })}><Plus className="h-3.5 w-3.5" />Ingredient</Button>
        </div>
      </div>
      {edit && (
        <div className="mt-4 grid gap-3 rounded-lg border border-line bg-zinc-50/60 p-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><Label htmlFor="ing-n">Name</Label><Input id="ing-n" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
          <div><Label htmlFor="ing-u">Unit</Label><Select id="ing-u" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{[...new Set([edit.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}</Select></div>
          <div><Label htmlFor="ing-p" hint={edit.unit}>Pack size</Label><Input id="ing-p" type="number" min={0} step="any" value={edit.pack_size ?? ""} onChange={(e) => setEdit({ ...edit, pack_size: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ing-pl">Pack name</Label><Input id="ing-pl" value={edit.pack_label ?? ""} onChange={(e) => setEdit({ ...edit, pack_label: e.target.value })} placeholder="10 kg bag" /></div>
          <div className="sm:col-span-2"><Label htmlFor="ing-s">Supplier</Label><Input id="ing-s" value={edit.supplier ?? ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ing-st">Kitchen station</Label><Input id="ing-st" value={edit.station ?? ""} onChange={(e) => setEdit({ ...edit, station: e.target.value })} placeholder="Bakery, cold prep…" /></div>
          {labels && (
            <div className="space-y-3 rounded-lg bg-surface p-3 ring-1 ring-line sm:col-span-6">
              <div className="flex flex-wrap items-end gap-3">
                <p className="mr-auto text-[0.8125rem] font-semibold text-ink">For labels <span className="font-normal text-ink-muted">— nutrition per 100 g and allergens</span></p>
                <label className="text-[0.75rem] text-ink-muted">Fill from the food database
                  <Select aria-label="Fill from the Australian Food Composition Database" value="" onChange={(e) => { const f = AFCD.find((x) => x.key === e.target.value); if (f) setEdit({ ...edit, nut: Object.fromEntries(Object.entries(f.per100).map(([k, v]) => [k, String(v)])), source: afcdSource(f) }); }} className="mt-1 max-w-xs">
                    <option value="">Choose the closest food…</option>
                    {AFCD.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                  </Select></label>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {NUT_FIELDS.map(([k, label]) => <div key={k}><Label htmlFor={`nut-${k}`}>{label}</Label><Input id={`nut-${k}`} inputMode="decimal" value={edit.nut[k] ?? ""} onChange={(e) => setEdit({ ...edit, nut: { ...edit.nut, [k]: e.target.value.replace(/[^\d.]/g, "") } })} /></div>)}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-3"><Label htmlFor="nut-src">Where the numbers came from</Label><Input id="nut-src" value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} placeholder="Supplier label, or the food database" /></div>
                {!["g", "kg", "ml", "l"].includes(edit.unit.toLowerCase()) && <div><Label htmlFor="nut-ge" hint="weigh one">Grams per {edit.unit}</Label><Input id="nut-ge" inputMode="decimal" value={edit.grams_each} onChange={(e) => setEdit({ ...edit, grams_each: e.target.value.replace(/[^\d.]/g, "") })} /></div>}
              </div>
              <div>
                <p className="text-[0.75rem] text-ink-muted">Allergens in this ingredient (check the supplier&apos;s label)</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {ALLERGENS.map((a) => <label key={a} className="flex items-center gap-1.5 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={edit.allergens.includes(a)} onChange={(e) => setEdit({ ...edit, allergens: e.target.checked ? [...edit.allergens, a] : edit.allergens.filter((x) => x !== a) })} />{a}</label>)}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 sm:col-span-2"><Button type="button" variant="primary" disabled={pending} onClick={save}><Save className="h-3.5 w-3.5" />Save</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </div>
      )}
      {msg && <p className="mt-3 text-[0.8125rem] text-ink-muted" role="status">{msg}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[0.8125rem]">
          <thead><tr className="text-left text-ink-faint"><th className="py-2 font-medium">Name</th><th className="font-medium">Unit</th><th className="font-medium">Pack</th><th className="font-medium">Supplier</th><th className="font-medium">Station</th>{labels && <th className="font-medium">Label</th>}<th /></tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((i) => (
              <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                <td className="py-2 font-medium text-ink">{i.name}</td><td>{i.unit}</td><td>{i.pack_size ? `${i.pack_size} ${i.unit}${i.pack_label ? ` (${i.pack_label})` : ""}` : "—"}</td><td>{i.supplier ?? "—"}</td><td>{i.station ?? "—"}</td>
                {labels && <td className="text-[0.75rem]">{i.nutrition ? <span className="text-emerald-700">Nutrition ✓</span> : <span className="text-amber-700">No nutrition</span>}{i.allergens?.length ? <span className="block text-ink-muted">{i.allergens.join(", ")}</span> : null}{!["g", "kg", "ml", "l"].includes(i.unit.toLowerCase()) && !i.grams_each ? <span className="block text-amber-700">Weight per {i.unit} not set</span> : null}</td>}
                <td className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEdit({ id: i.id, name: i.name, unit: i.unit, pack_size: i.pack_size, pack_label: i.pack_label ?? "", supplier: i.supplier ?? "", station: i.station ?? "", notes: i.notes ?? "",
                    grams_each: i.grams_each ? String(i.grams_each) : "", nut: Object.fromEntries(Object.entries(i.nutrition ?? {}).map(([k, v]) => [k, String(v)])), source: i.nutrition_source ?? "", allergens: i.allergens ?? [] })}>Edit</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => start(async () => { const r = await archiveIngredient(i.id, !i.active); setMsg(r.ok ? r.data : r.error); })}>{i.active ? "Hide" : "Use again"}</Button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="py-6 text-center text-ink-muted">No ingredients yet — add the things you buy for catering.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RecipesEditor({ menu, ingredients, recipes, actions = OFFICE }: { menu: { id: string; name: string; group: string; unit: string | null }[]; ingredients: Ingredient[]; recipes: RecipeLine[]; actions?: KitchenActions }) {
  const { saveRecipe } = actions;
  const [sel, setSel] = useState(menu[0]?.id ?? "");
  const current = useMemo(() => recipes.filter((r) => r.service_id === sel).map((r) => ({ ingredient_id: r.ingredient_id, qty_per_serve: r.qty_per_serve, prep_note: r.prep_note ?? "" })), [recipes, sel]);
  const [lines, setLines] = useState(current);
  const [loaded, setLoaded] = useState(sel);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (loaded !== sel) { setLoaded(sel); setLines(current); setMsg(null); }
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const item = menu.find((m) => m.id === sel);
  const groups = [...new Set(menu.map((m) => m.group))];
  const count = (id: string) => recipes.filter((r) => r.service_id === id).length;
  if (!menu.length) return <Card className="p-5 text-[0.8125rem] text-ink-muted">Add catering items to your price list (Settings → Services &amp; pricing, category starting with &quot;Catering&quot;) to write recipes.</Card>;
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card className="max-h-[70vh] overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g} className="mb-2">
            <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{g}</p>
            {menu.filter((m) => m.group === g).map((m) => (
              <button key={m.id} type="button" onClick={() => setSel(m.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[0.8125rem] ${sel === m.id ? "bg-brand-50 font-medium text-ink" : "text-ink-muted hover:bg-zinc-50"}`}>
                <span className="truncate">{m.name}</span>{count(m.id) ? <span className="text-[0.6875rem] text-ink-faint">{count(m.id)}</span> : <span className="text-[0.6875rem] text-amber-600">no recipe</span>}
              </button>
            ))}
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold text-ink">{item?.name}</h2>
        <p className="text-[0.8125rem] text-ink-muted">Ingredients for <strong>one {/person/i.test(item?.unit ?? "") ? "person" : "serve"}</strong>. The order list multiplies these by what&apos;s been ordered.</p>
        {!ingredients.length && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-800">Add some ingredients first (Ingredients tab).</p>}
        <div className="mt-4 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_0.7fr_1.4fr_auto]">
              <Select aria-label="Ingredient" value={l.ingredient_id} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}>
                <option value="">Choose…</option>{ingredients.filter((x) => x.active !== false || x.id === l.ingredient_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <div className="flex items-center gap-1.5"><Input aria-label="Amount per serve" type="number" min={0} step="any" value={l.qty_per_serve || ""} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty_per_serve: Number(e.target.value) } : x)))} /><span className="text-[0.75rem] text-ink-faint">{ing.get(l.ingredient_id)?.unit ?? ""}</span></div>
              <Input aria-label="Prep note" placeholder="Prep note (e.g. slice thin, bake 180°C 20 min)" value={l.prep_note} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, prep_note: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setLines([...lines, { ingredient_id: "", qty_per_serve: 0, prep_note: "" }])}><Plus className="h-3.5 w-3.5" />Ingredient</Button>
          <Button type="button" size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveRecipe(sel, lines.map((l) => ({ ...l, prep_note: l.prep_note || null }))); setMsg(r.ok ? r.data : r.error); })}><Save className="h-3.5 w-3.5" />Save recipe</Button>
          {msg && <span className="text-[0.8125rem] text-ink-muted" role="status">{msg}</span>}
        </div>
      </Card>
    </div>
  );
}
