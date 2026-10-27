"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import type { HostingSettings } from "@/lib/hosting/core";
import { saveHostingSettings } from "@/app/(app)/hosting/actions";

export function HostingSettingsForm({ initial, orgName }: { initial: HostingSettings; orgName: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [codes, setCodes] = useState({ a: initial.acceptedCodes.join(", "), p: initial.acceptedPrefixes.join(", "), b: initial.backupCodes.join(", ") });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<HostingSettings>) => setS((o) => ({ ...o, ...p }));
  const list = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const save = () => start(async () => {
    setMsg(null);
    const r = await saveHostingSettings({ ...s, acceptedCodes: list(codes.a), acceptedPrefixes: list(codes.p), backupCodes: list(codes.b) });
    setMsg(r.ok ? { ok: true, text: "Saved — every account has been rechecked." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const tick = (k: "dryRun" | "autoSuspend" | "autoUnsuspend" | "backupEnabled", label: string, hint: string) => (
    <label className="flex items-start gap-2 text-[0.8125rem]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={s[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<HostingSettings>)} /><span><span className="font-medium text-ink">{label}</span><span className="block text-[0.75rem] text-ink-muted">{hint}</span></span></label>
  );
  const num = (k: "outsideTermsAfterDays" | "dueSoonDays" | "minimumNoticeDaysBeforeSuspend" | "autoSuspendAfterDays", label: string) => (
    <div><Label htmlFor={`hs-${k}`}>{label}</Label><Input id={`hs-${k}`} type="number" min={0} value={s[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<HostingSettings>)} /></div>
  );
  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader title="Safety" />
        <div className="space-y-3 border-t border-line px-5 py-4">
          {tick("dryRun", "Dry run", "Nothing is suspended, unsuspended or emailed — it's logged as what would happen. Leave on until the matches look right.")}
          {tick("autoUnsuspend", "Switch accounts back on automatically when paid", "Only accounts EventureOS suspended for billing, with an exact reference match and the invoice fully paid (checked live on WHM first).")}
          {tick("autoSuspend", "Suspend automatically", "Only with an exact reference match, after a sent notice and the notice period, once overdue long enough. Off = you press Suspend yourself.")}
        </div>
      </Card>
      <Card>
        <CardHeader title="Payment terms" />
        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
          {num("outsideTermsAfterDays", "Outside terms after (days past due)")}
          {num("dueSoonDays", "\"Due soon\" from (days before due)")}
          {num("minimumNoticeDaysBeforeSuspend", "Notice period before suspension (days)")}
          {num("autoSuspendAfterDays", "Automatic suspend after (days overdue)")}
        </div>
      </Card>
      <Card>
        <CardHeader title="Which invoice lines are hosting" subtitle="Xero item codes. An invoice whose reference matches but has none of these is flagged for review." />
        <div className="space-y-3 border-t border-line px-5 py-4">
          <div><Label htmlFor="hs-ac">Hosting item codes</Label><Input id="hs-ac" value={codes.a} onChange={(e) => setCodes({ ...codes, a: e.target.value })} /></div>
          <div><Label htmlFor="hs-ap">Codes starting with</Label><Input id="hs-ap" value={codes.p} onChange={(e) => setCodes({ ...codes, p: e.target.value })} /></div>
          <div><Label htmlFor="hs-bc">Backup codes</Label><Input id="hs-bc" value={codes.b} onChange={(e) => setCodes({ ...codes, b: e.target.value })} /></div>
          {tick("backupEnabled", "Count backup codes as hosting", "Off by default (as in Host Manager).")}
        </div>
      </Card>
      <Card>
        <CardHeader title="Name and emails" />
        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-3">
          <div><Label htmlFor="hs-ml" hint="in the menu">Menu name</Label><Input id="hs-ml" value={s.menuLabel} maxLength={30} onChange={(e) => set({ menuLabel: e.target.value })} placeholder="Hosting" /></div>
          <div><Label htmlFor="hs-br" hint="notices are from">Brand</Label><Input id="hs-br" value={s.brand ?? ""} maxLength={80} onChange={(e) => set({ brand: e.target.value })} placeholder={orgName} /></div>
          <div><Label htmlFor="hs-rt" hint="replies go to">Reply-to email</Label><Input id="hs-rt" type="email" value={s.replyTo ?? ""} onChange={(e) => set({ replyTo: e.target.value })} /></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Notices" subtitle="Words you can use: {domain} {contact_name} {invoice} {amount} {due_date} {days_overdue} {pay_link} {brand} {reply_to}" />
        <div className="space-y-5 border-t border-line px-5 py-4">
          {s.templates.map((t, k) => (
            <div key={t.key} className="space-y-2">
              <p className="text-[0.8125rem] font-semibold text-ink">{t.name}</p>
              <Input aria-label={`${t.name} subject`} value={t.subject} maxLength={200} onChange={(e) => set({ templates: s.templates.map((x, j) => (j === k ? { ...x, subject: e.target.value } : x)) })} />
              <Textarea aria-label={`${t.name} message`} rows={6} value={t.message} onChange={(e) => set({ templates: s.templates.map((x, j) => (j === k ? { ...x, message: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Suspension page (SiteGround plugin)" />
        <div className="space-y-3 border-t border-line px-5 py-4">
          <div><Label htmlFor="hs-st">Heading</Label><Input id="hs-st" value={s.suspendTitle} maxLength={120} onChange={(e) => set({ suspendTitle: e.target.value })} /></div>
          <div><Label htmlFor="hs-sm">Message</Label><Textarea id="hs-sm" rows={3} value={s.suspendMessage} maxLength={1000} onChange={(e) => set({ suspendMessage: e.target.value })} /></div>
        </div>
      </Card>
      <div className="flex items-center gap-3"><Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>{msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}</div>
    </div>
  );
}
