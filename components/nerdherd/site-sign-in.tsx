"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, KeyRound, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supportSignIn } from "@/app/(app)/nerd-herd/vault/actions";
import { updateConnectorPlugin } from "@/app/(app)/nerd-herd/websites/[id]/connector-actions";

const atLeast = (v: string | null, min: [number, number]) => { const [a, b] = String(v ?? "0").split(".").map(Number); return (a || 0) > min[0] || ((a || 0) === min[0] && (b || 0) >= min[1]); };

/** "Sign in to wp-admin" through the Web Culture Connector — needs vault access, the vault unlocked with your PIN, and Connector 1.2.0+. */
export function SiteSignIn({ websiteId, connected, connectorVersion, saved, canUpdate }: { websiteId: string; connected: boolean; connectorVersion: string | null; saved: number; canUpdate: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; locked?: boolean } | null>(null);
  const [old, setOld] = useState(connected && !atLeast(connectorVersion, [1, 2]));
  const [pending, start] = useTransition();
  const [updating, startUpdate] = useTransition();
  const go = () => start(async () => {
    setMsg(null);
    const w = window.open("about:blank", "_blank");
    const r = await supportSignIn(websiteId);
    if (!r.ok) {
      w?.close();
      if (r.error.startsWith("OLD_CONNECTOR")) { setOld(true); return; }
      setMsg({ ok: false, text: r.error, locked: /locked|PIN|access/i.test(r.error) }); return;
    }
    if (w) w.location.href = r.data.url; else window.location.href = r.data.url;
    setMsg({ ok: true, text: `Signed in as ${r.data.as} in a new tab.` });
  });
  const upgrade = () => startUpdate(async () => {
    setMsg(null);
    const r = await updateConnectorPlugin(websiteId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `${r.data} You can sign in now.` }); setOld(false); router.refresh();
  });
  return (
    <div className="space-y-3">
      {old && (
        <div className="flex flex-col gap-3 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[0.8125rem] text-ink"><strong>This site has Connector {connectorVersion ?? "(older)"}.</strong> One-click sign-in needs 1.2.0 — a quick plugin update.</p>
          {canUpdate ? <Button variant="primary" className="shrink-0" disabled={updating} onClick={upgrade}>{updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}{updating ? "Updating…" : "Update Connector now"}</Button>
            : <span className="text-[0.75rem] text-ink-muted">Ask a manager to update it.</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {connected && <Button variant="primary" disabled={pending || old} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Sign in to wp-admin</Button>}
        <Link href={`/nerd-herd/vault?site=${websiteId}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-line hover:bg-canvas"><KeyRound className="h-4 w-4" />Passwords{saved ? ` (${saved})` : ""}</Link>
      </div>
      {!connected && <p className="text-[0.75rem] text-ink-muted">Connect the Web Culture Connector (WordPress command ops, below) for one-click sign-in.</p>}
      {msg && <p className={msg.ok ? "text-[0.8125rem] text-emerald-600" : "text-[0.8125rem] text-rose-600"}>{msg.text}{msg.locked && <> <Link href={`/nerd-herd/vault?site=${websiteId}`} className="font-semibold underline">Open the vault</Link></>}</p>}
    </div>
  );
}
