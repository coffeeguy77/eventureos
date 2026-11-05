"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { greenFor } from "@/lib/roastery/core";

export interface PlanCoffee { id: string; name: string; batch_kg: number; lossPct: number | null; lossOwn: boolean; onHand: number }
type Row = { id: string; kg: string };

/** "I need X kg roasted" → green needed, batches, and whether there's enough on hand. Rows are kept in this browser. */
export function GreenPlanner({ coffees, initial }: { coffees: PlanCoffee[]; initial?: { name: string; kg: number }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let saved: Row[] | null = null;
    try { saved = JSON.parse(localStorage.getItem("roastery:plan") ?? "null"); } catch { /* ignore */ }
    const fromOrders = (initial ?? []).map((x) => ({ id: coffees.find((c) => c.name.toLowerCase() === x.name.toLowerCase())?.id ?? "", kg: String(Math.round(x.kg * 10) / 10) })).filter((x) => x.id);
    setRows(fromOrders.length ? fromOrders : saved?.length ? saved.filter((r) => coffees.some((c) => c.id === r.id)) : coffees[0] ? [{ id: coffees[0].id, kg: "" }] : []);
  }, [coffees, initial]);
  useEffect(() => { try { localStorage.setItem("roastery:plan", JSON.stringify(rows)); } catch { /* ignore */ } }, [rows]);
  if (!coffees.length) return <p className="text-[0.8125rem] text-ink-muted">Add a green coffee first.</p>;
  let total = 0, totalOut = 0;
  return (
    <div>
      <div className="divide-y divide-line">
        {rows.map((r, k) => {
          const c = coffees.find((x) => x.id === r.id), want = Number(r.kg);
          let out: React.ReactNode = <span className="text-ink-muted">Enter the roasted kilos you need</span>;
          if (c && c.lossPct == null) out = <span className="text-ink-muted">No weighed batches yet, so no loss figure. Weigh a batch after roasting.</span>;
          else if (c && want > 0) {
            const g = greenFor(want, c.lossPct!, c.batch_kg); total += g.green; totalOut += want;
            const split = g.part ? (g.full ? `${g.full} × ${c.batch_kg} kg + 1 × ${g.part.toFixed(1)} kg` : `1 × ${g.part.toFixed(1)} kg`) : `${g.full} × ${c.batch_kg} kg`;
            const short = g.green - c.onHand;
            out = <>
              <span className="text-[1rem] font-semibold text-ink tabular">{g.green.toFixed(1)} kg green</span>
              <span className="text-ink-muted"> · {split} · at {c.lossPct!.toFixed(1)} % loss{c.lossOwn ? "" : " (all-coffee average)"}</span>
              {g.part > 0 && g.full >= 1 && <span className="text-ink-muted"> · or {g.fullBatches} full batches ≈ {(g.fullBatches * c.batch_kg * (1 - c.lossPct! / 100)).toFixed(1)} kg roasted</span>}
              <span className={short > 0 ? "block text-rose-700" : "block text-emerald-700"}>{short > 0 ? `Only ${c.onHand.toFixed(1)} kg green on hand: ${short.toFixed(1)} kg short` : `${c.onHand.toFixed(1)} kg on hand, enough`}</span>
            </>;
          }
          return (
            <div key={k} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,2fr)_auto] sm:items-end">
              <div><Label htmlFor={`gp-c${k}`}>Coffee</Label><Select id={`gp-c${k}`} value={r.id} onChange={(e) => setRows((o) => o.map((x, i) => (i === k ? { ...x, id: e.target.value } : x)))}>{coffees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><Label htmlFor={`gp-k${k}`}>Roasted kg</Label><Input id={`gp-k${k}`} type="number" inputMode="decimal" min={0} step="0.5" value={r.kg} onChange={(e) => setRows((o) => o.map((x, i) => (i === k ? { ...x, kg: e.target.value } : x)))} /></div>
              <div className="text-[0.8125rem] sm:pb-1">{out}</div>
              <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => setRows((o) => o.filter((_, i) => i !== k))}><X className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      {total > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[0.875rem]"><span className="text-ink-muted">Total for {totalOut.toFixed(1)} kg roasted</span><span className="text-[1.0625rem] font-semibold text-ink tabular">{total.toFixed(1)} kg green</span></div>}
      <Button type="button" className="mt-3" onClick={() => setRows((o) => [...o, { id: coffees[0].id, kg: "" }])}><Plus className="h-4 w-4" />Add coffee</Button>
    </div>
  );
}
