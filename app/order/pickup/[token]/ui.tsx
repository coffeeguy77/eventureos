"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck } from "lucide-react";
import { markCollected } from "./actions";

/** Signed-in staff only: hand the order over. */
export function CollectButton({ token, brand, name }: { token: string; brand: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button type="button" disabled={pending} onClick={() => start(async () => {
        setErr(null);
        const r = await markCollected(token).catch(() => ({ ok: false, error: "No connection — try again." }));
        if (!r.ok) setErr(r.error ?? "Couldn't save."); else router.refresh();
      })} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold text-white disabled:opacity-60" style={{ background: brand }}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}Mark collected
      </button>
      <p className="mt-1 text-center text-[0.75rem] text-zinc-500">Recorded as handed over by {name}</p>
      {err && <p className="mt-1 text-center text-[0.8125rem] text-rose-700">{err}</p>}
    </div>
  );
}
