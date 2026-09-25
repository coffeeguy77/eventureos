"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ImageIcon, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { lineTotal } from "./calc";
import { draftNums, type BoolField, type ItemDraft, type NumField, type TextField } from "./draft";
import { QuickAdd } from "./quick-add";
import type { CatalogueItem, QSection } from "./types";

export type Col = NumField | TextField;

const GRID = "grid grid-cols-[minmax(250px,1fr)_72px_84px_112px_68px_68px_112px_84px] items-start gap-x-1.5";
const cell =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors hover:border-line focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:hover:border-transparent";
const numCell = cn(cell, "tabular text-right");
const iconBtn =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-zinc-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-30";

export interface SectionHandlers {
  onSectionTitle: (sectionId: string, value: string) => void;
  onSectionBlur: (sectionId: string) => void;
  onSectionOptional: (sectionId: string, value: boolean) => void;
  onMoveSection: (sectionId: string, dir: -1 | 1) => void;
  onDeleteSection: (sectionId: string) => void;
  onField: (itemId: string, field: Col | BoolField, value: string | boolean) => void;
  onBlurField: (itemId: string, field: Col) => void;
  onItemKey: (e: React.KeyboardEvent<HTMLElement>, itemId: string, col: Col) => void;
  onAddItem: (sectionId: string) => void;
  onQuickAdd: (sectionId: string, c: CatalogueItem) => void;
  onMoveItem: (itemId: string, dir: -1 | 1) => void;
  onDeleteItem: (itemId: string) => void;
}

