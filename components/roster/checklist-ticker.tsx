"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TodayChecklist } from "@/lib/roster/checklists";

type Res = { ok: boolean; error?: string; message?: string };

/** Tick off today's checklists (café iPad and staff app). Big touch targets. */
export function ChecklistTicker({ lists, onTick, big = false }: { lists: TodayChecklist[]; onTick: (checklistId: string, item: number, done: boolean) => Promise<Res>; big?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!lists.length) return null;
  const tick = (c: string, i: number, d: boolean) => start(async () => {
    const r: Res = await onTick(c, i, d).catch(() => ({ ok: false, error: "No connection — try again." }));
    setErr(r.ok ? null : r.error ?? "Not saved.");
    router.refresh();
  });
  return (
    <div className="space-y-2">
      {lists.map((c) => {
        const done = c.items.filter((x) => x.done).length;
        return (
          <div key={c.id} className="rounded-2xl bg-surface shadow-card ring-1 ring-line">
            <button onClick={() => setOpen(open === c.id ? null : c.id)} className={cn("flex w-full items-center gap-2 px-4 text-left", big ? "py-4" : "py-3")}>
              <ListChecks className="h-5 w-5 text-ink-faint" />
              <span className="min-w-0 flex-1"><span className={cn("block font-semibold text-ink", big ? "text-[1.0625rem]" : "text-[0.9375rem]")}>{c.name}</span>{(c.area || c.dueBy) && <span className="block text-[0.75rem] text-ink-muted">{[c.area, c.dueBy ? `by ${c.dueBy}` : null].filter(Boolean).join(" · ")}</span>}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.75rem] font-semibold", done === c.items.length ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-ink-muted")}>{done}/{c.items.length}</span>
            </button>
            {open === c.id && (
              <ul className="border-t border-line">
                {c.items.map((x, i) => (
                  <li key={i}>
                    <button disabled={pending} onClick={() => tick(c.id, i, !x.done)} className={cn("flex w-full items-start gap-3 px-4 text-left", big ? "py-3.5 text-[1rem]" : "py-2.5 text-[0.9375rem]")}>
                      {x.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />}
                      <span className={cn("flex-1", x.done ? "text-ink-muted line-through" : "text-ink")}>{x.text}{x.by && <span className="block text-[0.75rem] text-ink-faint no-underline">{x.by}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {err && <p className="text-[0.8125rem] text-rose-700">{err}</p>}
    </div>
  );
}
