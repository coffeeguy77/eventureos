"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import type { RecipeLine } from "@/lib/kitchen/core";
import { allergenStatement, fmtNutrient, kcal, nutritionPanel, type NutritionIngredient } from "@/lib/kitchen/nutrition";
import { cn } from "@/lib/cn";

type MenuItem = { id: string; name: string; group: string };
const ROWS: [keyof ReturnType<typeof rowsOf>, string, string][] = [
  ["energy_kj", "Energy", "kJ"], ["protein", "Protein", "g"], ["fat", "Fat, total", "g"], ["sat_fat", "– saturated", "g"],
  ["carbs", "Carbohydrate", "g"], ["sugars", "– sugars", "g"], ["fibre", "Dietary fibre", "g"], ["sodium_mg", "Sodium", "mg"],
];
const rowsOf = (r: Record<string, number>) => r as Record<"energy_kj" | "protein" | "fat" | "sat_fat" | "carbs" | "sugars" | "fibre" | "sodium_mg", number>;

/**
 * Labels for catering items: the nutrition information panel (per serve and per 100 g), the ingredient list and the
 * allergens — worked out from the recipe and each ingredient's nutrition. Printable.
 */
export function KitchenLabels({ menu, recipes, ingredients, business, ready }: { menu: MenuItem[]; recipes: RecipeLine[]; ingredients: NutritionIngredient[]; business: string; ready: boolean }) {
  const withRecipe = menu.filter((m) => recipes.some((r) => r.service_id === m.id));
  const [id, setId] = useState(withRecipe[0]?.id ?? "");
  const [servings, setServings] = useState("1");
  const panels = useMemo(() => new Map(withRecipe.map((m) => [m.id, nutritionPanel(m.id, recipes, ingredients)])), [withRecipe, recipes, ingredients]);
  const item = menu.find((m) => m.id === id);
  const p = id ? panels.get(id) ?? null : null;
  const complete = (x: typeof p) => !!x && !x.missingNutrition.length && !x.missingWeight.length;
  const groups = [...new Set(withRecipe.map((m) => m.group))];

  if (!ready) return <Card className="p-5 text-[0.8125rem] text-ink-muted">Labels need the database update 0062_ingredient_nutrition.sql (Supabase → SQL editor).</Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-[0.75rem] text-ink-muted">Menu item
          <select value={id} onChange={(e) => setId(e.target.value)} className={cn(inputClass, "mt-1 h-9 min-w-[16rem] text-[0.8125rem]")}>
            {groups.map((g) => <optgroup key={g} label={g}>{withRecipe.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.name}{complete(panels.get(m.id) ?? null) ? "" : " (incomplete)"}</option>)}</optgroup>)}
          </select></label>
        <label className="text-[0.75rem] text-ink-muted">Servings per package
          <input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value.replace(/[^\d]/g, ""))} className={cn(inputClass, "mt-1 h-9 w-20 text-right text-[0.8125rem]")} /></label>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print label</Button>
      </div>

      {item && p && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="rounded-xl bg-white p-5 text-black ring-1 ring-zinc-300 print:ring-0" id="label">
            <p className="text-[1.0625rem] font-bold leading-tight">{item.name}</p>
            <p className="text-[0.75rem]">{business}</p>
            {!complete(p) && <p className="mt-1 rounded bg-rose-100 px-2 py-1 text-[0.75rem] font-semibold text-rose-800">DRAFT — not all ingredients have nutrition / weights yet, so these numbers are too low</p>}
            <div className="mt-3 border-2 border-black p-2">
              <p className="border-b-2 border-black pb-1 text-center text-[0.9375rem] font-extrabold tracking-wide">NUTRITION INFORMATION</p>
              <p className="mt-1 text-[0.75rem]">Servings per package: {Number(servings) || 1}</p>
              <p className="text-[0.75rem]">Serving size: {Math.round(p.serveGrams)} g</p>
              <table className="mt-1 w-full border-t border-black text-[0.75rem]">
                <thead><tr className="border-b border-black"><th /><th className="py-0.5 text-right font-semibold">Avg. quantity<br />per serving</th><th className="py-0.5 text-right font-semibold">Avg. quantity<br />per 100 g</th></tr></thead>
                <tbody>
                  {ROWS.map(([k, label, unit]) => (
                    <tr key={k} className="border-b border-zinc-300 last:border-black">
                      <td className={cn("py-0.5", label.startsWith("–") && "pl-3")}>{label}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtNutrient(k, rowsOf(p.perServe)[k])} {unit}{k === "energy_kj" ? <span className="block text-[0.6875rem]">({kcal(p.perServe.energy_kj)} Cal)</span> : null}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtNutrient(k, rowsOf(p.per100)[k])} {unit}{k === "energy_kj" ? <span className="block text-[0.6875rem]">({kcal(p.per100.energy_kj)} Cal)</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[0.75rem] leading-snug"><b>Ingredients:</b> {p.ingredients.map((i) => i.name).join(", ")}.</p>
            <p className="mt-2 text-[0.8125rem] font-bold">{allergenStatement(p.allergens)}</p>
            <p className="mt-2 text-[0.625rem] leading-snug text-zinc-600">Values are averages calculated from the recipe{p.sources.some((s) => s.startsWith("AFCD")) ? " and the Australian Food Composition Database (FSANZ)" : ""}.</p>
          </div>

          <div className="space-y-3 print:hidden">
            {!complete(p) && (
              <Card className="p-4 text-[0.8125rem] text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />Not finished — the panel leaves these out</p>
                {p.missingNutrition.length > 0 && <p className="mt-1">No nutrition yet: {p.missingNutrition.join(", ")}. Add it on the Ingredients tab (from the supplier&apos;s label or the food database).</p>}
                {p.missingWeight.length > 0 && <p className="mt-1">Weight of one not set: {p.missingWeight.join(", ")}. Weigh one and add it on the Ingredients tab.</p>}
              </Card>
            )}
            <Card className="p-4 text-[0.8125rem]">
              <p className="font-semibold text-ink">What&apos;s in one serve</p>
              <ul className="mt-1 space-y-0.5 text-ink-muted">{p.ingredients.map((i) => <li key={i.name} className="flex justify-between gap-3"><span>{i.name}</span><span className="tabular-nums">{Math.round(i.grams)} g · {i.percent < 1 ? "<1" : Math.round(i.percent)}%</span></li>)}</ul>
              <p className="mt-2 text-[0.75rem] text-ink-faint">Sources: {p.sources.length ? p.sources.join("; ") : "—"}</p>
            </Card>
          </div>
        </div>
      )}

      <Card className="overflow-x-auto print:hidden">
        <table className="w-full min-w-[640px] text-[0.8125rem]">
          <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-faint"><th className="px-4 py-2 font-medium">Item</th><th className="px-2 py-2 text-right font-medium">Serve</th><th className="px-2 py-2 text-right font-medium">Energy / serve</th><th className="px-2 py-2 font-medium">Allergens</th><th className="px-4 py-2 font-medium">Label</th></tr></thead>
          <tbody className="divide-y divide-line">
            {withRecipe.map((m) => { const x = panels.get(m.id) ?? null; return x && (
              <tr key={m.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setId(m.id)}>
                <td className="px-4 py-2 text-ink">{m.name}</td><td className="px-2 py-2 text-right tabular-nums">{Math.round(x.serveGrams)} g</td>
                <td className="px-2 py-2 text-right tabular-nums">{Math.round(x.perServe.energy_kj)} kJ <span className="text-ink-faint">({kcal(x.perServe.energy_kj)} Cal)</span></td>
                <td className="px-2 py-2 text-ink-muted">{x.allergens.join(", ") || "—"}</td>
                <td className="px-4 py-2">{complete(x) ? <span className="text-emerald-700">Ready</span> : <span className="text-amber-700">Incomplete</span>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
