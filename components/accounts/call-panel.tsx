"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Phone, PhoneCall, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/form";
import { addCollectionNote, removeNumber, sendSmsToCustomer } from "@/app/(app)/accounts/actions";
import { ATTEMPT_CODES, attemptText, digits, type PhoneOption } from "@/lib/accounts/phones";
import { cn } from "@/lib/cn";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * Who to ring and on which number: every number we have (from the client record, contacts and Xero), the number tried
 * last (with what happened), and one-tap buttons to record each attempt — CW1, PC OUT… — on the chosen number.
 */
export function CallPanel({ customerId, invoiceId, phones, attempts, xero, sms }: {
  customerId: string; invoiceId?: string | null; phones: PhoneOption[];
  attempts: { code: string; number: string | null; at: string }[]; xero: "ok" | "none" | "error";
  /** text messages (Twilio connected): the business name and what's owing, for the starting message */
  sms?: { business: string; firstName: string; owing: string } | null;
}) {
  const router = useRouter();
  const last = attempts[0] ?? null;
  const usedLast = (n: string) => !!last?.number && digits(last.number) === digits(n);
  const [num, setNum] = useState<string | null>(() => (phones.find((p) => !usedLast(p.number)) ?? phones[0])?.number ?? null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const record = (code: string) => start(async () => {
    setMsg(null);
    const r = await addCollectionNote(customerId, { kind: "call", body: attemptText(code, num, note), invoiceId: invoiceId ?? null });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Recorded ${code}${num ? ` on ${num}` : ""}.` });
    setNote(""); router.refresh();
  });
  const tries = (n: string) => attempts.filter((a) => a.number && digits(a.number) === digits(n));
  const mobile = (n: string) => /^(04|05)/.test(digits(n)) || /^\+(?!61)/.test(n.trim());
  const [texting, setTexting] = useState<string | null>(null);
  const [smsBody, setSmsBody] = useState("");
  const [withLink, setWithLink] = useState(true);
  const openText = (n: string) => { setTexting(n); setNum(n); setSmsBody(sms ? `Hi ${sms.firstName}, it's ${sms.business}. A friendly reminder there's ${sms.owing} owing on your account. You can view and pay it here:` : ""); };
  const sendText = () => start(async () => {
    if (!texting) return;
    setMsg(null);
    const r = await sendSmsToCustomer(customerId, texting, smsBody, withLink);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) { setTexting(null); router.refresh(); }
  });
  const remove = (p: PhoneOption) => {
    if (!window.confirm(`Remove ${p.number} (${p.label})? Use this when the person has left or the number's wrong.`)) return;
    start(async () => { const r = await removeNumber(customerId, p.number, p.source); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) router.refresh(); });
  };
  return (
    <Card>
      <CardHeader title="Call" subtitle={last ? `Last try: ${last.code}${last.number ? ` on ${last.number}` : ""} · ${ago(last.at)}` : "No calls recorded yet"} />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {phones.length ? (
          <ul className="space-y-1">
            {phones.map((p) => {
              const t = tries(p.number);
              return (
                <li key={p.number}>
                  <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ring-1 ring-inset", num === p.number ? "bg-brand-50/60 ring-brand-200" : "ring-transparent hover:bg-zinc-50")}>
                    <input type="radio" name={`ph-${customerId}`} className="h-4 w-4" checked={num === p.number} onChange={() => setNum(p.number)} />
                    <span className="min-w-0 flex-1"><span className="font-semibold tabular-nums text-ink">{p.number}</span> <span className="text-ink-muted">· {p.label}</span>
                      {t.length > 0 && <span className={cn("block text-[0.6875rem]", usedLast(p.number) ? "font-medium text-amber-700" : "text-ink-faint")}>{usedLast(p.number) ? "Tried last time — " : ""}{t.length} tr{t.length === 1 ? "y" : "ies"}, last {t[0].code} {ago(t[0].at)}</span>}
                    </span>
                    <a href={`tel:${p.number.replace(/[^\d+]/g, "")}`} onClick={() => setNum(p.number)} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[0.75rem] font-semibold text-white hover:bg-emerald-700"><PhoneCall className="h-3.5 w-3.5" />Call</a>
                    {sms && mobile(p.number) && <button type="button" onClick={() => openText(p.number)} className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-600 px-2.5 text-[0.75rem] font-semibold text-white hover:bg-sky-700"><MessageSquare className="h-3.5 w-3.5" />Text</button>}
                    <button type="button" onClick={() => remove(p)} title="Remove this number (they've left / wrong number)" aria-label={`Remove ${p.number}`} className="grid h-8 w-7 place-items-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-700"><X className="h-3.5 w-3.5" /></button>
                  </label>
                  {texting === p.number && (
                    <div className="mt-1.5 space-y-2 rounded-lg bg-sky-50/60 p-2.5 ring-1 ring-inset ring-sky-100">
                      <Textarea rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} aria-label="Text message" maxLength={1000} />
                      <label className="flex items-center gap-2 text-[0.75rem]"><input type="checkbox" className="h-4 w-4" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} />Add their statement link (view &amp; pay)</label>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={pending || !smsBody.trim()} onClick={sendText} className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-600 px-3 text-[0.75rem] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}Send text</button>
                        <button type="button" onClick={() => setTexting(null)} className="text-[0.75rem] text-ink-muted hover:text-ink">Cancel</button>
                        <span className="ml-auto text-[0.6875rem] text-ink-faint">{smsBody.length + (withLink ? 70 : 0)} characters</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="flex items-center gap-1.5 text-ink-muted"><Phone className="h-4 w-4" />No phone number on the client record, contacts or in Xero.</p>}
        {xero === "error" && <p className="text-[0.75rem] text-ink-faint">Couldn&apos;t reach Xero just now — showing the numbers already saved.</p>}
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Record a try{num ? ` on ${num}` : ""} (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {ATTEMPT_CODES.map((c) => (
              <button key={c} type="button" disabled={pending} onClick={() => record(c)}
                className="h-9 min-w-[3.25rem] rounded-md bg-surface px-2.5 text-[0.75rem] font-semibold text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50 disabled:opacity-50">{c}</button>
            ))}
            {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-ink-muted" />}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a few words first if you like (e.g. left a voicemail)" aria-label="Note with the try" className="mt-2" />
        </div>
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
