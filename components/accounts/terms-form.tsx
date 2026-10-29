"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { saveFeeSettings, saveTerms } from "@/app/(app)/accounts/actions";
import type { FeeSettings } from "@/lib/accounts/core";

type Fees = Omit<FeeSettings, "overrides">;

export function FeesForm({ initial, customRates }: { initial: Fees; customRates: number }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveFeeSettings(f);
    setMsg(r.ok ? { ok: true, text: f.enabled ? `Saved — ${f.percent}% a month after ${f.grace_days} days overdue.` : "Saved. Account-keeping fees are off." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Account-keeping fee on overdue invoices" subtitle="A percentage of what's still owing, for each month (or part month) an invoice stays unpaid after a grace period. Raised on a separate draft invoice from the customer's account page, so you always check it before it goes." />
      <div className="space-y-4 border-t border-line px-5 py-4 text-[0.8125rem]">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Charge account-keeping fees</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="fee-p" hint="of the amount still owing">% a month</Label><Input id="fee-p" type="number" min={0} max={20} step={0.1} inputMode="decimal" value={f.percent} onChange={(e) => setF({ ...f, percent: Number(e.target.value) })} /></div>
          <div><Label htmlFor="fee-g" hint="after the due date">Grace period (days)</Label><Input id="fee-g" type="number" min={0} max={365} step={1} inputMode="numeric" value={f.grace_days} onChange={(e) => setF({ ...f, grace_days: Math.round(Number(e.target.value) || 0) })} /></div>
          <div><Label htmlFor="fee-a" hint="blank = your usual sales account">Xero account code</Label><Input id="fee-a" value={f.account_code ?? ""} maxLength={20} onChange={(e) => setF({ ...f, account_code: e.target.value.trim() || null })} /></div>
        </div>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.gst} onChange={(e) => setF({ ...f, gst: e.target.checked })} /><span>Charge GST on the fee <span className="block text-[0.75rem] text-ink-faint">Off by default — check the GST treatment of account-keeping fees with your accountant.</span></span></label>
        <p className="text-[0.75rem] text-ink-muted">Example: {f.percent}% on $1,000 overdue is ${(10 * f.percent).toFixed(2)} for each month after the first {f.grace_days} days.{customRates ? ` ${customRates} customer${customRates === 1 ? " has" : "s have"} their own rate (set on their account page).` : " You can give a customer their own rate, or 0, on their account page."}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save fee settings</Button>
          {msg && <p role="status" className={msg.ok ? "text-emerald-700" : "text-rose-700"}>{msg.text}</p>}
        </div>
      </div>
    </Card>
  );
}

export function TermsForm({ initial, standard, preview, publicUrl }: { initial: string; standard: string; preview: string; publicUrl: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial || standard);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveTerms(text);
    setMsg(r.ok ? { ok: true, text: "Saved — your terms are published at the link above." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Terms and conditions of trade" subtitle="Published on your customer pages and linked from every invoice's pay page. Words in {braces} fill themselves in: {business}, {payment_terms}, {fee_percent}, {grace_days}, {email}, {phone_line}." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        <div className="flex flex-wrap items-center gap-3">
          <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">{initial ? "View the published terms" : "Not published yet — save to publish"}<ExternalLink className="h-3.5 w-3.5" /></a>
          {text !== standard && <button type="button" onClick={() => { if (window.confirm("Replace your wording with the standard terms?")) setText(standard); }} className="inline-flex items-center gap-1 text-ink-muted hover:text-ink"><RotateCcw className="h-3.5 w-3.5" />Start again from the standard terms</button>}
        </div>
        <Textarea rows={22} value={text} onChange={(e) => setText(e.target.value)} aria-label="Terms and conditions" className="font-mono text-[0.75rem] leading-relaxed" />
        <p className="text-[0.75rem] text-ink-faint"># makes a heading, ## a section heading. Have your lawyer or accountant check the wording before relying on it.</p>
        <details className="rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-line"><summary className="cursor-pointer font-medium">Preview with your details filled in (as last saved)</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-[0.8125rem] text-ink">{preview}</pre></details>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save and publish terms</Button>
          {msg && <p role="status" className={msg.ok ? "text-emerald-700" : "text-rose-700"}>{msg.text}</p>}
        </div>
      </div>
    </Card>
  );
}

/** Owners and admins: fix phone numbers that came from Xero joined together or several to a box. */
export function TidyPhones() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    const { tidyAllPhones } = await import("@/app/(app)/accounts/actions");
    const r = await tidyAllPhones();
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Tidy phone numbers" subtitle={'Fixes numbers that came from Xero joined together (e.g. "+0476 804 0476804565" becomes "0476 804 565") and boxes holding two numbers ("Phone: … Mobile: …"). Numbers it can’t read are left alone.'} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        <Button disabled={pending} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Tidy every client&apos;s numbers</Button>
        {msg && <p role="status" className={msg.ok ? "text-emerald-700" : "text-rose-700"}>{msg.text}</p>}
      </div>
    </Card>
  );
}
