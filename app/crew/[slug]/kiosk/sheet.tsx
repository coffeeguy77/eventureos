"use client";

import { X } from "lucide-react";

/** A pop-up panel on the café iPad. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-surface p-5 ring-1 ring-line sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3"><p className="text-[1.375rem] font-bold text-ink">{title}</p><button onClick={onClose} className="rounded-full p-2 text-ink-muted hover:bg-canvas" aria-label="Close"><X className="h-6 w-6" /></button></div>
        {children}
      </div>
    </div>
  );
}

