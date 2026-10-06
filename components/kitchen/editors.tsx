"use client";
import { useMemo, useState, useTransition } from "react";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { Ingredient, RecipeLine } from "@/lib/kitchen/core";
import { archiveIngredient, saveIngredient, saveRecipe } from "@/app/(app)/kitchen/actions";

export function PrintButton() {
  return <Button type="button" size="sm" onClick={() => window.print()} className="print:hidden"><Printer className="h-3.5 w-3.5" />Print</Button>;
}

const UNITS = ["each", "g", "kg", "ml", "L", "slice", "loaf", "dozen", "punnet", "bunch", "tbsp"];
const blank = { id: null as string | null, name: "", unit: "each", pack_size: null as number | null, pack_label: "", supplier: "", station: "", notes: "" };

export function IngredientsEditor({ items }: { items: (Ingredient & { active: boolean })[] }) {
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [pending, start] = useTransition();
  const list = items.filter((i) => showHidden || i.active);
  const save = () => edit && start(async () => {
    const r = await saveIngredient({ ...edit, pack_label: edit.pack_label || null, supplier: edit.supplier || null, station: edit.station || null, notes: edit.notes || null });
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
          <div className="flex items-end gap-2 sm:col-span-2"><Button type="button" variant="primary" disabled={pending} onClick={save}><Save className="h-3.5 w-3.5" />Save</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </div>
      )}
      {msg && <p className="mt-3 text-[0.8125rem] text-ink-muted" role="status">{msg}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[0.8125rem]">
          <thead><tr className="text-left text-ink-faint"><th className="py-2 font-medium">Name</th><th className="font-medium">Unit</th><th className="font-medium">Pack</th><th className="font-medium">Supplier</th><th className="font-medium">Station</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((i) => (
              <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                <td className="py-2 font-medium text-ink">{i.name}</td><td>{i.unit}</td><td>{i.pack_size ? `${i.pack_size} ${i.unit}${i.pack_label ? ` (${i.pack_label})` : ""}` : "—"}</td><td>{i.supplier ?? "—"}</td><td>{i.station ?? "—"}</td>
                <td className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEdit({ id: i.id, name: i.name, unit: i.unit, pack_size: i.pack_size, pack_label: i.pack_label ?? "", supplier: i.supplier ?? "", station: i.station ?? "", notes: i.notes ?? "" })}>Edit</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => start(async () => { const r = await archiveIngredient(i.id, !i.active); setMsg(r.ok ? r.data : r.error); })}>{i.active ? "Hide" : "Use again"}</Button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="py-6 text-center text-ink-muted">No ingredients yet — add the things you buy for catering.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RecipesEditor({ menu, ingredients, recipes }: { menu: { id: string; name: string; group: string; unit: string | null }[]; ingredients: Ingredient[]; recipes: RecipeLine[] }) {
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
