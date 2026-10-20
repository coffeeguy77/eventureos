"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { amount, shoppingList, type Ingredient, type RecipeLine } from "@/lib/kitchen/core";
import { cn } from "@/lib/cn";

type MenuItem = { id: string; name: string; group: string; unit: string | null };

/**
 * Ingredient calculator: pick menu items and how many, and see every ingredient to order — from the recipes
 * (per serve × quantity), with an optional extra % for wastage, rounded up to whole packs where a pack size is set.
 */
export function KitchenCalculator({ menu, recipes, ingredients }: { menu: MenuItem[]; recipes: RecipeLine[]; ingredients: Ingredient[] }) {
  const [rows, setRows] = useState<{ id: string; qty: string }[]>([{ id: "", qty: "" }]);
  const [extra, setExtra] = useState("0");
  const groups = [...new Set(menu.map((m) => m.group))];
  const withRecipe = new Set(recipes.map((r) => r.service_id));
  const pct = Math.max(0, Math.min(100, Number(extra) || 0));
  const list = useMemo(() => {
    const items = rows.filter((r) => r.id && Number(r.qty) > 0).map((r) => ({ service_id: r.id, name: menu.find((m) => m.id === r.id)?.name ?? "Item", qty: Number(r.qty) * (1 + pct / 100) }));
    if (!items.length) return [];
    return shoppingList([{ event_id: "calc", event_number: null, title: "", customer: null, status: "", firm: true, date: "", time: null, label: "", address: null, venue: null, guests: null, notes: null, items }], recipes, ingredients);
  }, [rows, pct, menu, recipes, ingredients]);
  const field = cn(inputClass, "h-9 text-[0.8125rem]");
  const stations = [...new Set(list.map((s) => s.ingredient.station ?? "Other"))];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">What are you making?</h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">Pick items and how many serves (people). The ingredients update as you type.</p>
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label={`Item ${i + 1}`} value={r.id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} className={cn(field, "min-w-0 flex-1")}>
                <option value="">Choose an item…</option>
                {groups.map((g) => <optgroup key={g} label={g}>{menu.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.name}{withRecipe.has(m.id) ? "" : " (no recipe yet)"}</option>)}</optgroup>)}
              </select>
              <input inputMode="numeric" aria-label={`Serves for item ${i + 1}`} placeholder="Serves" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d]/g, "") } : x)))} className={cn(field, "w-24 text-right tabular-nums")} />
              <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ id: "", qty: "" }])} className="grid h-9 w-9 place-items-center rounded-md text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { id: "", qty: "" }])}><Plus className="h-3.5 w-3.5" />Add an item</Button>
          <label className="ml-auto flex items-center gap-2 text-[0.8125rem] text-ink-muted">Extra for wastage<input inputMode="numeric" aria-label="Extra percent for wastage" value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^\d]/g, ""))} className={cn(field, "w-16 text-right")} />%</label>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Ingredients to order</h2>
        {!list.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">Choose items with recipes to see the ingredients.</p> : (
          <div className="mt-3 space-y-4">
            {stations.map((st) => (
              <div key={st}>
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{st}</p>
                <table className="mt-1 w-full text-[0.8125rem]"><tbody className="divide-y divide-line">
                  {list.filter((s) => (s.ingredient.station ?? "Other") === st).map((s) => (
                    <tr key={s.ingredient.id}>
                      <td className="py-1.5"><span className="font-medium text-ink">{s.ingredient.name}</span><span className="block text-[0.6875rem] text-ink-faint">{s.usedIn.join(", ")}</span></td>
                      <td className="text-right tabular-nums text-ink-muted">{amount(s.needed, s.ingredient.unit)}</td>
                      <td className="w-36 text-right font-semibold tabular-nums">{s.packs !== null ? `${s.packs} × ${s.ingredient.pack_label || amount(s.ingredient.pack_size!, s.ingredient.unit)}` : ""}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            ))}
            <p className="text-[0.7188rem] text-ink-faint">Set pack sizes on the Ingredients tab to round up to whole packs (e.g. eggs by the dozen).</p>
          </div>
        )}
      </Card>
    </div>
  );
}
