"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ItemState } from "@/lib/kitchen/status";

type Res = { ok: boolean; error?: string };
export interface ItemActions {
  set: (eventId: string, day: string, item: string, status: "ready" | "issue" | null) => Promise<Res>;
  note: (eventId: string, day: string, item: string, body: string) => Promise<Res>;
}
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** One catering item: tap the box for Ready / Issue (tap again to change or clear), with notes everyone can see. */
export function ItemStatus({ eventId, day, item, qty, note, state, actions }: { eventId: string; day: string; item: string; qty: number | string; note?: string | null; state: ItemState | undefined; actions: ItemActions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = state?.status ?? null;
  const go = (fn: () => Promise<Res>, after?: () => void) => start(async () => {
    const r: Res = await fn().catch(() => ({ ok: false, error: "No connection — try again." }));
    setErr(r.ok ? null : r.error ?? "Not saved.");
    if (r.ok) after?.();
    router.refresh();
  });
  return (
    <li className="py-1">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="flex min-w-0 items-start gap-2">
          {s === "ready" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : s === "issue" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />}
          <span className="min-w-0">
            <span className={cn(s === "ready" && "text-ink-muted")}>{item}</span>
            {note && <span className="block text-[0.75rem] font-medium text-amber-800">{note}</span>}
            {s && state?.at && <span className={cn("block text-[0.7188rem]", s === "ready" ? "text-emerald-700" : "text-rose-700")}>{s === "ready" ? "Ready" : "Issue"} · {state.by ?? "—"} · {when(state.at)}</span>}
            {(state?.notes.length ?? 0) > 0 && !open && <span className="block text-[0.7188rem] text-ink-faint">{state!.notes.length} note{state!.notes.length === 1 ? "" : "s"}</span>}
          </span>
        </span>
        <span className="font-semibold tabular-nums">{qty}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-canvas p-2.5 ring-1 ring-line print:hidden">
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" disabled={pending} onClick={() => go(() => actions.set(eventId, day, item, s === "ready" ? null : "ready"))} className={cn("h-10 rounded-lg text-[0.8125rem] font-semibold ring-1", s === "ready" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-surface text-ink ring-line-strong")}>Ready</button>
            <button type="button" disabled={pending} onClick={() => go(() => actions.set(eventId, day, item, s === "issue" ? null : "issue"))} className={cn("h-10 rounded-lg text-[0.8125rem] font-semibold ring-1", s === "issue" ? "bg-rose-600 text-white ring-rose-600" : "bg-surface text-ink ring-line-strong")}>Issue</button>
            <button type="button" disabled={pending || !s} onClick={() => go(() => actions.set(eventId, day, item, null))} className="h-10 rounded-lg bg-surface text-[0.8125rem] font-medium text-ink-muted ring-1 ring-line-strong disabled:opacity-50">Clear</button>
          </div>
          {state?.notes.map((n, i) => <p key={i} className="rounded-md bg-surface px-2.5 py-1.5 text-[0.8125rem] ring-1 ring-line"><span className="whitespace-pre-line text-ink">{n.body}</span><span className="block text-[0.6875rem] text-ink-faint">{n.by ?? "—"} · {when(n.at)}</span></p>)}
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={s === "issue" ? "What's wrong? e.g. Eggs haven't arrived — out of stock. Jerry's gone to get more." : "Add a note"} className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-[0.875rem] text-ink" />
          <button type="button" disabled={pending || !text.trim()} onClick={() => go(() => actions.note(eventId, day, item, text), () => setText(""))} className="h-9 w-full rounded-lg bg-ink text-[0.8125rem] font-semibold text-surface disabled:opacity-50">Add note</button>
          {err && <p className="text-[0.75rem] text-rose-700">{err}</p>}
        </div>
      )}
    </li>
  );
}
