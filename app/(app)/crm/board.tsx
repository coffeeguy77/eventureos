"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, GripVertical } from "lucide-react";
import { moveEnquiry, moveEvent } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form";
import type { Tone } from "@/lib/status";
import type { EnquiryStatus, EventStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export interface BoardColumn { key: string; label: string; tone: Tone; hint?: string }
export interface BoardCard {
  id: string;
  column: string;            // the column this card sits in
  status: string;            // its real status (a "needs review" enquiry sits in the New column)
  statusLabel?: string;      // shown when status differs from the column
  href: string;
  ref: string;               // e.g. ENQ-12
  title: string;
  customer: string;
  date: string | null;       // formatted event date
  dateHint: string | null;   // e.g. "In 12 days"
  value: number | null;
  valueKind: "quote" | "budget" | null;
  daysInStage: number;
  owner: string | null;
  nextAction: string;
  urgency: "overdue" | "soon" | "normal" | "done";
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export function PipelineBoard({ kind, columns, cards: initial, currency }: {
  kind: "enquiries" | "events"; columns: BoardColumn[]; cards: BoardCard[]; currency: string;
}) {
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  useEffect(() => setCards(initial), [initial]);

  const byColumn = useMemo(() => {
    const m = new Map<string, BoardCard[]>(columns.map((c) => [c.key, []]));
    for (const c of cards) m.get(c.column)?.push(c);
    return m;
  }, [cards, columns]);

  function move(cardId: string, to: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.column === to) return;
    const label = columns.find((c) => c.key === to)?.label ?? to;
    const snapshot = cards;
    setError(undefined);
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, column: to, status: to, statusLabel: undefined, daysInStage: 0 } : c)));
    start(async () => {
      const res = kind === "enquiries" ? await moveEnquiry(cardId, to as EnquiryStatus) : await moveEvent(cardId, to as EventStatus);
      if (res?.error) {
        setCards(snapshot);
        setError(`Couldn’t move ${card.ref} to ${label}: ${res.error}`);
      }
    });
  }

  return (
    <div className={cn("transition-opacity", pending && "opacity-90")}>
      {error && <div className="mb-3"><FormError message={error} /></div>}
      <p className="sr-only" aria-live="polite">{pending ? "Saving move…" : ""}</p>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <div className="flex gap-3" style={{ minWidth: columns.length * 268 }}>
          {columns.map((col) => {
            const list = byColumn.get(col.key) ?? [];
            const total = list.reduce((s, c) => s + (c.value ?? 0), 0);
            const isOver = over === col.key && dragging != null && cards.find((c) => c.id === dragging)?.column !== col.key;
            return (
              <section
                key={col.key}
                aria-label={`${col.label} — ${list.length} ${kind}`}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(col.key); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col.key ? null : o)); }}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragging; setOver(null); setDragging(null); if (id) move(id, col.key); }}
                className={cn("flex w-[256px] shrink-0 flex-col rounded-xl border bg-zinc-50/70 transition-colors sm:w-[264px]",
                  isOver ? "border-brand-300 bg-brand-50/60" : "border-line")}
              >
                <header className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={col.tone} dot>{col.label}</Badge>
                      <span className="text-[12px] font-medium text-ink-faint">{list.length}</span>
                    </div>
                    {col.hint && <p className="mt-1 text-[11px] text-ink-faint">{col.hint}</p>}
                  </div>
                  <span className="tabular shrink-0 pt-0.5 text-[12.5px] font-semibold text-ink" title="Total quote value, or budget where there is no quote yet">{total > 0 ? fmt(total, currency) : "—"}</span>
                </header>
                <ol className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
                  {list.map((c) => (
                    <li key={c.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setDragging(c.id); }}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      className={cn("group relative cursor-grab rounded-lg border border-line bg-white p-3 shadow-card transition-shadow hover:border-brand-200 hover:shadow-pop active:cursor-grabbing",
                        dragging === c.id && "opacity-40")}
                    >
                      <GripVertical className="absolute right-1.5 top-2.5 hidden h-3.5 w-3.5 text-ink-faint/60 sm:block" aria-hidden />
                      <div className="flex items-start gap-2 pr-3">
                        <div className="min-w-0 flex-1">
                          <Link href={c.href} className="block truncate text-[13px] font-semibold text-ink hover:text-brand-700" draggable={false}>{c.customer}</Link>
                          <p className="truncate text-[12px] text-ink-muted" title={c.title}>{c.ref} · {c.title}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 text-ink-faint" />{c.date ?? "No date"}{c.dateHint && <span className="text-ink-faint">· {c.dateHint}</span>}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink">
                          {c.value != null ? fmt(c.value, currency) : <span className="font-normal text-ink-faint">No value yet</span>}
                          {c.valueKind && <span className="ml-1 text-[11px] font-normal text-ink-faint">{c.valueKind === "quote" ? "quote" : "budget"}</span>}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className={cn("text-[11px]", c.daysInStage >= 14 ? "font-medium text-amber-700" : "text-ink-faint")} title="Days in this stage">{c.daysInStage}d</span>
                          {c.owner ? <Avatar name={c.owner} size={20} /> : <span className="h-5 w-5 rounded-full border border-dashed border-line-strong" title="Unassigned" />}
                        </span>
                      </div>
                      {c.statusLabel && <Badge tone="amber" className="mt-2">{c.statusLabel}</Badge>}
                      <div className={cn("mt-2 border-t border-line pt-2 text-[11.5px] leading-snug",
                        c.urgency === "overdue" ? "font-medium text-rose-700" : c.urgency === "soon" ? "text-amber-800" : c.urgency === "done" ? "text-ink-faint" : "text-ink")}>
                        <span className="text-ink-faint">Next: </span>{c.nextAction}
                      </div>
                      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
                        <span>Move to</span>
                        <select
                          aria-label={`Move ${c.ref} to another stage`}
                          value={c.column}
                          disabled={pending}
                          onChange={(e) => move(c.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent py-0.5 text-[11.5px] text-ink-muted hover:border-line focus:border-brand-300 focus:outline-none"
                        >
                          {columns.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </label>
                    </li>
                  ))}
                  {list.length === 0 && (
                    <li className={cn("flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-[12px]",
                      isOver ? "border-brand-300 text-brand-700" : "border-line text-ink-faint")}>
                      {isOver ? "Drop here" : "Nothing here"}
                    </li>
                  )}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
