"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { addCategory, addPriceGroup, deleteCategory, deletePriceGroup, renameCategory, renamePriceGroup } from "@/app/(app)/wholesale/actions";
import { GroupPrice } from "./products-editor";
import { cn } from "@/lib/cn";

type R = { ok: true; data?: unknown } | { ok: false; error: string };
const field = cn(inputClass, "h-9 py-1 text-[0.8125rem]");

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) setError(r.error); else after?.();
    router.refresh();
  });
  return { pending, error, run };
}

function AddRow({ placeholder, button, onAdd }: { placeholder: string; button: string; onAdd: (name: string) => Promise<R> }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  return (
    <div>
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => onAdd(name), () => setName("")); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={field} />
        <Button size="sm" variant="primary" type="submit" disabled={pending || !name.trim()}><Plus className="h-4 w-4" />{button}</Button>
      </form>
      <FormError message={error} />
    </div>
  );
}

/** Rename inline, or delete after a second click. `deleteExtra` is shown in the confirm step (e.g. where products go). */
function NameRow({ name, meta, canEdit, onRename, onDelete, deleteText, deleteExtra, children }: {
  name: string; meta: string; canEdit: boolean; onRename: (to: string) => Promise<R>; onDelete: () => Promise<R>; deleteText: string; deleteExtra?: React.ReactNode; children?: React.ReactNode;
}) {
  const { pending, error, run } = useRun();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [to, setTo] = useState(name);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "rename" ? (
          <form className="flex min-w-0 flex-1 basis-60 gap-2" onSubmit={(e) => { e.preventDefault(); run(() => onRename(to), () => setMode("view")); }}>
            <input value={to} autoFocus onChange={(e) => setTo(e.target.value)} aria-label={`New name for ${name}`} className={field} />
            <Button size="sm" variant="primary" type="submit" disabled={pending || !to.trim()}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setTo(name); setMode("view"); }}>Cancel</Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1 basis-60"><p className="text-[0.8438rem] font-medium text-ink">{name}</p><p className="text-[0.7188rem] text-ink-faint">{meta}</p></div>
        )}
        {canEdit && mode === "view" && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMode("rename")}><Pencil className="h-3.5 w-3.5" />Rename</Button>
            <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setMode("delete")}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
          </span>
        )}
      </div>
      {mode === "delete" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-900">
          <span>{deleteText}</span>{deleteExtra}
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run(onDelete, () => setMode("view"))}>Yes, delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")}>No</Button>
        </div>
      )}
      <FormError message={error} />
      {children}
    </li>
  );
}

/** Product categories: add, rename (products move with it), delete (products move to another category or none). */
export function CategoriesEditor({ rows, canEdit }: { rows: { name: string; products: number }[]; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      {canEdit && <AddRow placeholder="New category, e.g. Coffee" button="Add category" onAdd={addCategory} />}
      {rows.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">No categories yet.</p> : (
        <ul className="max-w-3xl divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          {rows.map((c) => <CategoryRow key={c.name} c={c} others={rows.map((r) => r.name).filter((n) => n !== c.name)} canEdit={canEdit} />)}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ c, others, canEdit }: { c: { name: string; products: number }; others: string[]; canEdit: boolean }) {
  const [moveTo, setMoveTo] = useState("");
  return (
    <NameRow name={c.name} meta={`${c.products} product${c.products === 1 ? "" : "s"}`} canEdit={canEdit}
      onRename={(to) => renameCategory(c.name, to)} onDelete={() => deleteCategory(c.name, moveTo || null)}
      deleteText={c.products ? `Delete ${c.name}? Move its ${c.products} product${c.products === 1 ? "" : "s"} to` : `Delete ${c.name}?`}
      deleteExtra={c.products ? (
        <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move the products to" className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[0.8125rem] text-ink">
          <option value="">No category</option>
          {others.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : undefined} />
  );
}

export interface GroupProduct { id: string; name: string; category: string | null; unit_price: number; active: boolean; groupPrices: Record<string, number> }

/** Price groups: add, rename (customers and prices move with it), delete (customers go back to standard prices), and each group's prices. */
export function PriceGroupsEditor({ rows, products, canEdit, currency }: { rows: { name: string; customers: number; prices: number }[]; products: GroupProduct[]; canEdit: boolean; currency: string }) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[0.8125rem] text-ink-muted">A customer in a price group pays the group&apos;s price for a product when one is set, otherwise the standard price. Put customers in a group on their customer page.</p>
      {canEdit && <AddRow placeholder="New price group, e.g. Husk" button="Add price group" onAdd={addPriceGroup} />}
      {rows.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">No price groups yet.</p> : (
        <ul className="max-w-4xl divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          {rows.map((g) => <GroupRow key={g.name} g={g} products={products} canEdit={canEdit} currency={currency} />)}
        </ul>
      )}
    </div>
  );
}

function GroupRow({ g, products, canEdit, currency }: { g: { name: string; customers: number; prices: number }; products: GroupProduct[]; canEdit: boolean; currency: string }) {
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const cats = [...new Set(products.map((p) => p.category || "No category"))].sort((a, b) => (a === "No category" ? 1 : b === "No category" ? -1 : a.localeCompare(b)));
  return (
    <NameRow name={g.name} meta={`${g.customers} customer${g.customers === 1 ? "" : "s"} · ${g.prices} special price${g.prices === 1 ? "" : "s"}`} canEdit={canEdit}
      onRename={(to) => renamePriceGroup(g.name, to)} onDelete={() => deletePriceGroup(g.name)}
      deleteText={`Delete ${g.name}? Its special prices are removed${g.customers ? ` and ${g.customers} customer${g.customers === 1 ? " goes" : "s go"} back to standard prices` : ""}.`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 flex items-center gap-1 text-[0.75rem] font-medium text-brand-700">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />{open ? "Hide prices" : "Edit prices"}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[0.7188rem] text-ink-faint">Prices before GST. Leave blank for the standard price. Saves when you leave the box.</p>
          {cats.map((cat) => (
            <div key={cat}>
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{cat}</p>
              <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                {products.filter((p) => (p.category || "No category") === cat).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[0.8125rem]">
                    <span className={cn("min-w-0 flex-1 basis-48", p.active ? "text-ink" : "text-ink-faint")}>{p.name}{!p.active && " (hidden)"}</span>
                    <span className="w-24 text-right tabular text-ink-muted">{fmt(p.unit_price)}</span>
                    <GroupPrice productId={p.id} group={g.name} value={p.groupPrices[g.name]} canEdit={canEdit} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </NameRow>
  );
}
