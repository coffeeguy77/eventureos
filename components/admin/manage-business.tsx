"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinBusiness, leaveBusiness, openBusiness } from "@/app/admin/actions";

/** Be on a client's team as their account manager — it appears in your business switcher like your own businesses. */
export function ManageBusiness({ orgId, joined, name }: { orgId: string; joined: boolean; name: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => start(async () => { setErr(null); const r = await fn(); if (!r.ok) setErr(r.error); else { setSure(false); router.refresh(); } });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!joined && <Button variant="primary" disabled={pending} onClick={() => run(() => joinBusiness(orgId))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Join as account manager</Button>}
      {joined && <Button variant="primary" disabled={pending} onClick={() => start(() => openBusiness(orgId))}>Open {name}</Button>}
      {joined && (sure
        ? <><span className="text-[0.8125rem] text-ink-muted">Leave their team?</span><Button variant="ghost" disabled={pending} onClick={() => run(() => leaveBusiness(orgId))}>Leave</Button><Button variant="ghost" onClick={() => setSure(false)}>Stay</Button></>
        : <Button variant="ghost" onClick={() => setSure(true)}>Leave team</Button>)}
      {err && <p className="w-full text-[0.8125rem] text-rose-600">{err}</p>}
    </div>
  );
}
