"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cancelBookingAction, moveBookingAction } from "@/app/book/actions";

interface Option { id: string; label: string; left: number }

export function ManageActions({ token, options, canChange, seats, policy }: { token: string; options: Option[]; canChange: boolean; seats: number; policy: string }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the booking system — try again." }));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) { setAsk(false); setPick(""); router.refresh(); }
  });
  if (!canChange) return <p className="text-[0.875rem] text-ink-muted">{policy}</p>;
  const fits = options.filter((o) => o.left >= seats);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[0.9375rem] font-semibold text-ink">Move to another date</p>
        {fits.length ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-base text-ink">
              <option value="">Choose a new date…</option>
              {fits.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.left} left</option>)}
            </select>
            <button type="button" disabled={!pick || pending} onClick={() => run(() => moveBookingAction(token, pick))} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] disabled:opacity-40">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}Move my booking
            </button>
          </div>
        ) : <p className="mt-1 text-[0.875rem] text-ink-muted">No other dates have {seats} seat{seats === 1 ? "" : "s"} free right now.</p>}
      </div>
      <div className="border-t border-line pt-4">
        {!ask ? (
          <button type="button" onClick={() => setAsk(true)} className="text-[0.875rem] font-semibold text-rose-700 hover:underline">Cancel my booking</button>
        ) : (
          <div className="rounded-xl bg-rose-50 p-4 text-[0.875rem] text-rose-900">
            <p>Cancel this booking? Your seat{seats === 1 ? "" : "s"} will go to someone else. {policy}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setAsk(false)} className="h-11 rounded-xl bg-white px-4 font-semibold text-ink ring-1 ring-line">Keep it</button>
              <button type="button" disabled={pending} onClick={() => run(() => cancelBookingAction(token))} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">{pending && <Loader2 className="h-4 w-4 animate-spin" />}Yes, cancel</button>
            </div>
          </div>
        )}
      </div>
      {msg && <p role="status" className={`rounded-xl px-4 py-3 text-[0.875rem] font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
    </div>
  );
}
