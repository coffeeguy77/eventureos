"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, FileText, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { planSchedule, type Frequency } from "@/lib/accounts/plan";
import { cancelPaymentPlan, sendStatement, startPaymentPlan, statementLink, takePlanCard } from "@/app/(app)/accounts/actions";

/** Email the customer their account statement (or copy its link) — every invoice owing, pay all or some. */
export function StatementPanel({ customerId, owing, lines }: { customerId: string; email?: string | null; owing: number; lines?: { number: string; amount: string; due: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ recipients: { email: string; label: string; primary: boolean }[]; subject: string; message: string; total: string } | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!owing) return null;
  const openDialog = () => start(async () => {
    setMsg(null);
    const { draftStatement } = await import("@/app/(app)/accounts/actions");
    const r = await draftStatement(customerId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setDraft(r.data); setTo(r.data.recipients.filter((x) => x.primary).map((x) => x.email)); setOpen(true);
  });
  const addExtra = () => {
    const e = extra.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || !draft) return;
    if (!draft.recipients.some((r) => r.email === e)) setDraft({ ...draft, recipients: [...draft.recipients, { email: e, label: "Added now", primary: false }] });
    setTo((t) => (t.includes(e) ? t : [...t, e])); setExtra("");
  };
  const send = () => start(async () => {
    if (!draft) return;
    const r = await sendStatement(customerId, { to, subject: draft.subject, message: draft.message });
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) { setOpen(false); router.refresh(); }
  });
  const copy = () => start(async () => { const r = await statementLink(customerId); if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } await navigator.clipboard.writeText(r.data).catch(() => undefined); setMsg({ ok: true, text: "Statement link copied — paste it into a text or email." }); });
  return (
    <Card>
      <CardHeader title="Account statement" subtitle="Everything they owe on one page: they open each invoice to see what it's for, and pay them all — or untick the ones they can't pay yet. Their account history is on it too. You'll see when they open it." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={pending} onClick={openDialog}>{pending && !open ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Email statement…</Button>
          <Button disabled={pending} onClick={copy}><Copy className="h-4 w-4" />Copy statement link</Button>
        </div>
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
      {open && draft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Email the account statement" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-3xl rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><p className="font-semibold text-ink">Email the account statement</p><button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink" aria-label="Close">✕</button></div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div className="space-y-3 text-[0.8125rem]">
                <div>
                  <Label>Send to</Label>
                  <ul className="mt-1 space-y-1">
                    {draft.recipients.map((r) => (
                      <li key={r.email}><label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ring-1 ring-inset ring-line hover:bg-zinc-50">
                        <input type="checkbox" className="h-4 w-4" checked={to.includes(r.email)} onChange={() => setTo((t) => (t.includes(r.email) ? t.filter((x) => x !== r.email) : [...t, r.email]))} />
                        <span className="min-w-0"><span className="block break-all font-medium text-ink">{r.email}</span><span className="block text-[0.75rem] text-ink-muted">{r.label}{r.primary ? " · main contact" : ""}</span></span>
                      </label></li>
                    ))}
                    {!draft.recipients.length && <li className="text-ink-muted">No email addresses on file — add one below.</li>}
                  </ul>
                  <div className="mt-2 flex gap-2"><Input type="email" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }} placeholder="Add another email address" aria-label="Add an email address" /><Button onClick={addExtra}>Add</Button></div>
                </div>
                <div><Label htmlFor="stm-s">Subject</Label><Input id="stm-s" value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>
                <div><Label htmlFor="stm-m" hint="from the Account statement template — change it in Accounts → Templates">Message</Label><Textarea id="stm-m" rows={10} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
                <div className="rounded-xl bg-zinc-100 p-3">
                  <div className="rounded-lg bg-white p-5 text-[0.8125rem] leading-relaxed text-zinc-700 ring-1 ring-zinc-200">
                    <p className="text-[1rem] font-semibold text-zinc-900">Your account statement</p>
                    {draft.message.split(/\n{2,}/).map((p, i) => <p key={i} className="mt-2 whitespace-pre-line">{p}</p>)}
                    {(lines ?? []).length > 0 && <ul className="mt-3 space-y-0.5">{(lines ?? []).map((l) => <li key={l.number}>Invoice {l.number} — {l.amount} ({l.due})</li>)}</ul>}
                    <p className="mt-2 font-semibold text-zinc-900">Total owing: {draft.total}</p>
                    <span className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white">View statement &amp; pay</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
              {msg && !msg.ok && <p role="alert" className="mr-auto text-[0.8125rem] font-medium text-rose-700">{msg.text}</p>}
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={pending || !to.length} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send to {to.length} {to.length === 1 ? "address" : "addresses"}</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type Inv = { id: string; number: string; balance: number; label: string; overdue: boolean };

/** Payment plan calculator: split what they owe into weekly or fortnightly payments from the card on file. */
export function PlanPanel({ customerId, invoices, card, currency, today, plan }: {
  customerId: string; invoices: Inv[]; card: string | null; currency: string; today: string;
  plan: { frequency: string; instalments: { n: number; due_date: string; amount: number; status: string; last_error: string | null }[] } | null;
}) {
  const router = useRouter();
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const [pick, setPick] = useState<string[]>(invoices.map((i) => i.id));
  const [freq, setFreq] = useState<Frequency>("weekly");
  const [mode, setMode] = useState<"count" | "amount">("count");
  const [count, setCount] = useState(6);
  const [amount, setAmount] = useState(100);
  const [start, setStart] = useState(today);
  const [emailIt, setEmailIt] = useState(true);
  const [firstNow, setFirstNow] = useState(true);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startT] = useTransition();
  const total = invoices.filter((i) => pick.includes(i.id)).reduce((a, i) => a + i.balance, 0);
  const schedule = useMemo(() => planSchedule(total, freq, start, mode === "count" ? { count } : { amount }), [total, freq, start, mode, count, amount]);
  const takeCard = () => startT(async () => {
    setMsg(null); setCardUrl(null);
    const r = await takePlanCard(customerId, pick, freq, firstNow ? today : start, mode === "count" ? { count } : { amount }, firstNow);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setCardUrl(r.data);
    setMsg({ ok: true, text: firstNow ? `Ready: open Stripe's page and type their card — it takes the first payment of ${fmt(schedule[0]?.amount ?? 0)} now and keeps the card for the rest. The plan appears here once it goes through.` : `Ready: open Stripe's page and type their card — it saves the card only. The first payment is taken on ${start}. The plan appears here once the card is saved.` });
  });
  const go = () => startT(async () => {
    setMsg(null);
    const r = await startPaymentPlan(customerId, pick, freq, start, mode === "count" ? { count } : { amount }, emailIt);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const cancel = () => { if (!window.confirm("Cancel the payment plan? No more payments will be taken.")) return; startT(async () => { const r = await cancelPaymentPlan(customerId); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); }); };
  if (plan) {
    const paid = plan.instalments.filter((x) => x.status === "paid").reduce((a, x) => a + Number(x.amount), 0);
    const left = plan.instalments.filter((x) => x.status !== "paid" && x.status !== "skipped").reduce((a, x) => a + Number(x.amount), 0);
    return (
      <Card>
        <CardHeader title={`Payment plan · ${plan.frequency}`} subtitle={`${fmt(paid)} paid · ${fmt(left)} to go`} action={<Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel plan</Button>} />
        <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
          {plan.instalments.map((x) => (
            <li key={x.n} className="flex flex-wrap justify-between gap-2 px-5 py-2">
              <span>{x.n}. {x.due_date}</span>
              <span className={x.status === "paid" ? "text-emerald-700" : x.status === "failed" ? "font-medium text-rose-700" : "text-ink-muted"}>{fmt(Number(x.amount))} · {x.status === "scheduled" ? "to come" : x.status}{x.last_error && x.status === "failed" ? ` — ${x.last_error}` : ""}</span>
            </li>
          ))}
        </ul>
        {msg && <p role="status" className={`px-5 pb-3 text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </Card>
    );
  }
  if (!invoices.length) return null;
  return (
    <Card>
      <CardHeader title="Payment plan" subtitle="Split what they owe into weekly or fortnightly payments, charged to their card on file on each day." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        <ul className="space-y-0.5">
          {invoices.map((i) => (
            <li key={i.id}><label className="flex items-center gap-2 py-0.5"><input type="checkbox" className="h-4 w-4" checked={pick.includes(i.id)} onChange={() => setPick((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))} />
              <span className="font-medium">{i.number}</span><span className={i.overdue ? "text-rose-700" : "text-ink-muted"}>{i.label}</span><span className="ml-auto tabular-nums">{fmt(i.balance)}</span></label></li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-line pt-2 font-semibold"><span>To pay off</span><span className="tabular-nums">{fmt(total)}</span></p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="pl-f">How often</Label><Select id="pl-f" value={freq} onChange={(e) => setFreq(e.target.value === "fortnightly" ? "fortnightly" : "weekly")}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option></Select></div>
          <div><Label htmlFor="pl-m">Work out by</Label><Select id="pl-m" value={mode} onChange={(e) => setMode(e.target.value === "amount" ? "amount" : "count")}><option value="count">Number of payments</option><option value="amount">Amount each time</option></Select></div>
          {mode === "count"
            ? <div><Label htmlFor="pl-c">Payments</Label><Input id="pl-c" type="number" min={1} max={104} value={count} onChange={(e) => setCount(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></div>
            : <div><Label htmlFor="pl-a">Each payment ($)</Label><Input id="pl-a" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div>}
        </div>
        <div className="max-w-[12rem]"><Label htmlFor="pl-s">First payment</Label><Input id="pl-s" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        {schedule.length > 0 && (
          <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line">
            <p className="font-semibold text-ink"><CalendarClock className="mr-1 inline h-4 w-4" />{schedule.length} {freq} payment{schedule.length === 1 ? "" : "s"} of {fmt(schedule[0].amount)}{schedule.at(-1)!.amount !== schedule[0].amount ? ` (last ${fmt(schedule.at(-1)!.amount)})` : ""} · finished {schedule.at(-1)!.date}</p>
            <p className="mt-1 text-[0.75rem] text-ink-muted">{schedule.slice(0, 8).map((x) => `${x.date.slice(5)} ${fmt(x.amount)}`).join(" · ")}{schedule.length > 8 ? " · …" : ""}</p>
          </div>
        )}
        <div className="rounded-lg p-3 ring-1 ring-inset ring-line">
          <p className="font-semibold text-ink">Take their card now (over the phone)</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex items-center gap-2"><input type="radio" name={`pl-first-${customerId}`} className="h-4 w-4" checked={firstNow} onChange={() => { setFirstNow(true); setStart(today); }} />First payment now</label>
            <label className="flex items-center gap-2"><input type="radio" name={`pl-first-${customerId}`} className="h-4 w-4" checked={!firstNow} onChange={() => setFirstNow(false)} />First payment on the date above (e.g. their payday)</label>
          </div>
          <Button className="mt-3" variant={card ? "secondary" : "primary"} disabled={pending || !pick.length || !schedule.length || (!firstNow && start <= today)} onClick={takeCard}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{firstNow ? `Take ${fmt(schedule[0]?.amount ?? 0)} now & start the plan` : `Save their card & start on ${start}`}</Button>
          {!firstNow && start <= today && <p className="mt-1 text-[0.75rem] text-amber-800">Choose a first payment date after today, or take the first payment now.</p>}
          {cardUrl && <a href={cardUrl} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setCardUrl(null), 500)} className="mt-2 inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700">Open Stripe&apos;s card page →</a>}
        </div>
        {card && (
          <div className="rounded-lg p-3 ring-1 ring-inset ring-line">
            <p className="font-semibold text-ink">Or use the card on file ({card})</p>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={emailIt} onChange={(e) => setEmailIt(e.target.checked)} />Email them the schedule (with their statement)</label>
            <Button className="mt-2" variant="primary" disabled={pending || !pick.length || !schedule.length} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Start the plan on the {card}</Button>
          </div>
        )}
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
