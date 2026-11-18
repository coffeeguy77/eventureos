"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { aud } from "@/lib/sales/format";
import { savePageContent } from "@/app/(app)/business-sale/actions";
import { FIGURES, type FigureKey, type PageSettings, type SaleTerm } from "@/lib/sales/page-settings";
import type { YearStats } from "@/lib/sales/stats";

const n0 = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-AU"));

export function SalesPageEditor({ listingId, initial, suggested, categories, years, profit12, equipmentValue }: {
  listingId: string; initial: PageSettings; suggested: string[]; categories: { category: string; sales: number }[];
  years: YearStats[]; profit12: number; equipmentValue: number;
}) {
  const router = useRouter();
  const [p, setP] = useState<PageSettings>(() => ({ ...initial, coffee_categories: initial.coffee_categories ?? suggested }));
  const [dirty, setDirty] = useState(initial.coffee_categories === null && suggested.length > 0);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (patch: Partial<PageSettings>) => { setP((o) => ({ ...o, ...patch })); setDirty(true); setSaved(false); };
  const coffee = p.coffee_categories ?? [];
  const has = (list: string[], c: string) => list.some((x) => x.toLowerCase() === c.toLowerCase());
  const toggle = (list: string[], c: string) => (has(list, c) ? list.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...list, c]);
  const setTerm = (i: number, patch: Partial<SaleTerm>) => set({ terms: p.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const catSales = (cats: string[]) => categories.filter((c) => has(cats, c.category)).reduce((t, c) => t + c.sales, 0);
  const addbacks = p.valuation.addbacks.reduce((t, a) => t + (Number(a.amount) || 0), 0);
  const adjusted = profit12 + addbacks, value = Math.max(0, adjusted) * p.valuation.multiple + equipmentValue;
  const y0 = years[0];

  return (
    <div className="space-y-5">
      <p className="text-[0.8125rem] text-ink-muted">How the buyer page sells the business: the big numbers from Square, the terms of sale and the valuation. Numbers update once you save.</p>

      {years.length > 0 && (
        <div className="grid gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {([["Coffees sold", n0(y0?.coffees), `${n0(y0?.coffeesPerDay)} a trading day`], ["Coffee revenue", aud(y0?.coffeeSales), "ex GST"], ["Total sales", aud(y0?.sales), `${n0(y0?.orders)} transactions`], ["Busiest day", y0?.bestDay?.label ?? "—", y0?.bestDay ? `${aud(y0.bestDay.avg)} on average` : ""]] as [string, string, string][]).map(([l, v, s]) => (
            <div key={l} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line"><p className="text-[0.75rem] text-ink-muted">{l}, last 12 months</p><p className="mt-1 text-[1.25rem] font-semibold tabular-nums text-ink">{v}</p><p className="text-[0.75rem] text-ink-faint">{s}</p></div>
          ))}
        </div>
      )}
      {years.length > 1 && (
        <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[34rem] text-[0.8125rem] tabular-nums">
            <thead><tr className="text-left text-ink-muted"><th className="px-3.5 py-2 font-medium">Year</th><th className="px-3.5 py-2 text-right font-medium">Coffees</th><th className="px-3.5 py-2 text-right font-medium">Coffee revenue</th><th className="px-3.5 py-2 text-right font-medium">Total sales</th><th className="px-3.5 py-2 text-right font-medium">Transactions</th></tr></thead>
            <tbody>{years.map((y) => <tr key={y.from} className="border-t border-line text-ink"><td className="px-3.5 py-2">{y.label}{y.complete ? "" : " (part)"}</td><td className="px-3.5 py-2 text-right">{n0(y.coffees)}</td><td className="px-3.5 py-2 text-right">{aud(y.coffeeSales)}</td><td className="px-3.5 py-2 text-right">{aud(y.sales)}</td><td className="px-3.5 py-2 text-right">{n0(y.orders)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <section className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-[0.875rem] font-semibold text-ink">What counts as a coffee</p>
        <p className="text-[0.75rem] text-ink-muted">{initial.coffee_categories === null ? "These are suggested from your Square category names — check them and save." : "Tap a Square category to count it (or stop counting it) as coffee."}</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c.category} type="button" onClick={() => set({ coffee_categories: toggle(coffee, c.category) })} className={cn("min-h-9 rounded-full px-3 text-[0.8125rem] ring-1 ring-inset", has(coffee, c.category) ? "bg-brand-50 font-medium text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-muted ring-line")}>{has(coffee, c.category) ? "✓ " : ""}{c.category} <span className="text-ink-faint">{aud(c.sales)}</span></button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-[0.875rem] font-semibold text-ink">The big numbers anyone can see</p>
        <p className="text-[0.75rem] text-ink-muted">Ticked numbers show on the page to everyone. Charts, the P&amp;L, wages and the valuation stay for buyers who&apos;ve signed the NDA. Staff names are never shown.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(FIGURES) as FigureKey[]).map((k) => (
            <label key={k} className="flex items-center gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={p.public_figures.includes(k)} onChange={() => set({ public_figures: p.public_figures.includes(k) ? p.public_figures.filter((x) => x !== k) : [...p.public_figures, k] })} />{FIGURES[k]}</label>
          ))}
        </div>
        <div><Label hint="optional, shown big under the walkthrough">Headline</Label><Input value={p.headline} onChange={(e) => set({ headline: e.target.value })} placeholder={y0 ? `${n0(y0.coffees)} coffees poured in the last 12 months` : "e.g. Canberra's busiest specialty roastery café"} /></div>
        <div><Label>Years of history on the page</Label><Select value={String(p.years)} onChange={(e) => set({ years: Number(e.target.value) })}><option value="1">The last 12 months</option><option value="2">2 years</option><option value="3">3 years</option></Select></div>
      </section>

      <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-[0.875rem] font-semibold text-ink">Terms of sale</p>
        <p className="text-[0.75rem] text-ink-muted">Conditions that come with the sale — e.g. the café buys its beans from the roastery, and retail coffee bag sales stay with the roastery. Back a term with Square figures by choosing the categories it&apos;s about.</p>
        {p.terms.map((t, i) => (
          <div key={t.id} className="space-y-2.5 rounded-xl bg-canvas p-3 ring-1 ring-line">
            <div className="flex items-center gap-2"><Input value={t.title} onChange={(e) => setTerm(i, { title: e.target.value })} placeholder="e.g. Coffee supply from the roastery" /><button type="button" aria-label="Remove term" onClick={() => set({ terms: p.terms.filter((_, j) => j !== i) })} className="grid h-10 w-10 shrink-0 place-items-center text-ink-muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
            <Textarea rows={3} value={t.text} onChange={(e) => setTerm(i, { text: e.target.value })} placeholder="e.g. The café uses Bean Culture beans exclusively for 5 years at wholesale price. Retail coffee bag sales go to the roastery." />
            <div className="flex flex-wrap gap-1.5">
              {categories.slice(0, 40).map((c) => <button key={c.category} type="button" onClick={() => setTerm(i, { categories: toggle(t.categories, c.category) })} className={cn("min-h-8 rounded-full px-2.5 text-[0.75rem] ring-1 ring-inset", has(t.categories, c.category) ? "bg-brand-50 font-medium text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-muted ring-line")}>{c.category}</button>)}
            </div>
            {t.categories.length > 0 && <p className="text-[0.75rem] text-ink-muted">Shown with it: <b className="text-ink">{aud(catSales(t.categories))}</b> of {t.categories.join(", ")} sales in the last 12 months.</p>}
          </div>
        ))}
        <Button onClick={() => set({ terms: [...p.terms, { id: Math.random().toString(36).slice(2, 10), title: "", text: "", categories: [], figure: "sales" }] })}><Plus className="h-4 w-4" />Add a term</Button>
      </section>

      <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-[0.875rem] font-semibold text-ink">Valuation</p>
        <p className="text-[0.75rem] text-ink-muted">Profit over the last 12 months (from Sales &amp; profit) plus add-backs, times the multiple, plus the included equipment&apos;s second-hand value — the same way exit360 worked it out.</p>
        {p.valuation.addbacks.map((a, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_8rem_2.5rem] gap-2">
            <Input value={a.label} onChange={(e) => set({ valuation: { ...p.valuation, addbacks: p.valuation.addbacks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} placeholder="e.g. Owner's wage" />
            <Input inputMode="decimal" value={String(a.amount || "")} onChange={(e) => set({ valuation: { ...p.valuation, addbacks: p.valuation.addbacks.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/[^\d.-]/g, "")) || 0 } : x)) } })} placeholder="85000" />
            <button type="button" aria-label="Remove" onClick={() => set({ valuation: { ...p.valuation, addbacks: p.valuation.addbacks.filter((_, j) => j !== i) } })} className="grid h-10 place-items-center text-ink-muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button onClick={() => set({ valuation: { ...p.valuation, addbacks: [...p.valuation.addbacks, { label: "", amount: 0 }] } })}><Plus className="h-4 w-4" />Add an add-back</Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label hint="× adjusted profit">Multiple</Label><Input inputMode="decimal" value={String(p.valuation.multiple)} onChange={(e) => set({ valuation: { ...p.valuation, multiple: Number(e.target.value) || 0 } })} /></div>
          <div><Label>Who sees it</Label><Select value={p.valuation.show} onChange={(e) => set({ valuation: { ...p.valuation, show: e.target.value as PageSettings["valuation"]["show"] } })}><option value="buyers">Buyers after the NDA</option><option value="public">Anyone with the page</option><option value="hidden">Only you</option></Select></div>
        </div>
        <dl className="divide-y divide-line rounded-xl bg-canvas px-3.5 text-[0.8125rem] ring-1 ring-line">
          {([["Profit, last 12 months", profit12], ["Add-backs", addbacks], ["Adjusted profit", adjusted], [`× ${p.valuation.multiple}`, Math.max(0, adjusted) * p.valuation.multiple], ["Equipment included (second-hand)", equipmentValue], ["Valuation", value]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="flex justify-between gap-3 py-2"><dt className={cn(l === "Valuation" ? "font-semibold text-ink" : "text-ink-muted")}>{l}</dt><dd className={cn("tabular-nums", l === "Valuation" ? "font-semibold text-ink" : "text-ink")}>{aud(v)}</dd></div>
          ))}
        </dl>
      </section>

      <FormError message={err} />
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-line">
        <span className="text-[0.8125rem] text-ink-muted">{saved ? "Saved." : dirty ? "Unsaved changes." : "No changes."}</span>
        <Button variant="primary" disabled={pending || !dirty} onClick={() => start(async () => { setErr(null); const r = await savePageContent(listingId, p); if (!r.ok) { setErr(r.error); return; } setDirty(false); setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save sales page</Button>
      </div>
    </div>
  );
}
