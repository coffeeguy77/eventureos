"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Inbox, ShieldAlert } from "lucide-react";
import { blockSenders, markSpam, notSpam, type SpamResult } from "@/app/(app)/enquiries/spam-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Spam / Not spam / Block sender for one enquiry. Blocking asks once, inline. */
export function SpamButtons({ id, isSpam, sender, reason, hasEvent }: { id: string; isSpam: boolean; sender: string | null; reason: string | null; hasEvent: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<SpamResult>, gone = false) => start(async () => {
    setMsg(null);
    const r: SpamResult = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok && gone) { router.push("/enquiries?folder=spam"); return; }
    router.refresh();
  });
  if (hasEvent) return null;
  return (
    <div className="mt-4">
      {isSpam && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[0.8125rem] text-rose-900">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1"><span className="font-semibold">In Spam.</span> {reason ?? "Marked as spam."}</span>
          <Button size="sm" disabled={pending} onClick={() => run(() => notSpam([id]))}><Inbox className="h-3.5 w-3.5" />Not spam</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!isSpam && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markSpam([id]))}><ShieldAlert className="h-3.5 w-3.5" />Spam</Button>}
        {sender && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm((v) => !v)}><Ban className="h-3.5 w-3.5" />Block {sender}</Button>}
        {msg && <span className={cn("text-[0.7812rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
      </div>
      {confirm && sender && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">
          <span className="min-w-0 flex-1">Block <strong>{sender}</strong>? This email and any other unworked ones from them are removed from EventureOS (Gmail keeps them), and they&apos;re never imported again.</span>
          <Button size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => blockSenders([id]), true)}>{pending ? "Blocking…" : "Block"}</Button>
        </div>
      )}
    </div>
  );
}
