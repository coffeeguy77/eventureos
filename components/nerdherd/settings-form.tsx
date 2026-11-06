"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { saveNerdSettings } from "@/app/(app)/nerd-herd/actions";

export function NerdSettingsForm({ initial, team = [] }: { initial: { hourly_rate: number; account_code: string; email_tickets: boolean; support_email: string; staff_alerts: boolean; default_assignee: string | null; quiet_users: string[] }; team?: { id: string; name: string }[] }) {
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
      <label className="flex items-start gap-2 text-[0.8125rem]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.staff_alerts} onChange={(e) => set({ staff_alerts: e.target.checked })} /><span><span className="font-medium text-ink">Email the team about ticket activity</span><span className="block text-[0.7188rem] text-ink-muted">When a ticket is assigned to someone, or a client replies, opens or accepts a quote — only the person on the ticket gets an email (never the person who did it).</span></span></label>
      <div><Label htmlFor="ns-default" hint="new tickets with nobody on them">New tickets go to</Label>
        <Select id="ns-default" value={f.default_assignee ?? ""} onChange={(e) => set({ default_assignee: e.target.value || null })}>
          <option value="">Nobody (they wait unassigned)</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <p className="mt-1 text-[0.7188rem] text-ink-muted">Tickets from client emails, the client page and Accounts are given to this person, and only they get the email. A ticket you open yourself without assigning stays yours.</p></div>
      <div><p className="mb-1 text-[0.8125rem] font-medium text-ink">Never email these people about tickets</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {team.map((m) => (
            <label key={m.id} className="inline-flex min-h-9 items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={f.quiet_users.includes(m.id)} onChange={(e) => set({ quiet_users: e.target.checked ? [...f.quiet_users, m.id] : f.quiet_users.filter((x) => x !== m.id) })} />{m.name}</label>
          ))}
        </div>
        <p className="mt-1 text-[0.7188rem] text-ink-muted">They can still open tickets (e.g. Accounts sending a job) — those go to the person above.</p></div>
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setError(null); const r = await saveNerdSettings(f); if (!r.ok) { setError(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
