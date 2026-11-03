"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linkDetectedHosting } from "@/app/(app)/nerd-herd/websites/[id]/connector-actions";

/** The Connector shows this site is on SiteGround — one tap adds it to your SiteGround hosting and links it. */
export function LinkHosting({ websiteId, host, canRun }: { websiteId: string; host: string; canRun: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[0.8125rem] text-ink ring-1 ring-sky-500/30"><Server className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />The Connector shows this site is hosted on <strong>{host}</strong>.</p>
      {canRun && <Button variant="primary" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await linkDetectedHosting(websiteId); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Add to {host} hosting</Button>}
      {msg && <p className={msg.ok ? "text-[0.8125rem] text-emerald-600" : "text-[0.8125rem] text-rose-600"}>{msg.text}</p>}
    </div>
  );
}
