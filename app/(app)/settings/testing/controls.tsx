"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearTestResultsAction, setTestingAction } from "./actions";

export function TestingSwitch({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3">
        <button type="button" role="switch" aria-checked={on} disabled={pending}
          onClick={() => start(async () => { const next = !on; const r = await setTestingAction(next); if (r.ok) { setOn(next); setErr(null); } else setErr(r.error); })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-500" : "bg-zinc-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className="text-[0.875rem] font-medium text-ink">{on ? "The test code is on" : "The test code is off"}</span>
      </label>
      {err && <p className="mt-2 text-[0.8125rem] text-rose-700">{err}</p>}
    </div>
  );
}

/** Two taps (no pop-up): "Clear test results" → "Yes, clear them". */
export function ClearTests({ count }: { count: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clear = () => start(async () => {
    const r = await clearTestResultsAction();
    setAsk(false);
    if (!r.ok) { setMsg(r.error); return; }
    const c = r.cleared;
    const bits = [["bookings", "booking"], ["gifts", "gift certificate"], ["orders", "order"], ["giftCards", "gift card"], ["students", "test student"], ["customers", "test customer"]]
      .map(([k, w]) => (c[k] ? `${c[k]} ${w}${c[k] === 1 ? "" : "s"}` : null)).filter(Boolean);
    setMsg(bits.length ? `Cleared ${bits.join(", ")}.` : "There was nothing to clear.");
    router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!ask ? (
        <Button variant="danger" onClick={() => { setMsg(null); setAsk(true); }} disabled={pending}><Trash2 className="h-4 w-4" />Clear test results</Button>
      ) : (
        <>
          <span className="text-[0.8125rem] text-ink">Remove {count ? `all ${count} test record${count === 1 ? "" : "s"}` : "all test records"}? Real bookings and orders aren&apos;t touched.</span>
          <Button variant="danger" onClick={clear} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Yes, clear them</Button>
          <Button variant="ghost" onClick={() => setAsk(false)} disabled={pending}>Cancel</Button>
        </>
      )}
      {msg && <p className="text-[0.8125rem] font-medium text-ink" role="status">{msg}</p>}
    </div>
  );
}
