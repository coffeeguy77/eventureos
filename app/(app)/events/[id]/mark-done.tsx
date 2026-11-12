"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markHeldDone } from "../approval-actions";
import { Button } from "@/components/ui/button";

/** "It's done — mark completed" for a held booking that's already happened or been paid. */
export function MarkHeldDone({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = () => start(async () => {
    setError(null);
    const r = await markHeldDone(eventId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {compact
        ? <button type="button" onClick={run} disabled={pending} className="rounded-md bg-amber-900/10 px-2 py-1 text-[0.75rem] font-semibold text-amber-900 hover:bg-amber-900/20 disabled:opacity-60">{pending ? "Saving…" : "It's done — mark completed"}</button>
        : <Button variant="secondary" disabled={pending} className="w-full sm:w-auto" onClick={run}>{pending ? "Saving…" : "It's done — mark completed"}</Button>}
      {error && <span className="text-[0.75rem] font-medium text-danger">{error}</span>}
    </span>
  );
}
