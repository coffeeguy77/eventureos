"use client";

import { useState } from "react";
import { ChevronDown, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { polishReplyAction } from "@/app/(app)/inbox-actions";

const MODES = [
  { id: "polish", label: "Polish" },
  { id: "shorter", label: "Shorter" },
  { id: "friendlier", label: "Friendlier" },
  { id: "formal", label: "More formal" },
] as const;

/**
 * Gmail-style "Polish": rewrite the text with AI, show it next to the original, and only change the box when Replace
 * is pressed. Undo puts the original back.
 */
export function PolishBar({ text, threadId, onReplace }: { text: string; threadId?: string | null; onReplace: (t: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [result, setResult] = useState<{ before: string; after: string; mode: string } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(mode: string) {
    setMenu(false); setErr(null);
    if (!text.trim()) { setErr("Write something first, then polish it."); return; }
    setBusy(mode);
    const r = await polishReplyAction(text, mode, threadId ?? null).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ before: text, after: r.text, mode });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-flex">
          <Button type="button" size="sm" variant="secondary" className="h-10 rounded-r-none sm:h-8" disabled={!!busy} onClick={() => run("polish")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-brand-600" />}
            {busy ? "Rewriting…" : "Polish"}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-10 rounded-l-none border-l border-line px-2 sm:h-8" disabled={!!busy} aria-label="More rewrite options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menu && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => run(m.id)} className="block w-full px-3 py-2 text-left text-[0.8125rem] text-ink hover:bg-zinc-50 dark:hover:bg-white/5">{m.label}</button>
              ))}
            </div>
          )}
        </div>
        {undo != null && !result && (
          <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-8" onClick={() => { onReplace(undo); setUndo(null); }}>
            <RotateCcw className="h-3.5 w-3.5" />Undo rewrite
          </Button>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-[0.75rem] text-rose-600">{err}</p>}
      {result && (
        <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
          <p className="mb-2 text-[0.75rem] font-semibold text-ink">{MODES.find((m) => m.id === result.mode)?.label ?? "Polish"} — before and after</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Before (yours)</p>
              <div className="max-h-72 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink-muted">{result.before}</div>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">After</p>
              <div className="max-h-72 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-brand-300 bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink dark:border-brand-500/40">{result.after}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="primary" className="h-10 sm:h-8" onClick={() => { setUndo(result.before); onReplace(result.after); setResult(null); }}>Replace</Button>
            <Button type="button" size="sm" variant="secondary" className="h-10 sm:h-8" disabled={!!busy} onClick={() => run(result.mode)}>{busy ? "Rewriting…" : "Try again"}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-8" onClick={() => setResult(null)}>Keep mine</Button>
          </div>
        </div>
      )}
    </div>
  );
}
