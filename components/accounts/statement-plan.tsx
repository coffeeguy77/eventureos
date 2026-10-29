"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, FileText, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { planSchedule, type Frequency } from "@/lib/accounts/plan";
import { cancelPaymentPlan, sendStatement, startPaymentPlan, statementLink } from "@/app/(app)/accounts/actions";

/** Email the customer their account statement (or copy its link) — every invoice owing, pay all or some. */
export function StatementPanel({ customerId, email, owing }: { customerId: string; email: string | null; owing: number }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!owing) return null;
  const send = () => start(async () => { const r = await sendStatement(customerId, message); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) { setOpen(false); router.refresh(); } });
  const copy = () => start(async () => { const r = await statementLink(customerId); if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } await navigator.clipboard.writeText(r.data).catch(() => undefined); setMsg({ ok: true, text: "Statement link copied — paste it into a text or email." }); });
  return (
    <Card>
      <CardHeader title="Account statement" subtitle={`Everything they owe on one page: they open each invoice, and pay them all — or untick the ones they can't pay yet. Their account history is on it too. You'll see when they open it.`} />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {open && <div><Label htmlFor="st-msg" hint="optional — a friendly default is used">Message</Label><Textarea id="st-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi Sam, here's your statement…" /></div>}
        <div className="flex flex-wrap gap-2">
          {open ? <Button variant="primary" disabled={pending || !email} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send to {email ?? "—"}</Button>
            : <Button variant="primary" disabled={!email} onClick={() => setOpen(true)}><FileText className="h-4 w-4" />Email statement</Button>}
          <Button disabled={pending} onClick={copy}><Copy className="h-4 w-4" />Copy statement link</Button>
          {open && <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
        </div>
        {!email && <p className="text-ink-muted">No email address on file — copy the link and text it instead.</p>}
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startT] = useTransition();
  const total = invoices.filter((i) => pick.includes(i.id)).reduce((a, i) => a + i.balance, 0);
  const schedule = useMemo(() => planSchedule(total, freq, start, mode === "count" ? { count } : { amount }), [total, freq, start, mode, count, amount]);
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
        {!card && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-100">Needs a card on file — take a payment over the phone with &ldquo;Keep the card on file&rdquo; ticked (it can be a small first payment). You can still work out the numbers here.</p>}
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
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={emailIt} onChange={(e) => setEmailIt(e.target.checked)} />Email them the schedule (with their statement)</label>
        <Button variant="primary" disabled={pending || !card || !pick.length || !schedule.length} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Start the plan{card ? ` on the ${card}` : ""}</Button>
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
