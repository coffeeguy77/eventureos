"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { saveGroupPrice, saveProduct, type ProductInput } from "@/app/(app)/wholesale/actions";
import { cn } from "@/lib/cn";

export interface ProductRow extends ProductInput { id: string; groupPrices: Record<string, number> }

/** Wholesale products: prices (ex GST), GST, weight, on/off, and special prices per price group. */
export function ProductsEditor({ rows, groups, canEdit }: { rows: ProductRow[]; groups: string[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const cats = [...new Set(rows.map((r) => r.category || "Other"))];
  return (
    <div className="space-y-6">
      {canEdit && (adding ? <div className="rounded-xl bg-surface p-4 ring-1 ring-line"><Row p={{ id: "", name: "", unit_price: 0, tax_rate: 0, active: true, groupPrices: {} }} groups={[]} canEdit isNew onDone={() => setAdding(false)} /></div>
        : <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add product</Button>)}
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{cat}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            {rows.filter((r) => (r.category || "Other") === cat).map((p) => <Row key={p.id} p={p} groups={groups} canEdit={canEdit} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({ p, groups, canEdit, isNew, onDone }: { p: ProductRow; groups: string[]; canEdit: boolean; isNew?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<ProductInput>({ sku: p.sku ?? "", name: p.name, category: p.category ?? "", unit_price: p.unit_price, tax_rate: p.tax_rate, weight_kg: p.weight_kg ?? null, min_qty: p.min_qty ?? 1, active: p.active, description: p.description ?? "" });
  const [open, setOpen] = useState(!!isNew);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof ProductInput>(k: K, val: ProductInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = () => start(async () => {
    const r = await saveProduct(isNew ? null : p.id, v).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) { router.refresh(); onDone?.(); }
  });
  const field = cn(inputClass, "h-9 py-1 text-[0.8125rem]");
  return (
    <div className={cn("px-4 py-3", !v.active && "bg-zinc-50/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform", open ? "" : "-rotate-90")} />
          <span className="min-w-0"><span className={cn("block truncate text-[0.8438rem] font-medium", v.active ? "text-ink" : "text-ink-faint")}>{v.name || "New product"}</span>
            <span className="block text-[0.7188rem] text-ink-faint">{[v.sku, Number(v.tax_rate) > 0 ? "GST" : "GST-free", v.weight_kg ? `${v.weight_kg} kg` : null, !v.active ? "hidden from ordering" : null, Object.keys(p.groupPrices).length ? `${Object.keys(p.groupPrices).length} group price${Object.keys(p.groupPrices).length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</span></span>
        </button>
        <label className="flex items-center gap-1 text-[0.75rem] text-ink-muted">$<input type="number" min={0} step="0.01" value={v.unit_price} disabled={!canEdit} onChange={(e) => set("unit_price", Number(e.target.value))} onBlur={() => { if (!isNew && Number(v.unit_price) !== Number(p.unit_price)) save(); }} className={cn(field, "w-24 text-right tabular")} aria-label={`${v.name} price ex GST`} /><span className="hidden sm:inline">ex GST</span></label>
      </div>
      {open && (
        <div className="mt-3 space-y-3 pl-6">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[0.7188rem] text-ink-muted sm:col-span-2">Name<input value={v.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} className={field} /></label>
            <label className="text-[0.7188rem] text-ink-muted">SKU<input value={v.sku ?? ""} disabled={!canEdit} onChange={(e) => set("sku", e.target.value)} className={field} /></label>
            <label className="text-[0.7188rem] text-ink-muted">Category<input value={v.category ?? ""} disabled={!canEdit} onChange={(e) => set("category", e.target.value)} className={field} /></label>
            <label className="text-[0.7188rem] text-ink-muted">Weight per unit (kg)<input type="number" min={0} step="0.001" value={v.weight_kg ?? ""} disabled={!canEdit} onChange={(e) => set("weight_kg", e.target.value === "" ? null : Number(e.target.value))} className={field} /></label>
            <label className="text-[0.7188rem] text-ink-muted">Minimum quantity<input type="number" min={1} value={v.min_qty ?? 1} disabled={!canEdit} onChange={(e) => set("min_qty", Number(e.target.value))} className={field} /></label>
            <label className="text-[0.7188rem] text-ink-muted sm:col-span-3">Description (shown when ordering)<input value={v.description ?? ""} disabled={!canEdit} onChange={(e) => set("description", e.target.value)} className={field} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[0.8125rem]">
            <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={Number(v.tax_rate) > 0} disabled={!canEdit} onChange={(e) => set("tax_rate", e.target.checked ? 10 : 0)} />Add GST</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={v.active} disabled={!canEdit} onChange={(e) => set("active", e.target.checked)} />Customers can order it</label>
            {canEdit && <Button size="sm" variant="primary" disabled={pending || !v.name.trim()} onClick={save}>{isNew ? "Add product" : "Save"}</Button>}
            {isNew && <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>}
            {msg && <span className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
          </div>
          {!isNew && groups.length > 0 && (
            <div>
              <p className="mb-1 text-[0.7188rem] font-medium text-ink-muted">Price group prices (ex GST) — blank = the price above</p>
              <div className="flex flex-wrap gap-2">{groups.map((g) => <GroupPrice key={g} productId={p.id} group={g} value={p.groupPrices[g]} canEdit={canEdit} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupPrice({ productId, group, value, canEdit }: { productId: string; group: string; value: number | undefined; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(value == null ? "" : String(value));
  const [pending, start] = useTransition();
  const [bad, setBad] = useState(false);
  return (
    <label className="flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">{group}
      <input value={v} inputMode="decimal" disabled={!canEdit || pending} onChange={(e) => setV(e.target.value)} placeholder="—"
        onBlur={() => { const n = v.trim() === "" ? null : Number(v); if ((n ?? null) === (value ?? null)) return; if (n != null && !(n >= 0)) { setBad(true); return; } start(async () => { const r = await saveGroupPrice(productId, group, n); setBad(!r.ok); router.refresh(); }); }}
        className={cn("h-7 w-16 rounded border bg-surface px-1.5 text-right tabular text-ink", bad ? "border-rose-400" : "border-line")} aria-label={`${group} price`} />
    </label>
  );
}
