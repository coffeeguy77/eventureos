"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/form";
import type { JobItem } from "@/lib/machines/core";

export interface PriceRow { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; code: string | null; account: string | null; category: string | null }

const money = (n: number) => `$${n.toFixed(2)}`;
/** price list prices are ex GST: the line carries the GST-inclusive price */
export const fromPrice = (p: PriceRow): JobItem => ({
  description: p.name, qty: 1, unit_inc: Math.round(Number(p.unit_price) * (1 + Number(p.tax_rate) / 100) * 100) / 100,
  tax_rate: Number(p.tax_rate) > 0 ? 10 : 0, service_id: p.id, code: p.code, account: p.account,
});

/**
 * Lines on a job or quick sale: search the price list (your categories first) and tap to add, or add a one-off line.
 * Prices on the lines are GST inclusive.
 */
export function ItemsEditor({ items, onChange, priceList, first }: { items: JobItem[]; onChange: (v: JobItem[]) => void; priceList: PriceRow[]; first: string[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const rank = (c: string | null) => { const i = first.findIndex((f) => f.toLowerCase() === (c ?? "").toLowerCase()); return i < 0 ? 99 : i; };
    const k = q.trim().toLowerCase();
    const all = [...priceList].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
    return (k ? all.filter((p) => [p.name, p.code, p.category, p.description].some((v) => v?.toLowerCase().includes(k))) : all).slice(0, 40);
  }, [q, priceList, first]);
  const set = (k: number, p: Partial<JobItem>) => onChange(items.map((x, j) => (j === k ? { ...x, ...p } : x)));

  return (
    <div className="space-y-2">
      {items.length > 0 && <div className="hidden grid-cols-[minmax(0,1fr)_70px_100px_90px_32px] gap-2 text-[0.7188rem] font-medium text-ink-muted sm:grid"><span>Item</span><span>Qty</span><span>Each (inc GST)</span><span className="text-right">Total</span><span /></div>}
      {items.map((it, k) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_60px_90px_32px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_70px_100px_90px_32px]">
          <Input aria-label="Item" value={it.description} onChange={(e) => set(k, { description: e.target.value })} />
          <Input aria-label="Quantity" type="number" min={0} step="any" value={it.qty} onChange={(e) => set(k, { qty: Number(e.target.value) })} />
          <Input aria-label="Price each including GST" type="number" step="0.01" value={it.unit_inc} onChange={(e) => set(k, { unit_inc: Number(e.target.value) })} />
          <span className="hidden text-right text-[0.8125rem] tabular-nums text-ink sm:block">{money((Number(it.qty) || 0) * (Number(it.unit_inc) || 0))}</span>
          <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== k))} className="grid h-9 place-items-center text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="relative">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input aria-label="Add from the price list" className="pl-9" placeholder="Add from the price list — search machines, parts, cleaners…" value={q} autoComplete="off"
              onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          </div>
          <button type="button" onClick={() => onChange([...items, { description: "", qty: 1, unit_inc: 0, tax_rate: 10 }])} className="inline-flex h-10 items-center justify-center gap-1 rounded-lg px-3 text-[0.8125rem] font-semibold text-brand-600 ring-1 ring-line hover:bg-canvas"><Plus className="h-4 w-4" />One-off line</button>
        </div>
        {open && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
            {hits.length ? hits.map((p) => (
              <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange([...items, fromPrice(p)]); setQ(""); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-canvas">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[0.7188rem] text-ink-muted">{p.category ?? "Other"}{p.code ? ` · ${p.code}` : ""}</span>
                </span>
                <span className="shrink-0 text-[0.8125rem] tabular-nums text-ink">{money(fromPrice(p).unit_inc)}</span>
              </button>
            )) : <p className="px-3 py-2 text-[0.8125rem] text-ink-muted">Nothing in the price list matches. Add it on the Price list tab, or use a one-off line.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