export function SectionEditor({ section, items, index, count, currency, catalogue, adding, h }: {
  section: QSection;
  items: ItemDraft[];
  index: number;
  count: number;
  currency: string;
  catalogue: CatalogueItem[];
  adding: boolean;
  h: SectionHandlers;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sectionTotal = items.reduce((a, i) => a + (i.is_optional ? 0 : lineTotal(draftNums(i))), 0);
  const optionalTotal = items.reduce((a, i) => a + (i.is_optional ? lineTotal(draftNums(i)) : 0), 0);

  return (
    <section className={cn("rounded-xl border bg-white shadow-card", section.is_optional ? "border-dashed border-brand-200" : "border-line")} aria-label={`Section ${section.title}`}>
      {/* section header */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-4">
        <input
          value={section.title}
          onChange={(e) => h.onSectionTitle(section.id, e.target.value)}
          onBlur={() => h.onSectionBlur(section.id)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          aria-label="Section name"
          maxLength={120}
          placeholder="Section name"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[14px] font-semibold text-ink hover:border-line focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <label className={cn("inline-flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium ring-1 ring-inset",
          section.is_optional ? "bg-brand-50 text-brand-700 ring-brand-200" : "text-ink-muted ring-line hover:text-ink")}>
          <input type="checkbox" className="sr-only" checked={section.is_optional} onChange={(e) => h.onSectionOptional(section.id, e.target.checked)} />
          {section.is_optional ? "Optional section" : "Mark optional"}
        </label>
        <div className="flex items-center">
          <button type="button" className={iconBtn} onClick={() => h.onMoveSection(section.id, -1)} disabled={index === 0} aria-label="Move section up" title="Move section up"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" className={iconBtn} onClick={() => h.onMoveSection(section.id, 1)} disabled={index === count - 1} aria-label="Move section down" title="Move section down"><ChevronDown className="h-4 w-4" /></button>
          <button type="button" className={cn(iconBtn, "hover:bg-rose-50 hover:text-rose-700")} onClick={() => items.length ? setConfirmDelete(true) : h.onDeleteSection(section.id)} disabled={count <= 1} aria-label="Delete section" title={count <= 1 ? "A quote needs at least one section" : "Delete section"}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {section.is_optional && <p className="px-5 pt-1 text-[11.5px] text-brand-700">Everything in this section is offered as an optional extra and excluded from the total.</p>}
      {confirmDelete && (
        <div role="alert" className="mx-3 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 ring-1 ring-inset ring-rose-100 sm:mx-4">
          <span>Delete ‘{section.title}’ and its {items.length} item{items.length === 1 ? "" : "s"}?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2.5 py-1 font-medium text-ink-muted hover:bg-white">Cancel</button>
            <button type="button" autoFocus onClick={() => { setConfirmDelete(false); h.onDeleteSection(section.id); }} className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white hover:bg-rose-700">Delete section</button>
          </span>
        </div>
      )}

      {/* items */}
      <div className="mt-2 overflow-x-auto">
        <div className="min-w-[880px] px-2 sm:px-3">
          <div className={cn(GRID, "border-b border-line px-0 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint")}>
            <span className="px-2">Item</span>
            <span className="px-2 text-right">Qty</span>
            <span className="px-2">Unit</span>
            <span className="px-2 text-right">Unit price</span>
            <span className="px-2 text-right">Tax %</span>
            <span className="px-2 text-right">Disc %</span>
            <span className="px-2 text-right">Total</span>
            <span className="sr-only">Actions</span>
          </div>
          {items.length === 0 && (
            <p className="py-5 text-center text-[12.5px] text-ink-muted">No items in this section yet. Add a line or use Quick add.</p>
          )}
          <ul className="divide-y divide-line">
            {items.map((it, i) => (
              <ItemRow key={it.id} it={it} first={i === 0} last={i === items.length - 1} currency={currency} h={h} optionalSection={section.is_optional} />
            ))}
          </ul>
        </div>
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 sm:px-4">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => h.onAddItem(section.id)} disabled={adding}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add item
          </button>
          <QuickAdd catalogue={catalogue} currency={currency} onPick={(c) => h.onQuickAdd(section.id, c)} disabled={adding} />
        </div>
        <p className="tabular text-[12.5px] text-ink-muted">
          {section.is_optional
            ? <>Optional extras <span className="font-medium text-ink">{money(sectionTotal + optionalTotal, currency)}</span> <span className="text-ink-faint">ex GST</span></>
            : <>Section subtotal <span className="font-medium text-ink">{money(sectionTotal, currency)}</span> <span className="text-ink-faint">ex GST</span>
              {optionalTotal > 0 && <span className="text-ink-faint"> · +{money(optionalTotal, currency)} optional</span>}</>}
        </p>
      </div>
    </section>
  );
}

function ItemRow({ it, first, last, currency, h, optionalSection }: {
  it: ItemDraft; first: boolean; last: boolean; currency: string; h: SectionHandlers; optionalSection: boolean;
}) {
  const [showImage, setShowImage] = useState(!!it.image_url);
  const total = lineTotal(draftNums(it));
  const excluded = it.is_optional || optionalSection;

  const input = (col: Col, props: React.InputHTMLAttributes<HTMLInputElement> & { className: string }) => (
    <input
      {...props}
      data-item={it.id}
      data-col={col}
      value={(it[col] ?? "") as string}
      onChange={(e) => h.onField(it.id, col, e.target.value)}
      onBlur={() => h.onBlurField(it.id, col)}
      onKeyDown={(e) => h.onItemKey(e, it.id, col)}
      onFocus={(e) => { if (props.inputMode) e.currentTarget.select(); }}
    />
  );

  const chip = (field: BoolField, on: boolean, label: string, icon: React.ReactNode, title: string) => (
    <button type="button" aria-pressed={on} title={title} onClick={() => h.onField(it.id, field, !on)}
      className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset transition-colors",
        on ? "bg-brand-50 text-brand-700 ring-brand-200" : "text-ink-faint ring-transparent hover:text-ink hover:ring-line")}>
      {icon}{label}
    </button>
  );

  return (
    <li className={cn(GRID, "group py-2", excluded && "bg-zinc-50/60")}>
      <div className="min-w-0">
        {input("name", { className: cn(cell, "font-medium"), placeholder: "Item name", "aria-label": "Item name", maxLength: 200 })}
        <AutoGrow
          data-item={it.id}
          data-col="description"
          value={it.description ?? ""}
          rows={1}
          onChange={(e) => h.onField(it.id, "description", e.target.value)}
          onBlur={() => h.onBlurField(it.id, "description")}
          placeholder="Description (optional)"
          aria-label="Item description"
          maxLength={4000}
          className={cn(cell, "mt-0.5 block h-auto min-h-[28px] resize-none py-1 text-[12.5px] leading-snug text-ink-muted")}
        />
        <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
          {chip("is_optional", it.is_optional, "Optional", null, "Optional items are shown to the customer but excluded from the total")}
          {chip("is_package", it.is_package, "Package", <Package className="h-3 w-3" />, "Show this line as a package / bundle")}
          <button type="button" onClick={() => setShowImage((s) => !s)} aria-pressed={showImage || !!it.image_url}
            className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset",
              it.image_url ? "bg-brand-50 text-brand-700 ring-brand-200" : "text-ink-faint ring-transparent hover:text-ink hover:ring-line")}>
            <ImageIcon className="h-3 w-3" />Image
          </button>
        </div>
        {(showImage || it.image_url) && (
          <div className="mt-1.5 flex items-center gap-2 px-1">
            {it.image_url && /^https?:\/\//.test(it.image_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-line" />
            )}
            {input("image_url", { className: cn(cell, "h-7 border-line text-[12px]"), placeholder: "https://… image link", "aria-label": "Image link", type: "url" })}
          </div>
        )}
      </div>
      {input("quantity", { className: numCell, inputMode: "decimal", "aria-label": "Quantity" })}
      {input("unit", { className: cell, placeholder: "each", "aria-label": "Unit", maxLength: 40 })}
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-faint">$</span>
        {input("unit_price", { className: cn(numCell, "pl-5"), inputMode: "decimal", "aria-label": "Unit price" })}
      </div>
      {input("tax_rate", { className: numCell, inputMode: "decimal", "aria-label": "Tax rate percent" })}
      {input("discount_percent", { className: numCell, inputMode: "decimal", "aria-label": "Discount percent" })}
      <div className="flex h-8 flex-col items-end justify-center px-2">
        <span className={cn("tabular text-[13px]", excluded ? "text-ink-faint line-through decoration-ink-faint/40" : "font-medium text-ink")}>{money(total, currency)}</span>
        {excluded && <span className="text-[10.5px] text-ink-faint">not in total</span>}
      </div>
      <div className="flex h-8 items-center justify-end opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" className={iconBtn} onClick={() => h.onMoveItem(it.id, -1)} disabled={first} aria-label="Move item up" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className={iconBtn} onClick={() => h.onMoveItem(it.id, 1)} disabled={last} aria-label="Move item down" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className={cn(iconBtn, "hover:bg-rose-50 hover:text-rose-700")} onClick={() => h.onDeleteItem(it.id)} aria-label={`Remove ${it.name || "item"}`} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </li>
  );
}

function AutoGrow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}
