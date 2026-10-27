"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, GitMerge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linkClient, matchBillingNow } from "@/app/(app)/hosting/actions";

export function MatchNow({ first }: { first: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button variant="primary" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await matchBillingNow(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}{pending ? "Pulling Xero and matching…" : first ? "Pull repeating invoices & match" : "Match again"}
      </Button>
      {msg && <p role="status" className={`max-w-xl text-[0.75rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}

export function ConfirmClient({ accountId, options }: { accountId: string; options: { id: string; name: string; reasons: string[] }[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <span className="flex items-center gap-1 text-[0.75rem] font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />{done}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button key={o.id} type="button" disabled={pending} title={o.reasons.join("; ")} onClick={() => start(async () => { setErr(null); const r = await linkClient(accountId, o.id); if (!r.ok) { setErr(r.error); return; } setDone(o.name); router.refresh(); })}
          className="rounded-full bg-surface px-2.5 py-1 text-[0.7188rem] font-medium text-ink ring-1 ring-line hover:ring-brand-400">{o.name} <span className="text-ink-faint">· {o.reasons[0]}</span></button>
      ))}
      {err && <span className="text-[0.7188rem] text-rose-700">{err}</span>}
    </div>
  );
}
