"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus, LayoutTemplate, Loader2, X } from "lucide-react";
import { applyQuoteTemplate, saveQuoteAsTemplate } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { QItem, QSection } from "./types";

export interface TemplateChoice { id: string; name: string; summary: string | null; lines: string; total: number }

/** Pick a saved template — its sections are added to the quote with today's prices. */
export function TemplatePicker({ quoteId, templates, currency, onClose, onAdded }: {
  quoteId: string; templates: TemplateChoice[]; currency: string; onClose: () => void;
  onAdded: (sections: QSection[], items: QItem[], name: string, missing: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const use = async (t: TemplateChoice) => {
    setBusy(t.id); setError(null);
    const r = await applyQuoteTemplate(quoteId, t.id).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    onAdded(r.data.sections, r.data.items, t.name, r.data.missing);
  };
  return (
    <div className="rounded-xl border border-brand-200 bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><LayoutTemplate className="h-4 w-4 text-brand-600" />Use a template</p>
          <p className="mt-0.5 text-[0.7812rem] text-ink-muted">Adds the template’s lines with today’s prices — then adjust anything you like.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {templates.length === 0 ? (
        <p className="mt-3 text-[0.8125rem] text-ink-muted">No templates yet. Create them in <Link href="/settings/pricing" className="font-medium text-brand-700 hover:underline">Settings → Services &amp; pricing</Link>, or build a quote and choose “Save as template”.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => use(t)} disabled={!!busy}
              className="rounded-lg px-3 py-2.5 text-left ring-1 ring-inset ring-line-strong hover:bg-brand-50/50 hover:ring-brand-300 disabled:opacity-60">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-ink">{t.name}</span>
                {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <span className="tabular text-[0.75rem] text-ink-muted">{money(t.total, currency)}</span>}
              </span>
              {t.summary && <span className="block text-[0.7188rem] text-ink-muted">{t.summary}</span>}
              <span className="mt-0.5 block text-[0.7188rem] text-ink-faint">{t.lines}</span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="mt-3"><FormError message={error} /></div>}
    </div>
  );
}

/** "Save as template" — the quote's lines become a reusable template. */
export function SaveAsTemplateButton({ quoteId, defaultName, onDone }: { quoteId: string; defaultName: string; onDone: (msg: string, ok: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[0.75rem] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink sm:py-1">
        <BookmarkPlus className="h-3.5 w-3.5" />Save as template
      </button>
    );
  }
  const save = () => start(async () => {
    const r = await saveQuoteAsTemplate(quoteId, name).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (r.ok) { setOpen(false); onDone(`Saved as the template ‘${name.trim()}’. It's ready to use on any quote.`, true); }
    else onDone(r.error, false);
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus aria-label="Template name" placeholder="Template name"
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
        className={cn(inputClass, "h-8 w-56 py-1 text-[0.8125rem]")} />
      <Button size="sm" variant="primary" onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}
