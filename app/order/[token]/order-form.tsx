"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { placeWholesaleOrder } from "./actions";

export interface FormItem { id: string; name: string; description: string | null; category: string | null; price: number; tax_rate: number; min_qty: number }

const fmt = (n: number, cur: string) => n.toLocaleString("en-AU", { style: "currency", currency: cur });

/** Quantities, running total and Place order. Prices are before GST; GST is added on the products that have it. */
export function OrderForm({ token, items, currency, brand, last, payNote, freight, freeOver, minOrder }: {
  token: string; items: FormItem[]; currency: string; brand: string; last: Record<string, number>; payNote: string; freight: number; freeOver: number; minOrder: number;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cats = useMemo(() => [...new Set(items.map((i) => i.category || "Other"))], [items]);
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const goods = chosen.reduce((t, i) => t + i.price * qty[i.id], 0);
  const fr = freight > 0 && !(freeOver > 0 && goods >= freeOver) && goods > 0 ? freight : 0;
  const gst = chosen.reduce((t, i) => t + (i.price * qty[i.id] * i.tax_rate) / 100, 0) + fr * 0.1;
  const total = goods + fr + gst;
  const setQ = (id: string, n: number) => setQty((x) => ({ ...x, [id]: Math.max(0, Math.min(1000, Math.round(n) || 0)) }));
  const hasLast = Object.keys(last).length > 0;
  const submit = () => start(async () => {
    setErr(null);
    const r = await placeWholesaleOrder(token, chosen.map((i) => ({ product_id: i.id, quantity: qty[i.id] })), note).catch(() => ({ ok: false as const, error: "Couldn't reach us — check your connection and try again." }));
    if (!r.ok) { setErr(r.error); return; }
    if (r.redirect) { window.location.href = r.redirect; return; }
    router.push(`/order/${token}?ok=${encodeURIComponent(r.number)}`);
  });
  return (
    <div className="pb-40">
      {hasLast && (
        <button type="button" onClick={() => setQty(Object.fromEntries(Object.entries(last).filter(([id]) => items.some((i) => i.id === id))))}
          className="mb-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[0.875rem] font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50">
          <RotateCcw className="h-4 w-4" />Same as last order
        </button>
      )}
      {cats.map((c) => (
        <section key={c} className="mb-5">
          <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-zinc-500">{c}</h2>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
            {items.filter((i) => (i.category || "Other") === c).map((i) => {
              const q = qty[i.id] ?? 0;
              return (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-medium text-zinc-900">{i.name}</p>
                    <p className="text-[0.8125rem] text-zinc-500">{fmt(i.price, currency)}{i.tax_rate > 0 ? " + GST" : ""}{i.min_qty > 1 ? ` · min ${i.min_qty}` : ""}</p>
                    {i.description && <p className="line-clamp-2 text-[0.75rem] text-zinc-400">{i.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {q > 0 && <button type="button" onClick={() => setQ(i.id, q - 1 < i.min_qty ? 0 : q - 1)} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-zinc-200 hover:bg-zinc-50" aria-label={`One less ${i.name}`}><Minus className="h-4 w-4" /></button>}
                    {q > 0 && <input value={q} inputMode="numeric" onChange={(e) => setQ(i.id, Number(e.target.value.replace(/\D/g, "")))} className="h-10 w-12 rounded-lg border border-zinc-200 text-center text-[1rem] tabular-nums" aria-label={`${i.name} quantity`} />}
                    <button type="button" onClick={() => setQ(i.id, q === 0 ? i.min_qty : q + 1)} className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: brand }} aria-label={`Add ${i.name}`}><Plus className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <label className="block text-[0.8125rem] font-medium text-zinc-700">Note for this order (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[1rem]" placeholder="e.g. leave at the back door" />
      </label>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {err && <p className="mb-2 text-[0.8125rem] text-rose-700">{err}</p>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-[0.8125rem] text-zinc-500">
              <p className="text-[1.0625rem] font-semibold text-zinc-900 tabular-nums">{fmt(total, currency)} <span className="text-[0.75rem] font-normal text-zinc-500">inc GST</span></p>
              <p className="truncate">{chosen.length ? `${chosen.reduce((t, i) => t + qty[i.id], 0)} items${fr ? ` · freight ${fmt(fr, currency)}` : ""}` : "Nothing added yet"}{minOrder > 0 && goods > 0 && goods < minOrder ? ` · minimum ${fmt(minOrder, currency)}` : ""}</p>
            </div>
            <button type="button" disabled={!chosen.length || pending || (minOrder > 0 && goods < minOrder)} onClick={submit}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-40" style={{ background: brand }}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}Place order
            </button>
          </div>
          <p className="mt-1 text-[0.75rem] text-zinc-500">{payNote}</p>
        </div>
      </div>
    </div>
  );
}
