"use client";

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";

export interface DrawerMessage { id: string; direction: "inbound" | "outbound"; from: string; at: string; body: string }
export interface DrawerThread { id: string; subject: string; messages: DrawerMessage[] }

/**
 * The customer's emails beside the quote, so details can be checked while pricing. Doesn't block the page:
 * on wide screens it sits over the right-hand column; on phones it's a full-width sheet.
 */
export function EmailDrawer({ threads, tz, open, onClose, highlightThread }: {
  threads: DrawerThread[]; tz: string; open: boolean; onClose: () => void; highlightThread?: string | null;
}) {
  const [active, setActive] = useState<string | null>(highlightThread ?? threads[0]?.id ?? null);
  useEffect(() => { if (highlightThread) setActive(highlightThread); }, [highlightThread]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  const t = threads.find((x) => x.id === active) ?? threads[0];
  // Oldest first reads like the conversation happened; the first message is the original request
  const msgs = t ? [...t.messages].sort((a, b) => a.at.localeCompare(b.at)) : [];
  return (
    <aside aria-label="Customer's emails"
      className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col border-l border-line bg-surface shadow-2xl sm:left-auto sm:w-[440px] lg:top-0">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Mail className="h-4 w-4 text-brand-600" />
        <p className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold text-ink">{t?.subject ?? "Emails"}</p>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label="Close emails"><X className="h-4 w-4" /></button>
      </header>
      {threads.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
          {threads.map((x) => (
            <button key={x.id} type="button" onClick={() => setActive(x.id)}
              className={cn("shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] ring-1 ring-inset", x.id === t?.id ? "bg-brand-50 text-brand-800 ring-brand-200" : "text-ink-muted ring-line hover:bg-zinc-50")}>
              {x.subject.length > 36 ? `${x.subject.slice(0, 36)}…` : x.subject}
            </button>
          ))}
        </div>
      )}
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && <li className="text-[0.8125rem] text-ink-muted">No emails in this conversation yet.</li>}
        {msgs.map((m, i) => (
          <li key={m.id} className={cn("rounded-xl px-3 py-2.5 ring-1 ring-inset", m.direction === "outbound" ? "bg-brand-50/40 ring-brand-100" : "bg-surface ring-line")}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-[0.75rem]">
              <span className="font-semibold text-ink">{m.from}</span>
              {i === 0 && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.6562rem] font-medium text-brand-700 ring-1 ring-inset ring-brand-100">Original</span>}
              <span className="ml-auto text-ink-faint">{fmtDateTime(m.at, tz)}</span>
            </p>
            {/* Selectable, so details can be copied straight into the quote */}
            <p className="mt-1.5 select-text whitespace-pre-line break-words text-[0.8125rem] leading-relaxed text-ink">{m.body}</p>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[0.7188rem] text-ink-faint">Select text to copy details into the quote. Press Esc to close.</p>
    </aside>
  );
}
