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

/** "Pay in 4" on statements: customers split long-overdue invoices into 4 fortnightly payments themselves. */
export function PayIn4Form({ initial }: { initial: { enabled: boolean; days: number } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const { savePayIn4 } = await import("@/app/(app)/accounts/actions");
    const r = await savePayIn4(f.enabled, f.days);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok) router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Pay in 4 (customers set it up themselves)" subtitle="On their account statement, customers with invoices this overdue can split them into 4 equal payments, two weeks apart: the first straight away, the rest charged to their card automatically. It's mentioned in the statement email too." />
      <div className="flex flex-wrap items-end gap-4 border-t border-line px-5 py-4 text-[0.8125rem]">
        <label className="flex items-center gap-2 pb-2 font-medium"><input type="checkbox" className="h-4 w-4" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Offer Pay in 4</label>
        <div className="w-44"><Label htmlFor="p4-d">On invoices overdue by (days)</Label><Input id="p4-d" type="number" min={0} max={365} value={f.days} onChange={(e) => setF({ ...f, days: Math.round(Number(e.target.value) || 0) })} /></div>
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button>
        {msg && <p role="status" className={`pb-2 ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

/** Bank details shown on invoices so customers can pay by direct deposit, with the invoice number as the reference. */
export function DirectDepositForm({ initial }: { initial: { on: boolean; name: string; bsb: string; account: string } }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, bsb: initial.bsb ? `${initial.bsb.slice(0, 3)}-${initial.bsb.slice(3)}` : "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const { saveDirectDeposit } = await import("@/app/(app)/accounts/actions");
    const r = await saveDirectDeposit(f);
    setMsg(r.ok ? { ok: true, text: f.on ? "Saved — your bank details now show on invoices." : "Saved. Direct deposit details are hidden from invoices." } : { ok: false, text: r.error }); if (r.ok) router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Direct deposit" subtitle="Your bank details on every unpaid invoice — the pay page, invoice emails and the PDF — with the invoice number as the payment reference, so the bank feed can match the deposit to the invoice." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        <label className="flex items-center gap-2 font-medium text-ink"><input type="checkbox" className="h-4 w-4" checked={f.on} onChange={(e) => setF({ ...f, on: e.target.checked })} />Show direct deposit details on invoices</label>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
          <div><Label htmlFor="dd-name">Account name</Label><Input id="dd-name" value={f.name} maxLength={60} autoComplete="off" onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label htmlFor="dd-bsb">BSB</Label><Input id="dd-bsb" inputMode="numeric" value={f.bsb} maxLength={7} placeholder="000-000" autoComplete="off" onChange={(e) => setF({ ...f, bsb: e.target.value })} /></div>
          <div><Label htmlFor="dd-acc">Account number</Label><Input id="dd-acc" inputMode="numeric" value={f.account} maxLength={14} autoComplete="off" onChange={(e) => setF({ ...f, account: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button>
          {msg && <p role="status" className={msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{msg.text}</p>}
        </div>
      </div>
    </Card>
  );
}
