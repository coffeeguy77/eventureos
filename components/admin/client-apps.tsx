"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppPicker } from "./app-picker";
import { resendClientWelcome, setClientApps } from "@/app/admin/client-actions";
import { APP_KEYS, type AppKey } from "@/lib/apps";

export function ClientApps({ orgId, access, planApps }: { orgId: string; access: AppKey[] | null; planApps: AppKey[] }) {
  const router = useRouter();
  const [apps, setApps] = useState<AppKey[]>(access ?? [...APP_KEYS]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (v: AppKey[] | null) => start(async () => {
    setMsg(null);
    const r = await setClientApps(orgId, v);
    setMsg(r.ok ? { ok: true, text: "Saved. They'll see the change next time a page loads." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div>
      {access === null && <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-[0.75rem] text-ink-muted">This business was set up before app access, so it sees every app. Saving below locks it to the ones you tick.</p>}
      <AppPicker value={apps} onChange={setApps} planApps={planApps} />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
        {access !== null && <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>Give everything (no limits)</Button>}
        <Button variant="primary" disabled={pending} onClick={() => save(apps)}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save apps</Button>
      </div>
    </div>
  );
}

export function ResendWelcome({ orgId, sent }: { orgId: string; sent: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-[0.75rem] text-ink-muted">{msg}</span>}
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await resendClientWelcome(orgId); setMsg(r.ok ? "Sent." : r.error); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{sent ? "Send welcome again" : "Send welcome email"}
      </Button>
    </span>
  );
}
