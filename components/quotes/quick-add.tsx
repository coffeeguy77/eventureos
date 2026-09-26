"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Search, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { CatalogueItem } from "./types";

/** Searchable list of items this business has quoted before. Keyboard: ↑ ↓ Enter Esc. */
export function QuickAdd({ catalogue, currency, onPick, disabled }: {
  catalogue: CatalogueItem[];
  currency: string;
  onPick: (item: CatalogueItem) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? catalogue.filter((c) => c.name.toLowerCase().includes(term) || (c.description ?? "").toLowerCase().includes(term))
      : catalogue;
    return list.slice(0, 40);
  }, [q, catalogue]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(c: CatalogueItem) {
    onPick(c);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled || catalogue.length === 0}
        title={catalogue.length === 0 ? "Items you quote are remembered here for next time" : "Add an item you've quoted before"}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-ink-muted md:h-8 hover:bg-zinc-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Zap className="h-3.5 w-3.5" /> Quick add
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[340px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="relative border-b border-line">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) pick(matches[active]); }
                else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
              }}
              placeholder="Search past items…"
              aria-label="Search past items"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {matches.length === 0 && <li className="px-3 py-3 text-[12.5px] text-ink-muted">No matching items. Add a new line instead.</li>}
            {matches.map((c, i) => (
              <li
                key={c.name}
                data-idx={i}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className={cn("flex cursor-pointer items-start justify-between gap-3 px-3 py-3 md:py-2", i === active && "bg-brand-50")}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                    {c.is_package && <Package className="h-3.5 w-3.5 shrink-0 text-brand-600" />}{c.name}
                  </p>
                  {c.description && <p className="truncate text-[11.5px] text-ink-muted">{c.description}</p>}
                </div>
                <span className="tabular shrink-0 text-[12.5px] text-ink">{money(c.unit_price, currency)}{c.unit ? <span className="text-ink-faint"> /{c.unit}</span> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
