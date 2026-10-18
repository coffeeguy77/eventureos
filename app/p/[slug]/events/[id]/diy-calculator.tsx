"use client";

import { useState } from "react";
import { diyGuide, type CupSize } from "@/lib/diy/coffee-guide";
import { cn } from "@/lib/cn";

const fmtKg = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${Number(kg.toFixed(2))} kg`);

/** "How much coffee and milk do I need?" for clients hiring the equipment and making the coffee themselves. Quantities only. */
export function DiyCalculator({ guests: initialGuests }: { guests: number | null }) {
  const [guests, setGuests] = useState(String(initialGuests ?? 100));
  const [per, setPer] = useState("1");
  const [size, setSize] = useState<CupSize>("6oz");
  const r = diyGuide({ guests: Number(guests), perGuest: Number(per), size });
  const field = "h-12 w-full rounded-lg border border-line bg-surface px-3 text-[1rem] tabular text-ink sm:h-10 sm:text-[0.875rem]";
  return (
    <div className="px-4 pb-6 sm:px-6">
      <p className="text-[0.8125rem] text-ink-muted">A guide to what to buy for your coffee station. It assumes no waste, so allow a little extra.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-[0.75rem] font-medium text-ink-muted">Guests
          <input className={cn(field, "mt-1")} inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 5))} aria-label="Number of guests" />
        </label>
        <label className="block text-[0.75rem] font-medium text-ink-muted">Coffees each
          <select className={cn(field, "mt-1")} value={per} onChange={(e) => setPer(e.target.value)} aria-label="Coffees per guest">
            {["0.5", "1", "1.5", "2", "3"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <div className="text-[0.75rem] font-medium text-ink-muted">Cup size
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1" role="radiogroup" aria-label="Cup size">
            {(["6oz", "12oz"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)}
                className={cn("h-10 rounded-md text-[0.875rem] font-medium sm:h-8", size === s ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--portal-brand-soft)] p-4 ring-1 ring-inset ring-[var(--portal-brand-line)]">
          <p className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">Coffee beans</p>
          <p className="mt-1 text-[1.25rem] font-semibold tracking-tight text-ink">{r.coffeeBags} × 1 kg bag{r.coffeeBags === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{r.cups} coffee{r.cups === 1 ? "" : "s"} uses about {fmtKg(r.coffeeKg)}. 1 kg makes 50 double shots (20 g) — 50 × 12oz or up to 100 × 6oz cups.</p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-inset ring-line">
          <p className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">Milk — about {r.milkLitres} L in total</p>
          <ul className="mt-1.5 space-y-0.5 text-[0.875rem] text-ink">
            <li className="flex justify-between"><span>Regular / full cream</span><span className="tabular font-medium">{r.regularLitres} L</span></li>
            {r.alternatives.map((a) => <li key={a.name} className="flex justify-between"><span>{a.name}</span><span className="tabular font-medium">{a.litres} L</span></li>)}
          </ul>
          <p className="mt-1.5 text-[0.75rem] text-ink-faint">We allow about 15 × 6oz coffees per 2 L. For 100 people we suggest 2 L almond, 2 L oat, 1 L soy and 1 L lactose free.</p>
        </div>
      </div>
      <p className="mt-3 text-[0.75rem] text-ink-faint">Don&apos;t forget cups, lids, stirrers, sugar and anything extra like chocolate or chai. Or let us take care of everything — just ask.</p>
    </div>
  );
}
