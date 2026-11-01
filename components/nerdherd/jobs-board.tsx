"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type Job = { id: string; number: number; subject: string; status: string; priority: string; due_date: string | null; customer: string | null; domain: string | null; assignee: string | null; tabs: { id: string; name: string; who: string | null; done: boolean; assigned_to: string | null }[] };

/** My jobs / All open / Unassigned — with who has each ticket (and each tab on it). */
export function JobsBoard({ mine, all, unassigned, me, today }: { mine: Job[]; all: Job[]; unassigned: Job[]; me: string; today: string }) {
  const [view, setView] = useState<"mine" | "all" | "unassigned">(mine.length ? "mine" : unassigned.length ? "unassigned" : "all");
  const list = view === "mine" ? mine : view === "all" ? all : unassigned;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
        <span className="mr-2 text-[0.9375rem] font-semibold text-ink">Support jobs</span>
        {([["mine", "My jobs", mine.length], ["all", "All open", all.length], ["unassigned", "Unassigned", unassigned.length]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setView(k)} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium ring-1", view === k ? "bg-ink text-surface ring-ink" : "bg-surface text-ink-muted ring-line hover:text-ink", k === "unassigned" && n > 0 && view !== k && "text-amber-700")}>{l} ({n})</button>
        ))}
        <Link href="/nerd-herd/tickets" className="ml-auto text-[0.75rem] font-medium text-brand-600">All tickets</Link>
      </div>
      {list.length === 0 ? <p className="border-t border-line px-5 py-5 text-[0.8125rem] text-ink-muted">{view === "mine" ? "Nothing assigned to you." : view === "unassigned" ? "Everything has someone on it." : "No open tickets."}</p> : (
        <ul className="divide-y divide-line border-t border-line">
          {list.slice(0, 25).map((j) => {
            const open = j.tabs.filter((t) => !t.done);
            const late = j.due_date && j.due_date < today;
            return (
              <li key={j.id}>
                <Link href={`/nerd-herd/tickets/${j.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-canvas">
                  <span className="w-12 shrink-0 pt-0.5 text-[0.75rem] text-ink-faint">#{j.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-medium text-ink">{j.subject}</span>
                    <span className="block truncate text-[0.75rem] text-ink-muted">{[j.customer ?? "No client", j.domain, j.status.replace(/_/g, " ")].filter(Boolean).join(" · ")}{late ? <span className="font-medium text-rose-700"> · past due</span> : null}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {open.length ? open.map((t) => (
                        <span key={t.id} className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1", t.assigned_to === me ? "bg-brand-500/10 text-brand-700 ring-brand-500/30" : t.assigned_to ? "bg-canvas text-ink-muted ring-line" : "bg-amber-500/10 text-amber-700 ring-amber-500/30")}>{t.name} · {t.who?.split(" ")[0] ?? "unassigned"}</span>
                      )) : <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1", j.assignee ? "bg-canvas text-ink-muted ring-line" : "bg-amber-500/10 text-amber-700 ring-amber-500/30")}>{j.assignee ?? "Unassigned"}</span>}
                    </span>
                  </span>
                  {j.priority !== "normal" && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", j.priority === "urgent" || j.priority === "high" ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-ink-muted")}>{j.priority}</span>}
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 25 && <Link href="/nerd-herd/tickets" className="block border-t border-line px-5 py-2.5 text-[0.7812rem] font-medium text-brand-600">See all {list.length}</Link>}
    </Card>
  );
}
