"use client";

import { useState, useTransition } from "react";
import { unsubscribe } from "./actions";

export function UnsubscribeButton({ token, business, done: initial }: { token: string; business: string; done: boolean }) {
  const [done, setDone] = useState(initial);
  const [pending, start] = useTransition();
  if (done) return (
    <div className="space-y-3">
      <p className="rounded-lg bg-emerald-50 px-4 py-3 text-[0.9375rem] font-medium text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30">You&apos;re unsubscribed. {business} won&apos;t send you these emails again.</p>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await unsubscribe(token, true); if (r.ok) setDone(false); })} className="text-[0.8125rem] font-medium text-ink-muted underline">Undo — keep me subscribed</button>
    </div>
  );
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { const r = await unsubscribe(token); if (r.ok) setDone(true); })}
      className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 font-semibold text-surface hover:opacity-90 disabled:opacity-50">
      {pending ? "Unsubscribing…" : "Unsubscribe"}
    </button>
  );
}
