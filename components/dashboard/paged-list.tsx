"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PagedItem { key: string; title: string; subtitle: string; href: string; meta: string; alert?: boolean }

/** A short list with pages ("1–5 of 23  ‹ ›") so the dashboard stays compact. */
export function PagedList({ items, pageSize = 5 }: { items: PagedItem[]; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * pageSize, p * pageSize + pageSize);
  return (
    <div>
      <ul className="divide-y divide-line border-t border-line">
        {shown.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="flex items-center gap-4 px-5 py-2.5 hover:bg-zinc-50/70">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium text-ink">{it.title}</p>
                <p className="truncate text-[0.75rem] text-ink-muted">{it.subtitle}</p>
              </div>
              <span className={cn("shrink-0 text-right text-[0.7188rem]", it.alert ? "font-medium text-rose-700" : "text-ink-faint")}>{it.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-1 border-t border-line px-3 py-1.5 text-[0.75rem] text-ink-muted">
          <span className="mr-1 tabular">{p * pageSize + 1}–{Math.min(items.length, (p + 1) * pageSize)} of {items.length}</span>
          <button type="button" aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-zinc-100 disabled:opacity-30 sm:h-7 sm:w-7"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-zinc-100 disabled:opacity-30 sm:h-7 sm:w-7"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
