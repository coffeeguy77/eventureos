"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Eye, Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { invoiceEmail } from "@/lib/email/invoice-email";
import { invoiceSendSetup, sendInvoiceEmail, type InvoiceSendSetup, type SendInvoiceResult } from "@/app/(app)/invoices/send-actions";
import { Check2, FitPreview, FromOption, SentScreen, type AfterSend } from "@/components/quotes/send-dialog";

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
interface Recipient { email: string; name: string | null }

/** "Email invoice": choose exactly who gets it, write the cover message, see the email, send. */
export function SendInvoiceDialog({ invoiceId, onClose, onDone, after }: {
  invoiceId: string; onClose: () => void; onDone: (message: string) => void; after?: AfterSend;
}) {
  const [setup, setSetup] = useState<InvoiceSendSetup | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [to, setTo] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [withSig, setWithSig] = useState(true);
  const [copyMe, setCopyMe] = useState(false);
  const [via, setVia] = useState<"gmail" | "resend">("gmail");
  const [saveContacts, setSaveContacts] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendInvoiceResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [mounted, setMounted] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await invoiceSendSetup(invoiceId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
      if (!live) return;
      if (!r.ok) { setLoadErr(r.error); return; }
      const d = r.data;
      setSetup(d);
      setSubject(d.subject); setMessage(d.message); setWithSig(Boolean(d.signature)); setVia(d.gmail ? "gmail" : "resend");
      setTo(d.defaultTo.map((x) => ({ email: x.email, name: x.name })));
      // A new email by default: replying would also go to whoever was last in that conversation
      setThreadId(null);
    })();
    return () => { live = false; };
  }, [invoiceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [busy, onClose]);

  function add(raw: string) {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim().replace(/^<|>$/g, "").toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL.test(p));
    const good = parts.filter((p) => EMAIL.test(p) && !to.some((t) => t.email === p));
    if (good.length) setTo((t) => [...t, ...good.map((email) => ({ email, name: setup?.suggestions.find((s) => s.email === email)?.name ?? null }))]);
    if (bad.length) { setError(`“${bad[0]}” isn't a valid email address.`); setDraft(bad.join(", ")); }
    else { setError(null); setDraft(""); }
  }

  const unused = (setup?.suggestions ?? []).filter((s) => !to.some((t) => t.email === s.email));
  const newAddresses = to.filter((t) => !(setup?.suggestions ?? []).some((s) => s.email === t.email && s.label !== "In the email conversation"));
  const replying = via === "gmail" && !!threadId;

  const preview = useMemo(() => {
    if (!setup) return "";
    return invoiceEmail({
      businessName: setup.businessName, logoUrl: setup.logoUrl, brand: setup.brand, invoiceNumber: setup.number, eventLine: setup.eventLine,
      total: setup.total, amountDue: setup.amountDue, paidNote: setup.paidNote, dueDate: setup.dueDate, message: message || " ", url: setup.payUrl,
      cardPayments: setup.cardPayments, signatureHtml: withSig ? setup.signature?.html : null,
    }).html.replace("<head>", "<head><style>a{pointer-events:none}</style>");
  }, [setup, message, withSig]);

  async function send() {
    if (draft.trim()) { add(draft); return; }
    if (!to.length) { setError("Add at least one email address."); input.current?.focus(); return; }
    setError(null); setBusy(true);
    const r = await sendInvoiceEmail(invoiceId, { recipients: to, subject, message, includeSignature: withSig, copyMe, saveContacts, via, replyThreadId: via === "gmail" ? threadId : null })
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection before trying again — it may have sent." }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setResult(r.data);
  }

  const body = (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Email invoice">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/45" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[94dvh] w-full max-w-[min(1360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-ink">{setup ? `Email invoice ${setup.number}` : "Email invoice"}</p>
            {setup && <p className="text-[0.75rem] text-ink-muted">{setup.amountDue} due{setup.dueDate ? ` by ${setup.dueDate}` : ""}{setup.cardPayments ? " · they can pay by card from the email" : ""}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md p-2 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {!setup ? (
          <div className="grid min-h-[260px] place-items-center p-8 text-[0.875rem] text-ink-muted">
            {loadErr ? <div className="w-full max-w-md"><FormError message={loadErr} /></div> : <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Preparing the email…</span>}
          </div>
        ) : result ? (
          <SentScreen result={result} quoteId={invoiceId} quoteNumber={setup.number} names={to} after={after}
            doc={{ label: `Invoice ${setup.number}`, key: `invoice-follow-up:${invoiceId}`, note: result.markedSent ? "It's now marked as awaiting payment." : "It's logged on the invoice's activity." }}
            onDone={() => onDone(result.sent.length ? `Invoice emailed to ${result.sent.join(", ")}.` : "The invoice wasn't emailed.")} />
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)] lg:overflow-hidden">
              <div className="min-w-0 space-y-4 p-4 sm:p-5 lg:overflow-y-auto">
                {!setup.emailReady && <FormError message="Email can't be sent yet — connect Gmail in Settings → Integrations." />}
                {setup.isDraft && setup.xeroManaged && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-200">This invoice is still a draft in Xero — approve it in Xero so it can be paid.</p>}
                <div>
                  <p className="mb-1.5 text-[0.7812rem] font-medium text-ink">From</p>
                  <div role="radiogroup" aria-label="Send from" className="grid gap-2 sm:grid-cols-2">
                    <FromOption on={via === "gmail"} disabled={!setup.gmail} onPick={() => setVia("gmail")} title={setup.gmail ?? "Your Gmail"}
                      hint={setup.gmail ? "From your own address · saved in Gmail's Sent folder · replies come straight back" : <>Not connected. <Link href="/settings/integrations" className="font-medium text-brand-700 hover:underline">Connect Gmail</Link></>} />
                    <FromOption on={via === "resend"} disabled={!setup.resendReady} onPick={() => setVia("resend")} title="EventureOS"
                      hint={`Sent for ${setup.businessName} from EventureOS's address · replies go to ${setup.senderEmail}`} />
                  </div>
                </div>
                {via === "gmail" && setup.threads.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[0.7812rem] font-medium text-ink">Send as</p>
                    <div role="radiogroup" aria-label="Send as" className="grid gap-2 sm:grid-cols-2">
                      <FromOption on={!threadId} disabled={false} onPick={() => setThreadId(null)} title="A new email" hint="Only to the people you choose below" />
                      <FromOption on={!!threadId} disabled={false} onPick={() => setThreadId(threadId ?? setup.threads[0].id)} title="A reply in their email"
                        hint={setup.threads.length === 1 ? <>Joins “{setup.threads[0].subject}”</> : "Joins the conversation you choose below"} />
                    </div>
                    {threadId && setup.threads.length > 1 && (
                      <select aria-label="Conversation" value={threadId} onChange={(e) => setThreadId(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink sm:text-[0.8438rem]">
                        {setup.threads.map((t) => <option key={t.id} value={t.id}>{t.subject} — {t.to}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <div>
                  <Label htmlFor="inv-to" hint="Tap × to take someone off, or tap a name below to add them">To</Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100" onClick={() => input.current?.focus()}>
                    {to.map((t) => (
                      <span key={t.email} className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 py-1 pl-2 pr-1 text-[0.8125rem] text-brand-900 ring-1 ring-inset ring-brand-200">
                        <span className="truncate">{t.name ? <><b className="font-medium">{t.name}</b> <span className="text-brand-800/80">&lt;{t.email}&gt;</span></> : t.email}</span>
                        <button type="button" aria-label={`Remove ${t.email}`} onClick={(e) => { e.stopPropagation(); setTo((x) => x.filter((y) => y.email !== t.email)); }} className="rounded p-0.5 hover:bg-brand-100"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                    <input ref={input} id="inv-to" type="email" inputMode="email" autoComplete="off" value={draft} placeholder={to.length ? "Add another email" : "name@example.com"}
                      onChange={(e) => { setDraft(e.target.value); setError(null); }}
                      onKeyDown={(e) => {
                        if (["Enter", ",", ";", "Tab"].includes(e.key) && draft.trim()) { e.preventDefault(); add(draft); }
                        if (e.key === "Backspace" && !draft && to.length) setTo((x) => x.slice(0, -1));
                      }}
                      onBlur={() => draft.trim() && add(draft)}
                      className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-base text-ink placeholder:text-ink-faint focus:outline-none sm:text-[0.8438rem]" />
                  </div>
                  {unused.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unused.map((s) => (
                        <button key={s.email} type="button" onClick={() => setTo((t) => [...t, { email: s.email, name: s.name }])}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line-strong hover:bg-zinc-50 hover:text-ink">
                          <Plus className="h-3 w-3" />{s.name ? `${s.name} · ` : ""}{s.email}<span className="text-ink-faint"> · {s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {replying && <p className="mt-1.5 text-[0.75rem] text-ink-faint">As a reply it goes only to the people in the To box above, inside that conversation.</p>}
                </div>
                <div>
                  <Label htmlFor="inv-subject" hint={replying ? "kept the same so it stays in their conversation" : undefined}>Subject</Label>
                  {replying
                    ? <Input id="inv-subject" value={setup.threads.find((t) => t.id === threadId)?.subject ?? ""} readOnly className="bg-canvas text-base text-ink-muted sm:text-[0.8438rem]" />
                    : <Input id="inv-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="text-base sm:text-[0.8438rem]" />}
                </div>
                <div>
                  <Label htmlFor="inv-message" hint="The invoice, amount due and button are added below it">Cover message</Label>
                  <Textarea id="inv-message" value={message} maxLength={5000} rows={11} onChange={(e) => setMessage(e.target.value)} className="text-base leading-relaxed sm:text-[0.8438rem]" />
                </div>
                <div className="space-y-2 text-[0.8125rem]">
                  {setup.signature ? <Check2 on={withSig} onChange={setWithSig}>Add my email signature</Check2>
                    : <p className="text-ink-muted">No email signature yet. <Link href="/my-signature" className="font-medium text-brand-700 hover:underline">Set one up</Link></p>}
                  {via === "resend" && <Check2 on={copyMe} onChange={setCopyMe}>Send me a copy ({setup.senderEmail})</Check2>}
                  {newAddresses.length > 0 && <Check2 on={saveContacts} onChange={setSaveContacts}>Save {newAddresses.map((a) => a.email).join(", ")} as {newAddresses.length === 1 ? "a contact" : "contacts"} on this client</Check2>}
                </div>
                {!setup.cardPayments && <p className="rounded-lg bg-canvas px-3 py-2 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">Card payments aren&apos;t switched on, so the button opens the invoice to view. Add how to pay (e.g. bank details) to your message, or <Link href="/settings/integrations" className="font-medium text-brand-700 hover:underline">connect Stripe</Link>.</p>}
                <button type="button" onClick={() => setShowPreview((s) => !s)} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-700 lg:hidden">
                  <Eye className="h-4 w-4" />{showPreview ? "Hide preview" : "Preview the email"}
                </button>
                {showPreview && <div className="max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-[#f4f4f5] lg:hidden"><FitPreview html={preview} /></div>}
              </div>
              <div className="hidden min-h-0 flex-col border-l border-line bg-[#f4f4f5] lg:flex">
                <p className="shrink-0 border-b border-line bg-surface px-4 py-2 text-[0.75rem] font-medium text-ink-muted">Preview — what {to[0]?.name?.split(" ")[0] ?? "they"} will see</p>
                <div className="min-h-0 flex-1 overflow-y-auto"><FitPreview html={preview} /></div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                {error ? <p role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
                  : setup.isDraft && !setup.xeroManaged ? <p className="text-[0.75rem] text-ink-muted">Sending marks it as awaiting payment.</p> : null}
              </div>
              <Button type="button" variant="primary" onClick={send} disabled={busy || (via === "gmail" ? !setup.gmail : !setup.resendReady) || (!replying && !subject.trim()) || !message.trim()} className="h-10 sm:h-9">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {busy ? "Sending…" : `Send to ${to.length || "…"} ${to.length === 1 ? "person" : "people"}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
  return mounted ? createPortal(body, document.body) : null;
}
