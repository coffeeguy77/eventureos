"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Power, PowerOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { previewNotice, saveAccount, sendNoticeNow, suspendNow, unsuspendNow, type AccountInput } from "@/app/(app)/hosting/actions";

type Msg = { ok: boolean; text: string } | null;
const Status = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.8125rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</p> : null);

export function AccountDetails({ id, initial, clients, defaultRef }: { id: string; initial: AccountInput & { customer_name?: string | null }; clients: { id: string; name: string }[]; defaultRef: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [client, setClient] = useState(initial.customer_name ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<AccountInput>) => setF((o) => ({ ...o, ...p }));
  const save = () => start(async () => {
    setMsg(null);
    const name = client.trim();
    const c = name ? clients.find((x) => x.name.toLowerCase() === name.toLowerCase()) : null;
    if (name && !c) { setMsg({ ok: false, text: "Choose the client from the list (or clear it)." }); return; }
    const r = await saveAccount(id, { ...f, customer_id: c?.id ?? null });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const tick = (k: keyof AccountInput, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-[0.8125rem]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!f[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<AccountInput>)} /><span><span className="font-medium text-ink">{label}</span><span className="block text-[0.7188rem] text-ink-muted">{hint}</span></span></label>
  );
  return (
    <Card>
      <CardHeader title="Billing and contact" />
      <div className="space-y-3 border-t border-line px-5 py-4">
        <div>
          <Label htmlFor="ha-ref" hint="the invoice reference that ties an invoice to this account">Billing reference</Label>
          <Input id="ha-ref" value={f.billing_reference ?? ""} onChange={(e) => set({ billing_reference: e.target.value })} placeholder={defaultRef} />
          {f.billing_reference !== defaultRef && <button type="button" onClick={() => set({ billing_reference: defaultRef })} className="mt-1 text-[0.7188rem] text-brand-600 underline">Use {defaultRef}</button>}
        </div>
        <div>
          <Label htmlFor="ha-client" hint="optional">Client</Label>
          <Input id="ha-client" list="ha-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Start typing a client's name" />
          <datalist id="ha-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <p className="mt-1 text-[0.7188rem] text-ink-muted">If no invoice has the reference, the client's latest hosting invoice is shown instead — for you to check. Nothing automatic happens on a client match.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ha-ce" hint="notices go here first">Contact email</Label><Input id="ha-ce" type="email" value={f.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value })} /></div>
          <div><Label htmlFor="ha-cc" hint="optional, comma separated">CC</Label><Input id="ha-cc" value={f.cc_emails ?? ""} onChange={(e) => set({ cc_emails: e.target.value })} /></div>
        </div>
        <div className="grid gap-2 rounded-lg bg-canvas p-3 sm:grid-cols-2">
          {tick("vip", "VIP — never suspend", "Billing status is ignored")}
          {tick("disputed", "Disputed", "Paused while you sort it out")}
          {tick("manual_override", "Manual override", "You handle this one yourself")}
          {tick("auto_check", "Automatic checks", "Can be suspended automatically (if that's switched on)")}
          {tick("auto_unsuspend", "Automatic switch-back-on", "Unsuspend when the invoice is paid")}
          <div><Label htmlFor="ha-ext" hint="no suspension until">Payment extension</Label><Input id="ha-ext" type="date" value={f.extension_until ?? ""} onChange={(e) => set({ extension_until: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="ha-notes">Notes</Label><Textarea id="ha-notes" rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        <div className="flex items-center gap-3"><Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button><Status m={msg} /></div>
      </div>
    </Card>
  );
}

export function NoticeComposer({ id, templates }: { id: string; templates: { key: string; name: string }[] }) {
  const router = useRouter();
  const [key, setKey] = useState(templates[0]?.key ?? "overdue_notice");
  const [d, setD] = useState<{ to: string | null; cc: string[]; subject: string; message: string; payUrl: string | null; dryRun: boolean } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const load = (k = key) => start(async () => { setMsg(null); const r = await previewNotice(id, k); if (!r.ok) { setMsg({ ok: false, text: r.error }); setD(null); return; } setD(r.data); });
  const send = () => start(async () => { if (!d) return; setMsg(null); const r = await sendNoticeNow(id, key, d.subject, d.message); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) { setD(null); router.refresh(); } });
  return (
    <Card>
      <CardHeader title="Send a notice" subtitle="From your templates (Settings & notices). A sent overdue notice or warning starts the notice period before suspension." />
      <div className="space-y-3 border-t border-line px-5 py-4">
        <Select aria-label="Notice" value={key} onChange={(e) => { setKey(e.target.value); if (d) load(e.target.value); }}>{templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</Select>
        {!d ? <Button disabled={pending} onClick={() => load()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Write it</Button> : <>
          <p className="text-[0.75rem] text-ink-muted">To: {d.to ?? "no email address — add a contact email or link a client"}{d.cc.length ? ` · CC ${d.cc.join(", ")}` : ""}{!d.payUrl ? " · no online pay link (no matched invoice)" : ""}</p>
          <div><Label htmlFor="hn-s">Subject</Label><Input id="hn-s" value={d.subject} maxLength={200} onChange={(e) => setD({ ...d, subject: e.target.value })} /></div>
          <div><Label htmlFor="hn-m">Message</Label><Textarea id="hn-m" rows={9} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} /></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || !d.to} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{d.dryRun ? "Log it (dry run — not sent)" : "Send"}</Button>
            <Button variant="ghost" onClick={() => setD(null)}>Cancel</Button>
          </div>
        </>}
        <Status m={msg} />
      </div>
    </Card>
  );
}

export function SuspendControls({ id, suspended, byApp, kind, dryRun, domain }: { id: string; suspended: boolean; byApp: boolean; kind: string; dryRun: boolean; domain: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState("Overdue hosting invoice");
  const [category, setCategory] = useState<"billing_overdue" | "other">("billing_overdue");
  const [notify, setNotify] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setMsg(null);
    const r = suspended ? await unsuspendNow(id, notify) : await suspendNow(id, reason, category, notify);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); setAsk(false); router.refresh();
  });
  return (
    <Card>
      <CardHeader title={suspended ? "Suspended" : "Suspend"} subtitle={kind === "siteground" ? "SiteGround: the Web Culture status plugin shows a suspension page instead of the site." : "WHM: the cPanel account is suspended (website and email)."} />
      <div className="space-y-3 border-t border-line px-5 py-4">
        {suspended && !byApp && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900">This was suspended outside EventureOS (or the reason was changed), so it's never switched back on automatically.</p>}
        {!ask ? <Button variant={suspended ? "primary" : "danger"} onClick={() => setAsk(true)}>{suspended ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}{suspended ? "Switch back on…" : "Suspend…"}</Button> : <>
          {!suspended && <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="hs-r">Reason</Label><Input id="hs-r" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></div>
            <div><Label htmlFor="hs-c">Why</Label><Select id="hs-c" value={category} onChange={(e) => setCategory(e.target.value as "billing_overdue" | "other")}><option value="billing_overdue">Unpaid hosting (switch back on when paid)</option><option value="other">Something else (stays off until you switch it on)</option></Select></div>
          </div>}
          <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the customer the "{suspended ? "Back online" : "Suspended"}" notice</label>
          <p className="text-[0.75rem] text-ink-muted">{dryRun ? `Dry run is on: ${domain} won't really change — it's logged.` : `${suspended ? "Switch" : "Suspend"} ${domain} now?`}</p>
          <div className="flex gap-2"><Button variant="primary" disabled={pending} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{suspended ? "Yes, switch it back on" : "Yes, suspend"}</Button><Button variant="ghost" onClick={() => setAsk(false)}>Cancel</Button></div>
        </>}
        <Status m={msg} />
      </div>
    </Card>
  );
}
