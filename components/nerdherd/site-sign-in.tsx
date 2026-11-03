"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KeyRound, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supportSignIn } from "@/app/(app)/nerd-herd/vault/actions";

/** "Sign in to wp-admin" through the Web Culture Connector — needs vault access and the vault unlocked with your PIN. */
export function SiteSignIn({ websiteId, connected, saved }: { websiteId: string; connected: boolean; saved: number }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; locked?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setMsg(null);
    const w = window.open("about:blank", "_blank");
    const r = await supportSignIn(websiteId);
    if (!r.ok) { w?.close(); setMsg({ ok: false, text: r.error, locked: /locked|PIN|access/i.test(r.error) }); return; }
    if (w) w.location.href = r.data.url; else window.location.href = r.data.url;
    setMsg({ ok: true, text: `Signed in as ${r.data.as} in a new tab.` });
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {connected && <Button variant="primary" disabled={pending} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Sign in to wp-admin</Button>}
        <Link href={`/nerd-herd/vault?site=${websiteId}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-line hover:bg-canvas"><KeyRound className="h-4 w-4" />Passwords{saved ? ` (${saved})` : ""}</Link>
      </div>
      {!connected && <p className="text-[0.75rem] text-ink-muted">Connect the Web Culture Connector (above) for one-click sign-in.</p>}
      {msg && <p className={msg.ok ? "text-[0.8125rem] text-emerald-600" : "text-[0.8125rem] text-rose-600"}>{msg.text}{msg.locked && <> <Link href={`/nerd-herd/vault?site=${websiteId}`} className="font-semibold underline">Open the vault</Link></>}</p>}
    </div>
  );
}
