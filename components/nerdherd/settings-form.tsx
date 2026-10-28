"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { saveNerdSettings } from "@/app/(app)/nerd-herd/actions";

export function NerdSettingsForm({ initial }: { initial: { hourly_rate: number; account_code: string; email_tickets: boolean; support_email: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof f>) => { setF((o) => ({ ...o, ...p })); setSaved(false); };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="ns-rate" hint="ex GST">Hourly rate</Label><Input id="ns-rate" inputMode="decimal" value={String(f.hourly_rate)} onChange={(e) => set({ hourly_rate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></div>
        <div><Label htmlFor="ns-acc" hint="for billed time">Xero account code</Label><Input id="ns-acc" value={f.account_code} onChange={(e) => set({ account_code: e.target.value })} /></div>
      </div>
      <div><Label htmlFor="ns-email" hint="the address clients write to">Support email</Label><Input id="ns-email" type="email" value={f.support_email} onChange={(e) => set({ support_email: e.target.value })} placeholder="hello@yourdomain.com.au" /></div>
      <label className="flex items-start gap-2 text-[0.8125rem]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.email_tickets} onChange={(e) => set({ email_tickets: e.target.checked })} /><span><span className="font-medium text-ink">Turn client emails into tickets</span><span className="block text-[0.7188rem] text-ink-muted">A new email from a client (not spam, not a supplier) opens a ticket; their replies land on the same ticket.</span></span></label>
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setError(null); const r = await saveNerdSettings(f); if (!r.ok) { setError(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
