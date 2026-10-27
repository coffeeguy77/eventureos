"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkEverythingNow } from "@/app/(app)/hosting/actions";

/** Pull Xero, sync the servers and recheck who's paid — the morning check. */
export function CheckNow() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button variant="primary" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await checkEverythingNow(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{pending ? "Checking Xero and servers…" : "Check Xero & servers now"}
      </Button>
      {msg && <p role="status" className={`max-w-xl text-[0.75rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
