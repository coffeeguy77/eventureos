"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importFromXero, setRecurringStatus } from "@/app/(app)/hosting/recurring-actions";

export function ImportXero() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await importFromXero(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Import from Xero</Button>
      {msg && <p role="status" className={`max-w-xl text-[0.75rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}

export function StatusSwitch({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const to = status === "active" ? "paused" : "active";
  return (
    <span className="flex flex-col items-end">
      <button type="button" disabled={pending || status === "ended"} onClick={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await setRecurringStatus(id, to); if (!r.ok) setErr(r.error); router.refresh(); }); }}
        className={`rounded-full px-2.5 py-1 text-[0.7188rem] font-semibold ring-1 ${status === "active" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : status === "ended" ? "bg-zinc-100 text-zinc-500 ring-zinc-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
        {pending ? "…" : status === "active" ? "On" : status === "ended" ? "Ended" : "Paused"}
      </button>
      {err && <span className="mt-1 max-w-[220px] text-right text-[0.6875rem] text-rose-700">{err}</span>}
    </span>
  );
}
