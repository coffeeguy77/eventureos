"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Inbox, Trash2 } from "lucide-react";
import { blockSenders, deleteSpam, notSpam, type SpamResult } from "@/app/(app)/enquiries/spam-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface SpamRow { id: string; number: number; from: string; email: string | null; subject: string; snippet: string | null; reason: string | null; received: string }

/** The Spam folder: tick one, some or all, then Not spam / Block sender / Delete. Deleting and blocking ask once, inline. */
export function SpamList({ rows }: { rows: SpamRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "delete" | "block">(null);
  const [domain, setDomain] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const all = rows.length > 0 && picked.size === rows.length;
  const some = picked.size > 0 && !all;
  const chosen = useMemo(() => rows.filter((r) => picked.has(r.id)), [rows, picked]);
  const senders = new Set(chosen.map((r) => r.email).filter(Boolean)).size;

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (fn: () => Promise<SpamResult>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) { setPicked(new Set()); setConfirm(null); }
    router.refresh();
  });

  return (
    <div>
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur">
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some; }} disabled={!rows.length}
            onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4 rounded border-line-strong text-brand-600" aria-label="Select all" />
          {picked.size ? `${picked.size} selected` : "Select all"}
        </label>
        <span className="flex-1" />
        <Button size="sm" disabled={!picked.size || pending} onClick={() => run(() => notSpam([...picked]))}><Inbox className="h-3.5 w-3.5" />Not spam</Button>
        <Button size="sm" disabled={!picked.size || pending} onClick={() => setConfirm(confirm === "block" ? null : "block")}><Ban className="h-3.5 w-3.5" />Block sender{senders === 1 ? "" : "s"}</Button>
        <Button size="sm" variant="danger" disabled={!picked.size || pending} onClick={() => setConfirm(confirm === "delete" ? null : "delete")}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
      </div>

      {confirm && picked.size > 0 && (
        <div className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-3 text-[13px]", confirm === "delete" ? "border-rose-100 bg-rose-50 text-rose-900" : "border-amber-100 bg-amber-50 text-amber-900")}>
          {confirm === "delete" ? (
            <span className="min-w-0 flex-1">Delete {picked.size} email{picked.size === 1 ? "" : "s"} from EventureOS? Gmail keeps its copy. The senders can still email you — block them to stop that.</span>
          ) : (
            <span className="min-w-0 flex-1">
              Block {senders} sender{senders === 1 ? "" : "s"}? Their emails are removed here and never imported again — not even into Spam.
              <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={domain} onChange={(e) => setDomain(e.target.checked)} className="h-4 w-4 rounded" />
                Block their whole company domain (never Gmail, Outlook etc.)</label>
            </span>
          )}
          <Button size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button size="sm" variant={confirm === "delete" ? "danger" : "primary"} disabled={pending}
            onClick={() => run(() => confirm === "delete" ? deleteSpam([...picked]) : blockSenders([...picked], domain))}>
            {pending ? "Working…" : confirm === "delete" ? "Delete" : "Block"}
          </Button>
        </div>
      )}
      {msg && <p role="status" className={cn("border-b border-line px-4 py-2 text-[12.5px] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}

      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex items-start gap-3 px-4 py-3", picked.has(r.id) && "bg-brand-50/50")}>
            <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.subject}`}
              className="mt-1 h-4 w-4 shrink-0 rounded border-line-strong text-brand-600" />
            <Link href={`/enquiries/${r.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{r.from}{r.email && r.email !== r.from && <span className="font-normal text-ink-faint"> · {r.email}</span>}</span>
                <span className="shrink-0 text-[12px] text-ink-faint">{r.received}</span>
              </div>
              <p className="truncate text-[13px] text-ink">{r.subject}</p>
              {r.snippet && <p className="line-clamp-1 text-[12.5px] text-ink-muted">{r.snippet}</p>}
              {r.reason && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-rose-700/90">Why: {r.reason}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
