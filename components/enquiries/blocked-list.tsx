"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { addBlock, removeBlock, type SpamResult } from "@/app/(app)/enquiries/spam-actions";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface BlockRow { id: string; value: string; reason: string | null; hits: number; last_hit: string | null; added: string; by: string | null }

/** Blocked senders: search, add an address or domain, unblock. */
export function BlockedList({ rows, canEdit }: { rows: BlockRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const shown = rows.filter((r) => !q.trim() || r.value.includes(q.trim().toLowerCase()) || (r.reason ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  const run = (fn: () => Promise<SpamResult>, after?: () => void) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) after?.();
    router.refresh();
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search blocked senders…" className={cn(inputClass, "pl-9")} aria-label="Search blocked senders" />
        </div>
        {canEdit && (
          <form className="flex min-w-[16rem] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) run(() => addBlock(value), () => setValue("")); }}>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@example.com or example.com" className={inputClass} aria-label="Email or domain to block" />
            <Button type="submit" variant="primary" disabled={pending || !value.trim()}>Block</Button>
          </form>
        )}
      </div>
      {msg && <p role="status" className={cn("border-b border-line px-4 py-2 text-[0.7812rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-[0.8125rem] text-ink-muted">{rows.length ? "No blocked senders match your search." : "No blocked senders yet. Block them from the Spam folder, from an enquiry, or add one above."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8438rem] font-medium text-ink">{r.value.startsWith("@") ? <>Anyone at <span className="font-semibold">{r.value.slice(1)}</span></> : r.value}</p>
                <p className="truncate text-[0.75rem] text-ink-muted">
                  {r.reason ?? "Blocked"} · added {r.added}{r.by ? ` by ${r.by}` : ""}{r.hits ? ` · stopped ${r.hits} email${r.hits === 1 ? "" : "s"}${r.last_hit ? `, last ${r.last_hit}` : ""}` : ""}
                </p>
              </div>
              {canEdit && (
                <button type="button" disabled={pending} onClick={() => run(() => removeBlock(r.id))} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[0.7812rem] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink">
                  <X className="h-3.5 w-3.5" />Unblock
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-faint">Blocked senders are never imported — they don't reach Enquiries or Spam. Your own team&apos;s emails are never imported either.</p>
    </div>
  );
}
