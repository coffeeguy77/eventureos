"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { saveAiSettings } from "@/app/(app)/nerd-herd/actions";

/** Nerd Herd → Settings → AI maintenance. */
export function AiSettingsForm({ initial, defaultModel }: { initial: { ai_model: string; ai_job_cap_usd: number; ai_monthly_cap_usd: number; ai_backup_hours: number }; defaultModel: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof f>) => { setF((o) => ({ ...o, ...p })); setSaved(false); };
  const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="ai-cap-month" hint="US$, all jobs">Monthly AI limit</Label><Input id="ai-cap-month" inputMode="decimal" value={String(f.ai_monthly_cap_usd)} onChange={(e) => set({ ai_monthly_cap_usd: num(e.target.value) })} /></div>
        <div><Label htmlFor="ai-cap-job" hint="US$">Limit per job</Label><Input id="ai-cap-job" inputMode="decimal" value={String(f.ai_job_cap_usd)} onChange={(e) => set({ ai_job_cap_usd: num(e.target.value) })} /></div>
        <div><Label htmlFor="ai-backup" hint="hours at your rate">Backup line on invoices</Label><Input id="ai-backup" inputMode="decimal" value={String(f.ai_backup_hours)} onChange={(e) => set({ ai_backup_hours: num(e.target.value) })} /></div>
        <div><Label htmlFor="ai-model" hint="leave blank for the default">Claude model</Label><Input id="ai-model" value={f.ai_model} placeholder={defaultModel} onChange={(e) => set({ ai_model: e.target.value })} /></div>
      </div>
      <p className="text-[0.7188rem] text-ink-muted">A job that reaches its limit stops and asks for a person; when the monthly limit is used, jobs wait until you raise it. Costs are Claude's usage on your API key (an estimate — the Anthropic console has the exact figure, and you can set a hard limit there too). Set the backup line to 0 to leave backups off invoices.</p>
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setError(null); const r = await saveAiSettings(f); if (!r.ok) { setError(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
