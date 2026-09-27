"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ShieldAlert } from "lucide-react";
import { blockSenders, markSpam, type SpamResult } from "@/app/(app)/enquiries/spam-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const FORM = "enquiry-bulk";
const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${FORM}"][name="id"]`));

/** Checkbox for one inbox row (sits above the row's full-width link). */
export function RowCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" form={FORM} name="id" value={id} aria-label={`Select ${label}`}
    onClick={(e) => e.stopPropagation()} className="relative z-10 h-4 w-4 rounded border-line-strong text-brand-600" />;
}

/** Select-all + bulk "Move to spam" / "Block sender" for the enquiries inbox. */
export function InboxBulkBar({ total }: { total: number }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const onChange = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  const selected = () => boxes().filter((b) => b.checked).map((b) => b.value);
  const setAll = (v: boolean) => { for (const b of boxes()) b.checked = v; setCount(v ? boxes().length : 0); };
  const run = (fn: () => Promise<SpamResult>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) { setAll(false); setConfirmBlock(false); }
    router.refresh();
  });
  const all = total > 0 && count === total;

  return (
    <>
      <form id={FORM} onSubmit={(e) => e.preventDefault()} />
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-line px-4 py-2", count ? "bg-brand-50/60" : "")}>
        <label className="flex items-center gap-2 text-[0.7812rem] font-medium text-ink-muted">
          <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = count > 0 && !all; }} onChange={() => setAll(!all)} disabled={!total}
            className="h-4 w-4 rounded border-line-strong text-brand-600" aria-label="Select all enquiries" />
          {count ? `${count} selected` : "Select"}
        </label>
        {count > 0 && (
          <>
            <span className="flex-1" />
            <Button size="sm" disabled={pending} onClick={() => run(() => markSpam(selected()))}><ShieldAlert className="h-3.5 w-3.5" />Move to spam</Button>
            <Button size="sm" disabled={pending} onClick={() => setConfirmBlock((v) => !v)}><Ban className="h-3.5 w-3.5" />Block sender</Button>
          </>
        )}
      </div>
      {confirmBlock && count > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-[0.8125rem] text-amber-900">
          <span className="min-w-0 flex-1">Block the sender{count === 1 ? "" : "s"}? Their unworked emails are removed from EventureOS (Gmail keeps them) and they&apos;re never imported again.</span>
          <Button size="sm" onClick={() => setConfirmBlock(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => blockSenders(selected()))}>{pending ? "Blocking…" : "Block"}</Button>
        </div>
      )}
      {msg && <p role="status" className={cn("border-b border-line px-4 py-2 text-[0.7812rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </>
  );
}
