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
export function LogForm({ customerId, invoices, today }: { customerId: string; invoices: Inv[]; today: string }) {
  const router = useRouter();
  const [f, setF] = useState<NoteInput>({ kind: "call", body: "", invoiceId: invoices[0]?.id ?? null, promiseDate: "", promiseAmount: "", remind: true, nextStep: "", nextStepDue: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<NoteInput>) => setF((o) => ({ ...o, ...p }));
  const save = () => start(async () => {
    setMsg(null);
    const r = await addCollectionNote(customerId, f);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: f.kind === "promise" && f.remind ? `Saved. The invoice will be emailed with a pay link on the morning of ${f.promiseDate}.` : "Saved." });
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
            <label className="flex items-start gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.remind !== false} onChange={(e) => set({ remind: e.target.checked })} />Email them the invoice with a pay link on that morning, as a reminder of what they agreed</label>
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
