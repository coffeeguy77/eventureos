"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Scissors } from "lucide-react";
import { priceJob, type PrintRates } from "@/lib/printing/core";

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

/** Price guide: pick a ready-made job or drag the length, and see the price (inc GST) as you go. */
export function PriceGuide({ rates }: { rates: PrintRates }) {
  const presets = useMemo(() => [
    { label: "Pull-up banner", w: Math.min(0.85, rates.rollWidth), l: 2, qty: 1, cut: false },
    { label: "Event banner", w: rates.rollWidth, l: 3, qty: 1, cut: false },
    { label: "Sticker sheet", w: rates.rollWidth, l: 1, qty: 1, cut: true },
    { label: "Van decals", w: rates.rollWidth, l: 4, qty: 1, cut: true },
  ], [rates.rollWidth]);
  const [len, setLen] = useState(3);
  const [qty, setQty] = useState(1);
  const [cut, setCut] = useState(false);
  const [active, setActive] = useState<number | null>(1);
  const p = priceJob({ items: [{ description: "", width_m: rates.rollWidth, length_m: len, qty }], setup: true, cut }, rates);
  const pick = (k: number) => { const x = presets[k]; setLen(x.l); setQty(x.qty); setCut(x.cut); setActive(k); };
  const tiles = [
    { big: money(rates.firstMetre), small: "first lineal metre" },
    { big: money(rates.perMetre), small: "each metre after" },
    { big: money(rates.setup), small: "setup per job" },
    { big: money(rates.cut), small: "contour cutting" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
      <div className="grid grid-cols-2 gap-3 self-start">
        {tiles.map((t, k) => (
          <div key={k} className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 ${k === 0 ? "bg-[#161213] text-white" : "bg-white ring-1 ring-[#EFE6DF]"}`}>
            {k === 0 && <span aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[var(--pk)] opacity-30 blur-2xl" />}
            <p className="relative text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.5rem]">{t.big}</p>
            <p className={`relative mt-2 text-[0.875rem] ${k === 0 ? "text-white/70" : "text-[#5E5853]"}`}>{t.small}</p>
          </div>
        ))}
        <p className="col-span-2 text-[0.875rem] text-[#5E5853]">Rolls up to {rates.rollWidth} m wide — wider prints are tiled in panels. All prices plus GST. The more metres, the cheaper each one gets.</p>
      </div>

      <div className="rounded-3xl bg-white p-5 ring-1 ring-[#EFE6DF] sm:p-7">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-[#8C847D]">Try it</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((x, k) => (
            <button key={x.label} type="button" onClick={() => pick(k)} className={`rounded-full px-4 py-2 text-[0.875rem] font-semibold transition ${active === k ? "bg-[var(--pk)] text-white" : "bg-[#F6F1EC] text-[#3A3431] hover:bg-[#EFE6DF]"}`}>{x.label}</button>
          ))}
        </div>
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <label htmlFor="pg-len" className="font-semibold">Length</label>
            <span className="text-[1.25rem] font-semibold tabular-nums">{len.toFixed(1)} m</span>
          </div>
          <input id="pg-len" type="range" min={0.5} max={15} step={0.1} value={len} onChange={(e) => { setLen(Number(e.target.value)); setActive(null); }} className="mt-2 w-full accent-[var(--pk)]" />
          {/* the banner, to scale-ish */}
          <div aria-hidden className="mt-3 h-6 overflow-hidden rounded-md bg-[#F6F1EC]">
            <div className="h-full rounded-md bg-[linear-gradient(90deg,#00AEEF,#EC008C,#FFE600,#1F1B19)] transition-[width] duration-300" style={{ width: `${Math.min(100, (len / 15) * 100)}%` }} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold">How many</span>
            <div className="flex items-center rounded-full ring-1 ring-[#E4DCD5]">
              <button type="button" aria-label="Fewer" onClick={() => { setQty(Math.max(1, qty - 1)); setActive(null); }} className="grid h-10 w-10 place-items-center"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label="More" onClick={() => { setQty(Math.min(50, qty + 1)); setActive(null); }} className="grid h-10 w-10 place-items-center"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
          <label className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[0.9375rem] font-semibold ring-1 ${cut ? "bg-[#161213] text-white ring-[#161213]" : "ring-[#E4DCD5]"}`}>
            <input type="checkbox" className="sr-only" checked={cut} onChange={(e) => { setCut(e.target.checked); setActive(null); }} /><Scissors className="h-4 w-4" />Cut to shape
          </label>
        </div>
        <div className="mt-6 rounded-2xl bg-[#161213] p-5 text-white">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[0.8125rem] text-white/60">Your price, inc GST</p><p className="text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums">{money(p.total)}</p></div>
            <p className="text-right text-[0.8125rem] text-white/60">{p.metres} lineal m<br />{money(p.exGst)} + GST</p>
          </div>
          <ul className="mt-4 space-y-1 border-t border-white/10 pt-3 text-[0.8125rem] text-white/70">
            {p.lines.map((l, k) => <li key={k} className="flex justify-between gap-3"><span>{l.description}</span><span className="tabular-nums">{money(l.amount)}</span></li>)}
          </ul>
        </div>
        <a href="#send" className="shop-btn mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--pk)] font-semibold text-white">Send my artwork</a>
      </div>
    </div>
  );
}
