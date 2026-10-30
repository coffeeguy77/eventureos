"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Droplets, Milk, Ruler, Sparkles, Users, Wallet, X } from "lucide-react";
import { chooseMachines, type ChooserAnswers, type MachineModel } from "@/lib/machines/core";

export type ChooserMachine = MachineModel & { name: string; price: number | null; image: string | null; href: string };

const money = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
const CUPS = [20, 30, 50, 80, 100, 150, 200, 300];
const BUDGETS: (number | null)[] = [3000, 5000, 8000, 16000, null];
const chip = (on: boolean) => `rounded-full px-4 py-2.5 text-[0.9375rem] font-semibold ring-1 transition ${on ? "bg-[#151312] text-white ring-[#151312]" : "bg-white text-[#2A2522] ring-[#E4DCD5] hover:ring-[#151312]"}`;

/** Answer a few questions → the machines that suit, best first, with why (and why not). */
export function MachineChooser({ machines }: { machines: ChooserMachine[] }) {
  const [a, setA] = useState<ChooserAnswers>({ cups: 50, milk: "fresh", water: "any", budget: null, compact: false, twoMilks: false, steamWand: false });
  const set = (p: Partial<ChooserAnswers>) => setA((o) => ({ ...o, ...p }));
  const picks = useMemo(() => chooseMachines(machines, a), [machines, a]);
  const fit = picks.filter((p) => p.fits);
  const shown = (fit.length ? fit : picks).slice(0, 3);
  const bySlug = new Map(machines.map((m) => [m.slug, m]));
  const pick = (name: string) => { window.dispatchEvent(new CustomEvent("machine-pick", { detail: name })); document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
      <div className="space-y-7 rounded-[24px] bg-white p-5 shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)] sm:p-8">
        <Q icon={Users} title="How many coffees a day?" hint="About 2 per person is typical.">
          <input type="range" min={0} max={CUPS.length - 1} step={1} value={CUPS.findIndex((c) => c >= a.cups)} onChange={(e) => set({ cups: CUPS[Number(e.target.value)] })} className="w-full accent-[var(--pk)]" aria-label="Coffees a day" />
          <p className="mt-2 text-[1.5rem] font-semibold">{a.cups === 300 ? "300+" : `About ${a.cups}`} <span className="text-[1rem] font-normal text-[#5E5853]">a day · roughly {Math.max(1, Math.round(a.cups / 2))} people</span></p>
        </Q>
        <Q icon={Milk} title="Milk">
          <div className="flex flex-wrap gap-2">
            {([["fresh", "Fresh milk"], ["powder", "Powdered is fine"], ["black", "Mostly black coffee"], ["any", "Not sure"]] as const).map(([k, l]) => <button key={k} type="button" className={chip(a.milk === k)} onClick={() => set({ milk: k })}>{l}</button>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={chip(a.twoMilks)} onClick={() => set({ twoMilks: !a.twoMilks })}>Two milks at once</button>
            <button type="button" className={chip(a.steamWand)} onClick={() => set({ steamWand: !a.steamWand })}>Steam wand</button>
          </div>
        </Q>
        <Q icon={Droplets} title="Water">
          <div className="flex flex-wrap gap-2">
            {([["tank", "Fill a tank"], ["plumbed", "Plumb it in"], ["any", "Either"]] as const).map(([k, l]) => <button key={k} type="button" className={chip(a.water === k)} onClick={() => set({ water: k })}>{l}</button>)}
          </div>
        </Q>
        <Q icon={Wallet} title="Budget (inc GST)">
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => <button key={String(b)} type="button" className={chip(a.budget === b)} onClick={() => set({ budget: b })}>{b === null ? "No limit" : `Up to ${money(b)}`}</button>)}
          </div>
        </Q>
        <Q icon={Ruler} title="Space">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(!a.compact)} onClick={() => set({ compact: false })}>Plenty of bench</button>
            <button type="button" className={chip(a.compact)} onClick={() => set({ compact: true })}>Tight on space</button>
          </div>
        </Q>
      </div>

      <div aria-live="polite">
        <p className="text-[0.875rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]">{fit.length ? `${fit.length} machine${fit.length === 1 ? "" : "s"} suit you` : "Nothing ticks every box — closest matches"}</p>
        <div className="mt-4 space-y-4">
          {shown.map((p, k) => {
            const m = bySlug.get(p.slug)!;
            return (
              <div key={p.slug} className={`overflow-hidden rounded-[22px] bg-white shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)] ${k === 0 && p.fits ? "ring-2 ring-[var(--pk)]" : ""}`}>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:p-5">
                  <div className="relative grid aspect-square place-items-center rounded-2xl bg-white ring-1 ring-[#EFE8E2]">
                    {m.image ? <img src={m.image} alt={m.name} className="h-full w-full object-contain p-2" loading="lazy" /> : null}
                    {k === 0 && p.fits && <span className="absolute -top-1 left-1 inline-flex items-center gap-1 rounded-full bg-[var(--pk)] px-2.5 py-1 text-[0.6875rem] font-bold text-white"><Sparkles className="h-3 w-3" />Best match</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h3 className="text-[1.25rem] font-semibold leading-tight">{m.name}</h3>
                      {m.price !== null && <p className="text-[1.125rem] font-semibold">{money(m.price)}</p>}
                    </div>
                    {m.bestFor && <p className="mt-1 text-[0.875rem] text-[#5E5853]">{m.bestFor}</p>}
                    <ul className="mt-3 space-y-1">
                      {p.reasons.slice(0, 4).map((r) => <li key={r} className="flex gap-2 text-[0.875rem]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{r}</li>)}
                      {p.misses.slice(0, 2).map((r) => <li key={r} className="flex gap-2 text-[0.875rem] text-[#8A817A]"><X className="mt-0.5 h-4 w-4 shrink-0" />{r}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t border-[#EFE8E2]">
                  <a href={m.href} className="flex h-12 items-center justify-center gap-1.5 text-[0.9375rem] font-semibold text-[#2A2522] hover:bg-[#FBF8F5]">Details</a>
                  <button type="button" onClick={() => pick(m.name)} className="flex h-12 items-center justify-center gap-1.5 border-l border-[#EFE8E2] text-[0.9375rem] font-semibold text-[var(--pk)] hover:bg-[#FBF8F5]">Ask about this one<ArrowRight className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Q({ icon: I, title, hint, children }: { icon: typeof Users; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[1.0625rem] font-semibold"><I className="h-5 w-5 text-[var(--pk)]" />{title}</p>
      {hint && <p className="mt-0.5 text-[0.875rem] text-[#6B645F]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
