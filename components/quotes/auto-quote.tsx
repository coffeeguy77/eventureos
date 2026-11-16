"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoQuoteFromEmails, type AutoQuoteResult } from "@/app/(app)/quotes/actions";
import { fmtDate } from "@/lib/format";
import type { QItem, QSection } from "./types";

const t12 = (t: string | null) => { if (!t) return ""; const h = Number(t.slice(0, 2)), m = t.slice(3, 5); return `${h % 12 || 12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`; };

/** "Auto quote" — fill the quote from the customer's emails (added below, or replacing what's here). */
export function AutoQuotePanel({ quoteId, hasLines, flushAll, onClose, onDone }: {
  quoteId: string; hasLines: boolean; flushAll: () => Promise<boolean>; onClose: () => void;
  onDone: (r: { section: QSection; items: QItem[]; replaced: boolean }) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<AutoQuoteResult | null>(null);
  const go = (replace: boolean) => start(async () => {
    setErr(null);
    await flushAll();
    const r = await autoQuoteFromEmails(quoteId, replace).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    setRes(r.data);
    onDone(r.data);
  });
  const rd = res?.read;
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-[0.8125rem] text-ink">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Auto quote from the emails</p>
          {!res && <p className="mt-0.5 text-ink-muted">Claude reads the customer&apos;s emails for the package, day, times and how many — the prices come from your price list. You can change anything after.</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {rd && (
        <div className="mt-3 space-y-2">
          <p><b>{res!.replaced ? "Replaced the quote with" : "Added"} {rd.packageName}</b>{rd.date ? ` · ${fmtDate(rd.date, "long")}` : ""}{rd.start ? ` · ${t12(rd.start)}–${t12(rd.end)}` : ""}{rd.serves ? ` · ${rd.serves} serves` : ""}{rd.staff ? ` · ${rd.staff} staff` : ""}.</p>
          {res!.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-ink-muted">{res!.notes.map((n, i) => <li key={i} className={i === 0 && rd.assumedServes ? "text-amber-800" : undefined}>{n}</li>)}</ul>}
          <p className="text-ink-muted">Check it below, then send.</p>
        </div>
      )}
      {err && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-rose-800 ring-1 ring-inset ring-rose-200">{err}</p>}
      {!res && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {hasLines && <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(false)}>Add below what&apos;s here</Button>}
          <Button size="sm" variant="primary" disabled={pending} onClick={() => go(hasLines)}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Reading the emails…" : hasLines ? "Replace this quote's lines" : "Fill in the quote"}
          </Button>
        </div>
      )}
    </div>
  );
}
