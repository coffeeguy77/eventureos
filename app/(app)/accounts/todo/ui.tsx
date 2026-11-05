"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addAccountTodo, setAccountTodo } from "../todo-actions";

export interface Row { id: string; title: string; customer: { id: string; name: string } | null; done: boolean; due: string | null; overdue: boolean; today: boolean }

export function TodoList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setErr(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) setErr(r.error ?? "Something went wrong."); else { after?.(); router.refresh(); }
  });
  return (
    <div className="border-t border-line">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <button type="button" disabled={pending} onClick={() => go(() => setAccountTodo(r.id, !r.done))} aria-label={r.done ? `Not done: ${r.title}` : `Done: ${r.title}`}
              className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset", r.done ? "bg-emerald-600 text-white ring-emerald-600" : "text-transparent ring-line-strong hover:text-emerald-600 hover:ring-emerald-400")}>
              <Check className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 text-[0.875rem]">
              <p className={cn("text-ink", r.done && "text-ink-faint line-through")}>{r.title}</p>
              <p className="text-[0.75rem] text-ink-muted">
                {r.customer && <Link href={`/accounts/${r.customer.id}`} className="font-medium hover:text-brand-700 hover:underline">{r.customer.name}</Link>}
                {r.customer && r.due && " · "}
                {r.due && <span className={cn(r.overdue && "font-medium text-rose-700", r.today && "font-medium text-amber-700")}>{r.overdue ? `was due ${r.due}` : r.today ? "today" : r.due}</span>}
              </p>
            </div>
          </li>
        ))}
        {!rows.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">All done.</li>}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a to-do (not tied to a customer)" aria-label="New to-do" className="min-w-0 flex-1 basis-56" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" className="w-full sm:w-40" />
        <Button size="sm" disabled={pending || !title.trim()} onClick={() => go(() => addAccountTodo(null, title, due || null), () => { setTitle(""); setDue(""); })}><Plus className="h-4 w-4" />Add</Button>
      </div>
      {err && <div className="px-5 pb-3"><FormError message={err} /></div>}
    </div>
  );
}
