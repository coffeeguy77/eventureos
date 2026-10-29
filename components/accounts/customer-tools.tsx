"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { addCollectionNote, cancelPromiseReminder, completeStep, draftChase, sendChaseEmail, type NoteInput } from "@/app/(app)/accounts/actions";

type Inv = { id: string; number: string; balance: string; due: string };

/** Email a customer about an invoice: pick a template, check the words (filled in), send. The pay link is included. */
export function ChaseComposer({ invoices, templates }: { invoices: Inv[]; templates: { key: string; name: string }[] }) {
  const router = useRouter();
  const [inv, setInv] = useState(invoices[0]?.id ?? "");
  const [tpl, setTpl] = useState(templates[0]?.key ?? "friendly");
  const [draft, setDraft] = useState<{ to: string[]; subject: string; message: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = (i = inv, k = tpl) => start(async () => {
    setMsg(null);
    const r = await draftChase(i, k);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); setDraft(null); return; }
    setDraft(r.data);
  });
  const send = () => start(async () => {
    if (!draft) return;
    setMsg(null);
    const r = await sendChaseEmail(inv, tpl, draft.subject, draft.message);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: r.data }); setDraft(null); router.refresh();
  });
  if (!invoices.length) return null;
  return (
    <Card>
      <CardHeader title="Email about an invoice" subtitle="The invoice and its pay link go with it. You'll see if it's opened and if they click to pay." />
      <div className="space-y-3 border-t border-line px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ch-inv">Invoice</Label><Select id="ch-inv" value={inv} onChange={(e) => { setInv(e.target.value); setDraft(null); }}>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.balance} · {i.due}</option>)}</Select></div>
          <div><Label htmlFor="ch-tpl">Template</Label><Select id="ch-tpl" value={tpl} onChange={(e) => { setTpl(e.target.value); load(inv, e.target.value); }}>{templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</Select></div>
        </div>
        {!draft ? <Button disabled={pending || !inv} onClick={() => load()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Write the email</Button> : (
          <>
            <p className="text-[0.75rem] text-ink-muted">To: {draft.to.join(", ") || "no email address on file"}</p>
            <div><Label htmlFor="ch-sub">Subject</Label><Input id="ch-sub" value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>
            <div><Label htmlFor="ch-msg">Message</Label><Textarea id="ch-msg" rows={8} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={pending || !draft.to.length} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </>
        )}
        {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

const KINDS: { key: NoteInput["kind"]; label: string }[] = [
  { key: "call", label: "Phone call" }, { key: "note", label: "Note" }, { key: "promise", label: "Promise to pay" },
  { key: "plan", label: "Payment plan" }, { key: "dispute", label: "Dispute" }, { key: "sms", label: "Text message" }, { key: "email", label: "Email (sent elsewhere)" },
];

/** Log what happened (a call, a promise to pay, a dispute…) and set the next step. */
export function LogForm({ customerId, invoices, today, card }: { customerId: string; invoices: Inv[]; today: string; /** the card on file, e.g. "Visa ending 4242" */ card?: string | null }) {
  const router = useRouter();
  const [f, setF] = useState<NoteInput>({ kind: "call", body: "", invoiceId: invoices[0]?.id ?? null, promiseDate: "", promiseAmount: "", remind: true, nextStep: "", nextStepDue: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<NoteInput>) => setF((o) => ({ ...o, ...p }));
  const save = () => start(async () => {
    setMsg(null);
    const r = await addCollectionNote(customerId, f);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: f.kind === "promise" && f.chargeCard ? `Saved. Their ${card} will be charged on the morning of ${f.promiseDate}.` : f.kind === "promise" && f.remind ? `Saved. The invoice will be emailed with a pay link on the morning of ${f.promiseDate}.` : "Saved." });
    setF({ ...f, body: "", promiseDate: "", promiseAmount: "", nextStep: "", nextStepDue: "" }); router.refresh();
  });
  return (
    <Card>
      <CardHeader title="Log a conversation" subtitle="Calls, promises, disputes — and what happens next." />
      <div className="space-y-3 border-t border-line px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => <button key={k.key} type="button" onClick={() => set({ kind: k.key })} className={`rounded-full px-3 py-1 text-[0.7812rem] font-medium ${f.kind === k.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink"}`}>{k.label}</button>)}
        </div>
        <Textarea aria-label="What happened" rows={3} value={f.body ?? ""} onChange={(e) => set({ body: e.target.value })} placeholder={f.kind === "call" ? "e.g. Spoke to Sarah in accounts — invoice is with the manager for approval" : f.kind === "dispute" ? "What they're disputing" : "What happened"} />
        {invoices.length > 1 && <div><Label htmlFor="lg-inv" hint="optional">About invoice</Label><Select id="lg-inv" value={f.invoiceId ?? ""} onChange={(e) => set({ invoiceId: e.target.value || null })}><option value="">All of them</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.balance}</option>)}</Select></div>}
        {f.kind === "promise" && (
          <div className="grid gap-3 rounded-lg bg-emerald-50/60 p-3 sm:grid-cols-2">
            <div><Label htmlFor="lg-pd">They'll pay on</Label><Input id="lg-pd" type="date" min={today} value={f.promiseDate ?? ""} onChange={(e) => set({ promiseDate: e.target.value })} /></div>
            <div><Label htmlFor="lg-pa" hint="optional">Amount</Label><Input id="lg-pa" type="number" min={0} step="0.01" value={f.promiseAmount ?? ""} onChange={(e) => set({ promiseAmount: e.target.value })} /></div>
            {card && <label className="flex items-start gap-2 text-[0.8125rem] font-medium text-ink sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!f.chargeCard} onChange={(e) => set({ chargeCard: e.target.checked, remind: e.target.checked ? true : f.remind })} />Charge their {card} that morning (they agreed) — if it&apos;s declined, the invoice is emailed with a pay link instead</label>}
            {!f.chargeCard && <label className="flex items-start gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.remind !== false} onChange={(e) => set({ remind: e.target.checked })} />Email them the invoice with a pay link on that morning, as a reminder of what they agreed</label>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <div><Label htmlFor="lg-ns" hint="optional">Next step</Label><Input id="lg-ns" value={f.nextStep ?? ""} maxLength={300} onChange={(e) => set({ nextStep: e.target.value })} placeholder="e.g. Call back if not paid by Friday" /></div>
          <div><Label htmlFor="lg-nd">By</Label><Input id="lg-nd" type="date" value={f.nextStepDue ?? ""} onChange={(e) => set({ nextStepDue: e.target.value })} /></div>
        </div>
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

export function StepDone({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await completeStep(id); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Done</Button>;
}

export function CancelReminder({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(async () => { await cancelPromiseReminder(id); router.refresh(); })} className="text-[0.75rem] font-medium text-ink-muted underline hover:text-ink">Don&apos;t send</button>;
}

/** Flag an invoice (or the whole account) for a decision in the resolution centre. */
export function FlagForm({ customerId, invoices }: { customerId: string; invoices: Inv[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState(invoices[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    const { flagInvoice } = await import("@/app/(app)/accounts/actions");
    const r = await flagInvoice(customerId, inv || null, reason);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Flagged — it's in the resolution centre for a decision, and off the Call next list until then." });
    setReason(""); setOpen(false); router.refresh();
  });
  return (
    <Card className="p-4">
      <p className="font-semibold text-ink">Needs a decision?</p>
      <p className="mt-0.5 text-[0.75rem] text-ink-muted">Flag an invoice to decide whether to write it off, investigate, or keep chasing.</p>
      {!open ? <Button className="mt-3" size="sm" onClick={() => { setOpen(true); setMsg(null); }}>Flag for the resolution centre</Button> : (
        <div className="mt-3 space-y-2">
          <div><Label htmlFor="fl-inv">Invoice</Label><Select id="fl-inv" value={inv} onChange={(e) => setInv(e.target.value)}>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.balance} · {i.due}</option>)}<option value="">The whole account</option></Select></div>
          <div><Label htmlFor="fl-why">Why</Label><Textarea id="fl-why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Business has closed · no reply to 4 calls since August · says the work wasn't finished" /></div>
          <div className="flex gap-2"><Button variant="primary" size="sm" disabled={pending} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Flag it</Button><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>
      )}
      {msg && <p role="status" className={`mt-2 text-[0.75rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </Card>
  );
}

/** Account-keeping fees for this customer: their rate, what's owing now, and one button to put it on a draft invoice. */
export function FeePanel({ customerId, enabled, standard, own, lines, total, needsDb }: {
  customerId: string; enabled: boolean; standard: number; own: number | null;
  lines: { number: string; text: string; amount: string }[]; total: string | null; needsDb: boolean;
}) {
  const router = useRouter();
  const [rate, setRate] = useState(own == null ? "" : String(own));
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [pending, start] = useTransition();
  const saveRate = () => start(async () => {
    const { setCustomerFeeRate } = await import("@/app/(app)/accounts/actions");
    const r = await setCustomerFeeRate(customerId, rate.trim() === "" ? null : Number(rate));
    setMsg(r.ok ? { ok: true, text: rate.trim() === "" ? `Back on the standard rate (${standard}% a month).` : `Saved: ${rate}% a month for this customer.` } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const raise = () => start(async () => {
    const { raiseFeeInvoice } = await import("@/app/(app)/accounts/actions");
    const r = await raiseFeeInvoice(customerId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Draft invoice ${r.data.number} created — check it and send it.`, href: `/invoices/${r.data.id}` });
    router.refresh();
  });
  return (
    <Card className="p-4 text-[0.8125rem]">
      <p className="font-semibold text-ink">Account-keeping fee</p>
      {!enabled ? <p className="mt-1 text-ink-muted">Switched off. Turn it on in <a href="/accounts/terms" className="font-medium text-brand-700 hover:underline">Fees &amp; terms</a>.</p> : (
        <>
          <div className="mt-2 flex items-end gap-2">
            <div className="w-28"><Label htmlFor="fee-rate" hint={`Blank = standard (${standard}%)`}>% a month</Label>
              <Input id="fee-rate" type="number" min={0} max={20} step={0.1} inputMode="decimal" value={rate} placeholder={String(standard)} onChange={(e) => setRate(e.target.value)} /></div>
            <Button size="sm" disabled={pending} onClick={saveRate}>Save rate</Button>
          </div>
          <p className="mt-1 text-[0.75rem] text-ink-faint">Set 0 to never charge this customer.</p>
          {needsDb ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-100">Needs the 0078 database update before fees can be charged.</p>
            : lines.length ? (
            <div className="mt-3 space-y-1.5">
              {lines.map((l, i) => <p key={i} className="flex justify-between gap-2"><span className="text-ink-muted">{l.number} · {l.text}</span><span className="font-semibold tabular-nums">{l.amount}</span></p>)}
              <p className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>Owing now</span><span className="tabular-nums">{total}</span></p>
              <Button variant="primary" size="sm" className="mt-1 w-full justify-center" disabled={pending} onClick={raise}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Raise fee invoice (draft)</Button>
            </div>
          ) : <p className="mt-3 text-ink-muted">No fee owing right now.</p>}
        </>
      )}
      {msg && <p role="status" className={`mt-2 text-[0.75rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}{msg.href && <> <a href={msg.href} className="underline">Open it</a></>}</p>}
    </Card>
  );
}

type PayInv = { id: string; number: string; balance: number; label: string; overdue: boolean };

/** Take a payment for the customer: tick invoices, then charge the card on file or open Stripe's secure card page. */
export function PayPanel({ customerId, invoices, card, currency, stripeReady, justPaid }: {
  customerId: string; invoices: PayInv[]; card: { label: string; expiry: string | null; expired: boolean } | null; currency: string; stripeReady: boolean; justPaid: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>(() => { const o = invoices.filter((i) => i.overdue).map((i) => i.id); return o.length ? o : invoices.map((i) => i.id); });
  const [save, setSave] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!invoices.length) return null;
  const total = invoices.filter((i) => pick.includes(i.id)).reduce((a, i) => a + i.balance, 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const phone = () => start(async () => {
    setMsg(null);
    const { takePhonePayment } = await import("@/app/(app)/accounts/actions");
    const r = await takePhonePayment(customerId, pick, save);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setUrl(r.data.url);
    setMsg({ ok: true, text: `Ready: ${fmt(r.data.total)} for ${r.data.invoices.join(", ")}. Open Stripe's card page and type in the card as they read it out. The payment shows here and in Xero once it goes through.` });
  });
  const charge = () => {
    if (!card || !window.confirm(`Charge ${fmt(total)} to the ${card.label} now?`)) return;
    start(async () => {
      setMsg(null);
      const { chargeSavedCardNow } = await import("@/app/(app)/accounts/actions");
      const r = await chargeSavedCardNow(customerId, pick);
      setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  };
  const remove = () => {
    if (!window.confirm("Remove the card on file? You can save a new one next time you take a payment.")) return;
    start(async () => { const { removeSavedCard } = await import("@/app/(app)/accounts/actions"); const r = await removeSavedCard(customerId); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); });
  };
  return (
    <Card>
      <CardHeader title="Take a payment" subtitle="Tick the invoices they're paying — charge their card on file, or type their card into Stripe's secure page while they're on the phone." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {justPaid && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-inset ring-emerald-100">Payment taken — it&apos;s being recorded on the invoices now. Refresh in a few seconds if it isn&apos;t showing yet.</p>}
        {!stripeReady && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-100">Connect Stripe in Settings → Integrations to take card payments.</p>}
        <ul className="space-y-1">
          {invoices.map((i) => (
            <li key={i.id}><label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-zinc-50">
              <input type="checkbox" className="h-4 w-4" checked={pick.includes(i.id)} onChange={() => toggle(i.id)} />
              <span className="font-medium text-ink">{i.number}</span><span className={i.overdue ? "text-rose-700" : "text-ink-muted"}>{i.label}</span>
              <span className="ml-auto font-semibold tabular-nums">{fmt(i.balance)}</span>
            </label></li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-line pt-2 text-[0.875rem] font-semibold"><span>Paying now</span><span className="tabular-nums">{fmt(total)}</span></p>
        {card && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-line">
            <span className="text-ink">Card on file: <strong>{card.label}</strong>{card.expiry ? <span className={card.expired ? "text-rose-700" : "text-ink-muted"}> · {card.expired ? "expired" : "expires"} {card.expiry}</span> : null}</span>
            <Button size="sm" variant="primary" className="ml-auto" disabled={pending || !pick.length || !stripeReady || card.expired} onClick={charge}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Charge {fmt(total)}</Button>
            <button type="button" onClick={remove} className="text-[0.75rem] text-ink-muted underline hover:text-ink">Remove card</button>
          </div>
        )}
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={save} onChange={(e) => setSave(e.target.checked)} />
          <span>Keep the card on file for future invoices <span className="block text-[0.75rem] text-ink-faint">Only with the customer&apos;s OK — ask them, and it&apos;s noted on their account. Stripe keeps the card; we only see the last 4 digits.</span></span></label>
        <Button variant={card ? "secondary" : "primary"} disabled={pending || !pick.length || !stripeReady} onClick={phone}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Take card over the phone — {fmt(total)}</Button>
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setUrl(null), 500)} className="inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700">Open Stripe&apos;s card page →</a>}
      </div>
    </Card>
  );
}
