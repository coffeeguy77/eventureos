"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { savePlanApps } from "@/app/admin/client-actions";
import { APPS, PLAN_KEYS, PLAN_NAMES, type AppKey, type PlanKey } from "@/lib/apps";
import { AppIcon } from "./app-icon";

export function PlanAppsForm({ initial }: { initial: Record<PlanKey, AppKey[]> }) {
  const [m, setM] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (p: PlanKey, k: AppKey) => setM((o) => ({ ...o, [p]: o[p].includes(k) ? o[p].filter((x) => x !== k) : [...o[p], k] }));
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[0.8125rem]">
          <thead><tr className="border-b border-line text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-5 py-2.5 font-medium">App</th>{PLAN_KEYS.map((p) => <th key={p} className="px-3 py-2.5 text-center font-medium">{PLAN_NAMES[p]}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {APPS.map((a) => (
              <tr key={a.key}>
                <td className="px-5 py-2.5"><span className="flex items-center gap-2.5 font-medium text-ink"><AppIcon icon={a.icon} className="h-4 w-4 text-ink-faint" />{a.name}</span></td>
                {PLAN_KEYS.map((p) => <td key={p} className="px-3 py-2.5 text-center"><input type="checkbox" aria-label={`${a.name} in ${PLAN_NAMES[p]}`} checked={m[p].includes(a.key)} onChange={() => toggle(p, a.key)} className="h-4 w-4" /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3">
        {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await savePlanApps(m); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </div>
    </Card>
  );
}
