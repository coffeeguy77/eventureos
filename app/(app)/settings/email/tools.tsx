"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Circle, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import type { EmailDomain } from "@/lib/email/domains";
import { checkDomain, createForwarding, newAddress, removeDomain, saveReplyTo, setForwarding, startDomain, updateSender } from "./actions";

type Msg = { ok: boolean; text: string } | null;
const Status = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.8125rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</p> : null);

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => undefined); }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand-600 hover:bg-brand-50" aria-label="Copy">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : "Copy"}
    </button>
  );
}

export function ForwardingTools({ address, on }: { address: string | null; on: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: (r as { error: string }).error }); if (r.ok) router.refresh(); });
  if (!address) return (
    <div className="space-y-2">
      <Button variant="primary" disabled={pending} onClick={() => run(createForwarding, "Your forwarding address is ready.")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create my forwarding address</Button>
      <Status m={msg} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ink px-4 py-3 text-surface">
        <span className="min-w-0 flex-1 break-all font-mono text-[0.9375rem]">{address}</span>
        <CopyText text={address} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[0.8125rem]">
        <Badge tone={on ? "green" : "neutral"}>{on ? "Receiving" : "Switched off"}</Badge>
        <Button size="sm" disabled={pending} onClick={() => run(() => setForwarding(!on), on ? "Switched off — forwarded mail is ignored." : "Switched on.")}>{on ? "Switch off" : "Switch on"}</Button>
        {sure ? (
          <span className="flex items-center gap-2"><span className="text-ink-muted">The old address stops working.</span>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => { setSure(false); run(newAddress, "New address made — update your forwarding to it."); }}>Make a new address</Button>
            <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button></span>
        ) : <button type="button" onClick={() => setSure(true)} className="text-[0.75rem] text-ink-faint hover:text-ink">Getting junk? Make a new address</button>}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
      </div>
      <Status m={msg} />
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { verified: "Verified", pending: "Checking…", not_started: "Waiting for DNS records", partially_verified: "Partly verified", failed: "Records not found", temporary_failure: "Couldn't check — will retry" };

export function DomainSetup({ domain, businessName, tz }: { domain: EmailDomain | null; businessName: string; tz: string }) {
  const router = useRouter();
  const [f, setF] = useState({ domain: domain?.domain ?? "", from_local: domain?.from_local ?? "hello", from_name: domain?.from_name ?? "", use: domain?.use ?? true });
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  if (!domain) return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div><Label htmlFor="ed-domain">Your domain</Label><Input id="ed-domain" placeholder="e.g. webculture.au" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} /></div>
        <div><Label htmlFor="ed-local" hint="before the @">Send as</Label><Input id="ed-local" value={f.from_local} onChange={(e) => setF({ ...f, from_local: e.target.value })} /></div>
      </div>
      <div><Label htmlFor="ed-name" hint="optional">Display name</Label><Input id="ed-name" placeholder={businessName} value={f.from_name} onChange={(e) => setF({ ...f, from_name: e.target.value })} /></div>
      <p className="text-[0.75rem] text-ink-muted">Emails will come from <strong className="text-ink">{f.from_name || businessName} &lt;{f.from_local || "hello"}@{f.domain || "yourdomain.com.au"}&gt;</strong>. Your existing mailbox and website keep working — the records only add permission for EventureOS to send.</p>
      <FormError message={err} />
      <Button variant="primary" disabled={pending || !f.domain.trim()} onClick={() => start(async () => { setErr(null); const r = await startDomain(f); if (!r.ok) setErr(r.error); else router.refresh(); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Get my DNS records</Button>
    </div>
  );

  const verified = domain.status === "verified";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[0.9375rem] font-semibold text-ink">{domain.domain}</span>
        <Badge tone={verified ? "green" : domain.status === "failed" ? "red" : "amber"}>{STATUS_LABEL[domain.status] ?? domain.status}</Badge>
        {domain.checked_at && <span className="text-[0.75rem] text-ink-faint">checked {fmtDateTime(domain.checked_at, tz)}</span>}
        {!verified && <Button size="sm" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await checkDomain(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Check now</Button>}
      </div>
      <Status m={msg} />
      {domain.error && <p className="text-[0.75rem] text-rose-700">{domain.error}</p>}
      {!verified && <p className="text-[0.8125rem] text-ink-muted">Add these records where your domain's DNS is managed (your registrar, Cloudflare, cPanel Zone Editor, Vercel…). Use the <strong>Name</strong> exactly as shown — most DNS panels add your domain on the end automatically. We check every 15 minutes too, and let you know when it's verified.</p>}
      <div className="overflow-x-auto rounded-lg ring-1 ring-line">
        <table className="w-full text-[0.8125rem]">
          <thead><tr className="bg-canvas text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-3 py-2 font-medium" /><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Value</th><th className="px-3 py-2 font-medium">Priority</th></tr></thead>
          <tbody className="divide-y divide-line">
            {domain.records.map((r, k) => (
              <tr key={k} className="align-top">
                <td className="px-3 py-2">{r.status === "verified" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Found" /> : <Circle className="h-4 w-4 text-ink-faint" aria-label="Not found yet" />}</td>
                <td className="px-3 py-2 font-mono">{r.type}</td>
                <td className="px-3 py-2"><span className="flex items-start gap-1 font-mono break-all">{r.name}<CopyText text={r.name} /></span></td>
                <td className="max-w-[420px] px-3 py-2"><span className="flex items-start gap-1 font-mono text-[0.75rem] break-all">{r.value}<CopyText text={r.value} /></span></td>
                <td className="px-3 py-2 font-mono">{r.priority ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 rounded-lg bg-canvas p-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div><Label htmlFor="ed-l2" hint="before the @">Send as</Label><Input id="ed-l2" value={f.from_local} onChange={(e) => setF({ ...f, from_local: e.target.value })} /></div>
        <div><Label htmlFor="ed-n2" hint="optional">Display name</Label><Input id="ed-n2" placeholder={businessName} value={f.from_name} onChange={(e) => setF({ ...f, from_name: e.target.value })} /></div>
        <Button disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await updateSender(f); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); router.refresh(); })}>Save</Button>
        <label className="flex items-center gap-2 text-[0.8125rem] sm:col-span-3"><input type="checkbox" className="h-4 w-4" checked={f.use} onChange={(e) => setF({ ...f, use: e.target.checked })} />Send from this address once it's verified (untick to go back to the EventureOS address)</label>
      </div>
      {sure ? (
        <div className="flex items-center gap-2 text-[0.8125rem]"><span className="text-ink-muted">Stop using {domain.domain}? You can add it again later.</span>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => { await removeDomain(); setSure(false); router.refresh(); })}><Trash2 className="h-4 w-4" />Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button></div>
      ) : <button type="button" onClick={() => setSure(true)} className="text-[0.75rem] text-ink-faint hover:text-rose-700">Remove this domain</button>}
    </div>
  );
}

export function ReplyToForm({ initial, fallback }: { initial: string; fallback: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[260px] flex-1"><Label htmlFor="rt" hint={fallback ? `blank = ${fallback}` : undefined}>Reply-to address</Label><Input id="rt" type="email" value={v} onChange={(e) => setV(e.target.value)} placeholder={fallback ?? "you@yourbusiness.com.au"} /></div>
      <Button disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await saveReplyTo(v); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
      <Status m={msg} />
    </div>
  );
}
