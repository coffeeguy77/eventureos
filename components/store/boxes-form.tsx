"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { BoxConfig } from "@/lib/shop/core";
import { saveShopSettings } from "@/app/(app)/store/actions";

type P = { id: string; name: string; kind: string };

/** Selection boxes: which coffees are always in, and the bags the customer picks (with our pre-selected coffee). */
export function BoxesForm({ initial, products }: { initial: BoxConfig[]; products: P[] }) {
  const router = useRouter();
  const [boxes, setBoxes] = useState<BoxConfig[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const coffees = products.filter((p) => p.kind === "coffee");
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const set = (i: number, b: BoxConfig) => setBoxes(boxes.map((x, j) => (j === i ? b : x)));
  const canAdd = coffees.some((p) => !boxes.some((b) => b.productId === p.id));

  return (
    <Card className="mt-5 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Selection boxes</h2>
          <p className="max-w-2xl text-[0.8125rem] text-ink-muted">For a box of several bags (e.g. 4 × 200g): choose the coffees that are always in it, then the bags the customer picks — each with the coffee we pre-select and which coffees they can swap to. The box&apos;s price is its normal price. Each coffee shows up separately on the roast plan.</p>
        </div>
        <Button type="button" size="sm" disabled={!canAdd} onClick={() => { const first = coffees.find((p) => !boxes.some((b) => b.productId === p.id)); if (first) setBoxes([...boxes, { productId: first.id, included: [], slots: [{ default: null, options: [] }], bag: "200g" }]); }}><Plus className="h-3.5 w-3.5" />Box</Button>
      </div>
      {!boxes.length && <p className="text-[0.8125rem] text-ink-muted">No selection boxes yet.</p>}
      {boxes.map((b, i) => {
        const others = coffees.filter((p) => p.id !== b.productId && !boxes.some((x) => x.productId === p.id));
        return (
          <div key={i} className="space-y-4 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1"><Label htmlFor={`bx-${i}`}>Box product</Label>
                <Select id={`bx-${i}`} value={b.productId} onChange={(e) => set(i, { ...b, productId: e.target.value })}>
                  {coffees.filter((p) => p.id === b.productId || !boxes.some((x) => x.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select></div>
              <div className="w-28"><Label htmlFor={`bxb-${i}`}>Bag size</Label><Input id={`bxb-${i}`} value={b.bag} onChange={(e) => set(i, { ...b, bag: e.target.value })} /></div>
              <Button type="button" variant="ghost" size="sm" aria-label="Remove box" onClick={() => setBoxes(boxes.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>

            <div>
              <Label>Always included</Label>
              <div className="flex flex-wrap gap-2">
                {b.included.map((id, k) => (
                  <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[0.8125rem]">{k + 1}. {name(id)}<button type="button" aria-label={`Remove ${name(id)}`} onClick={() => set(i, { ...b, included: b.included.filter((x) => x !== id) })} className="text-ink-faint hover:text-ink">×</button></span>
                ))}
                <Select aria-label="Add an included coffee" value="" onChange={(e) => e.target.value && set(i, { ...b, included: [...b.included, e.target.value] })} className="w-auto">
                  <option value="">+ Add coffee</option>
                  {others.filter((p) => !b.included.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Customer&apos;s choice</Label>
              {b.slots.map((sl, k) => {
                const setSlot = (patch: Partial<typeof sl>) => set(i, { ...b, slots: b.slots.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                return (
                  <div key={k} className="rounded-md bg-zinc-50 p-3 ring-1 ring-inset ring-line">
                    <div className="flex flex-wrap items-end gap-3">
                      <p className="pb-2 text-[0.8125rem] font-semibold text-ink">Bag {b.included.length + k + 1}</p>
                      <div className="min-w-[200px] flex-1"><Label htmlFor={`bxs-${i}-${k}`}>Pre-selected</Label>
                        <Select id={`bxs-${i}-${k}`} value={sl.default ?? ""} onChange={(e) => setSlot({ default: e.target.value || null })}>
                          <option value="">None — customer must choose</option>
                          {others.filter((p) => !sl.options.length || sl.options.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select></div>
                      <Button type="button" variant="ghost" size="sm" aria-label="Remove bag" onClick={() => set(i, { ...b, slots: b.slots.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <p className="mb-1.5 mt-3 text-[0.75rem] text-ink-muted">They can choose from {sl.options.length ? "these" : "any coffee (tick to limit)"}:</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {others.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-[0.8125rem]">
                          <input type="checkbox" checked={sl.options.includes(p.id)} onChange={(e) => setSlot({ options: e.target.checked ? [...sl.options, p.id] : sl.options.filter((x) => x !== p.id) })} />{p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <Button type="button" size="sm" onClick={() => set(i, { ...b, slots: [...b.slots, { default: null, options: [] }] })}><Plus className="h-3.5 w-3.5" />Customer&apos;s choice bag</Button>
            </div>
            <p className="text-[0.75rem] text-ink-muted">{b.included.length + b.slots.length} bags in this box.</p>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveShopSettings({ boxes }); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); router.refresh(); })}>Save boxes</Button>
        {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`} role="status">{msg.text}</span>}
      </div>
    </Card>
  );
}
