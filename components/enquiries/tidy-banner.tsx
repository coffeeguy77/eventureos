"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { archivePastEnquiries } from "@/app/(app)/enquiries/star-actions";
import { Button } from "@/components/ui/button";

/** "N open enquiries are for dates that have passed" — one tap moves them to Archived (history kept). */
export function TidyBanner({ count, showing }: { count: number; showing: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 rounded-xl bg-amber-50/70 px-4 py-3 text-[0.8125rem] text-amber-950 ring-1 ring-inset ring-amber-200">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Archive className="h-4 w-4 shrink-0 text-amber-700" />
        <p className="min-w-0 flex-1">
          <b className="font-semibold">{count} open enquir{count === 1 ? "y is" : "ies are"} for dates that have passed</b> and never became a job.
          Archive them to clear the inbox — they stay on each client&apos;s history, in search and under Archived. Starred ones are left alone.
        </p>
        {showing
          ? <Link href="/enquiries" className="shrink-0 font-medium text-amber-900 underline-offset-2 hover:underline">Show all open</Link>
          : <Link href="/enquiries?past=1" className="shrink-0 font-medium text-amber-900 underline-offset-2 hover:underline">Show them</Link>}
        <Button size="sm" variant="primary" disabled={pending} onClick={() => setAsk((v) => !v)}><Archive className="h-3.5 w-3.5" />Archive {count}</Button>
      </div>
      {ask && (
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-amber-200 pt-2.5">
          <span className="min-w-0 flex-1 text-[0.78rem]">Move {count} enquir{count === 1 ? "y" : "ies"} to Archived? You can move any of them back to the inbox.</span>
          <Button size="sm" onClick={() => setAsk(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => {
            const r = await archivePastEnquiries().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
            setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            setAsk(false);
            if (r.ok) router.push("/enquiries");
            router.refresh();
          })}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Archive them</Button>
        </div>
      )}
      {msg && <p className={msg.ok ? "mt-2 text-emerald-800" : "mt-2 text-rose-700"}>{msg.text}</p>}
    </div>
  );
}
