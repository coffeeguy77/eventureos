"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { FeedAccount, FeedRun } from "@/lib/bankfeed/redbark";
import type { XeroBank } from "@/lib/reconcile/xero";
import { runBankFeedNow, saveBankFeed } from "@/app/(app)/accounts/reconcile-actions";

const money = (n: number) => `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const KIND = { transfer: "Transfer", payment: "Invoice payment", payout: "Stripe payout", ordermentum: "Ordermentum" } as const;

/** The one Xero bank account whose number ends in these four digits (none if it's ambiguous). */
function guess(a: FeedAccount, banks: XeroBank[]) {
  if (!a.last4) return "";
  const hits = banks.filter((b) => (b.number ?? "").replace(/\D/g, "").endsWith(a.last4!));
  return hits.length === 1 ? hits[0].id : "";
}

/**
 * Bank feed (Redbark): which Xero account each bank account is, the start date, automatic sending, and what the last
 * run did. Runs by itself every morning; "Sync & send now" runs it on the spot.
 */
export function BankFeedPanel({ connected, accounts, banks, map, from, auto, lastRun, canSend }: {
  connected: boolean; accounts: FeedAccount[]; banks: XeroBank[]; map: Record<string, string>; from: string | null; auto: boolean; lastRun: FeedRun | null; canSend: boolean;
}) {
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, map[a.id] ?? guess(a, banks)])));
  const [start, setStart] = useState(from ?? "");
  const [on, setOn] = useState(auto);
  const [run, setRun] = useState<FeedRun | null>(lastRun);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, go] = useTransition();
  const savedOk = accounts.some((a) => map[a.id]) && !!from;
  const dirty = !!start !== !!from || start !== (from ?? "") || on !== auto || accounts.some((a) => (pick[a.id] ?? "") !== (map[a.id] ?? ""));

  if (!connected) {
    return (
      <Card className="p-5">
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><Landmark className="h-4 w-4 text-brand-600" />Bank feed</p>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">Skip the CSV: connect your bank in Redbark, add its API key in <Link href="/settings/integrations" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">Settings → Integrations → Bank feeds</Link>, and every morning your transactions are matched and sent to Xero by themselves.</p>
      </Card>
    );
  }

  const save = () => go(async () => {
    setMsg(null);
    if (!start) { setMsg({ ok: false, text: "Choose a start date — the day after your Xero bank accounts were last fully reconciled." }); return; }
    const r = await saveBankFeed({ accounts: pick, from: start, auto: on });
    setMsg(r.ok ? { ok: true, text: on ? "Saved. Every morning the feed is matched and sent to Xero — or press Sync & send now." : "Saved. Automatic sending is off — use Sync & send now, or load the feed into the tool below." } : { ok: false, text: r.error });
  });
  const now = () => go(async () => {
    setMsg(null);
    const r = await runBankFeedNow();
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRun(r.data);
    const n = r.data.sent.transfers + r.data.sent.payments + r.data.sent.payouts + r.data.sent.ordermentum;
    setMsg(r.data.ok ? { ok: true, text: n ? `${n} sent to Xero. In Xero → Bank accounts → Reconcile, each line now shows its match: click OK.` : "Up to date — nothing new to send." } : { ok: false, text: r.data.error ?? "The run didn't finish." });
  });

  const sent = run ? run.sent.transfers + run.sent.payments + run.sent.payouts + run.sent.ordermentum : 0;
  const check = run ? run.check.transfers + run.check.deposits + run.check.payouts + run.check.ordermentum : 0;
  const items = run?.items ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Bank feed" subtitle="Redbark reads your bank every morning; what's certain goes to Xero by itself — transfers between your accounts, deposits that name the customer or invoice, Stripe and Ordermentum payouts. Anything unsure waits for you." />

      {run && (
        <div className={cn("border-t border-line px-5 py-3 text-[0.8125rem]", run.ok ? "text-ink" : "text-rose-700 dark:text-rose-300")}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {run.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="font-semibold">Last run {when(run.at)}</span>
            {run.ok && <span className="text-ink-muted">· {run.lines.toLocaleString()} transactions read · {sent ? `${sent} sent to Xero` : "nothing new to send"}</span>}
          </p>
          {!run.ok && run.error && <p className="mt-1">{run.error}</p>}
          {run.ok && sent > 0 && (
            <p className="mt-1 text-ink-muted">{[[run.sent.transfers, "transfer"], [run.sent.payments, "invoice payment"], [run.sent.payouts, "Stripe payout"], [run.sent.ordermentum, "Ordermentum payout"]].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(" · ")}</p>
          )}
          {run.ok && check > 0 && (
            <p className="mt-1 text-amber-800 dark:text-amber-300">Waiting on you: {[[run.check.transfers, "transfer"], [run.check.deposits, "deposit"], [run.check.payouts, "Stripe payout"], [run.check.ordermentum, "Ordermentum payout"]].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(" · ")} — load the feed into the tool below to sort them.</p>
          )}
          {run.problems.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[0.75rem] text-rose-700 dark:text-rose-300">{run.problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}</ul>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t border-line">
          <ul className="divide-y divide-line">
            {(showAll ? items : items.slice(0, 6)).map((it, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2 text-[0.8125rem]">
                <span className="w-16 shrink-0 text-ink-muted">{fmt(it.date)}</span>
                <span className="min-w-0 flex-1 basis-48 truncate text-ink"><span className="text-ink-muted">{KIND[it.kind]} · </span>{it.text}</span>
                <span className="font-medium tabular-nums text-ink">{money(it.amount)}</span>
              </li>
            ))}
          </ul>
          {items.length > 6 && <button type="button" onClick={() => setShowAll(!showAll)} className="w-full px-5 py-2 text-left text-[0.75rem] font-semibold text-brand-700 hover:bg-canvas dark:text-brand-300">{showAll ? "Show fewer" : `Show all ${items.length}`}</button>}
        </div>
      )}

      <div className="space-y-3 border-t border-line px-5 py-4">
        {accounts.length === 0 && <p className="text-[0.8125rem] text-ink-muted">Redbark has no bank accounts yet. Connect your bank in the Redbark app, then press Sync &amp; send now to pick them up.</p>}
        {accounts.map((a) => (
          <div key={a.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="min-w-0 text-[0.875rem]">
              <span className="font-semibold text-ink">{a.name}{a.last4 ? ` ••${a.last4}` : ""}</span>
              <span className="block text-[0.75rem] text-ink-muted">{[a.institution, a.status && a.status !== "available" ? a.status : null].filter(Boolean).join(" · ") || "Bank account"}</span>
            </div>
            <Select aria-label={`Xero account for ${a.name}`} value={pick[a.id] ?? ""} onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}>
              <option value="">Leave out of the feed</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.number ? ` (${b.number})` : ""}</option>)}
            </Select>
          </div>
        ))}
        <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="text-[0.875rem]"><Label htmlFor="bf-from">Start from</Label><span className="block text-[0.75rem] text-ink-muted">The day after your Xero bank accounts were last fully reconciled. Nothing earlier is touched. Each run looks back 40 days.</span></div>
          <Input id="bf-from" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line-strong" checked={on} onChange={(e) => setOn(e.target.checked)} />
          <span><span className="font-medium">Send matches to Xero automatically every morning</span><span className="block text-[0.75rem] text-ink-muted">Only what's certain, and never anything Xero already has. Turn off to send by hand.</span></span>
        </label>
        {canSend ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || !dirty} variant={dirty ? "primary" : "secondary"}><Save className="h-4 w-4" />Save</Button>
            <Button onClick={now} disabled={pending || dirty || !savedOk}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync &amp; send now</Button>
            {dirty && <span className="self-center text-[0.75rem] text-ink-muted">Save first, then sync.</span>}
          </div>
        ) : <p className="text-[0.75rem] text-ink-muted">An owner or admin changes the bank feed.</p>}
        {pending && <p className="text-[0.75rem] text-ink-muted">Reading your bank and checking Xero — this can take a minute.</p>}
        {msg && <p className={cn("text-[0.8125rem]", msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{msg.text}</p>}
      </div>
    </Card>
  );
}
