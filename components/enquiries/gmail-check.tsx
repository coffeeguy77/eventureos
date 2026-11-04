"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { checkGmailNow, type GmailSyncState } from "@/app/(app)/enquiries/gmail-actions";

/** "Check Gmail" on the Enquiries inbox — pulls new emails in now instead of waiting for the automatic check. */
export function GmailCheck({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<GmailSyncState | null>(null);
  const go = () => start(async () => {
    const r = await checkGmailNow().catch(() => ({ ok: false, message: "Couldn't reach the server — try again." }));
    setRes(r);
    router.refresh();
    if (r.ok) setTimeout(() => setRes(null), 8000);
  });
  return (
    <>
      <Button onClick={go} disabled={pending} title={lastSync ? `Last checked ${relative(lastSync)}` : "Read new emails from Gmail now"}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {pending ? "Checking Gmail…" : "Check Gmail"}
        {!pending && lastSync && <span className="hidden text-[0.75rem] font-normal text-ink-faint sm:inline">· {relative(lastSync)}</span>}
      </Button>
      {res && (
        <div role="status" className={cn("fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-[0.875rem] shadow-pop ring-1",
          res.ok ? "bg-surface text-ink ring-line" : "bg-surface text-rose-700 ring-rose-200")}>
          <p className="flex-1">{res.message}</p>
          <button type="button" onClick={() => setRes(null)} className="text-ink-faint hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}
