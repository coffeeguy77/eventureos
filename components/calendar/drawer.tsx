"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Right-hand side panel with an overlay. Closes on Escape or overlay click. */
export function Drawer({ title, onClose, children, accent }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; accent?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-ink/20" />
      <aside role="dialog" aria-modal="true" className="pt-safe relative flex h-full w-full max-w-[420px] flex-col bg-white shadow-pop sm:pt-0">
        {accent && <div className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />}
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button type="button" onClick={onClose} className="-mr-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:mr-0 sm:p-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pb-safe flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </div>
  );
}
