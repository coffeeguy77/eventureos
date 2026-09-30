"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Check, Eye, Loader2, Mail, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { quoteEmail } from "@/lib/email/quote-email";
import { quoteSendSetup, sendQuoteEmail, type QuoteSendSetup, type SendQuoteResult } from "@/app/(app)/quotes/send-actions";
import { publishQuote } from "@/app/(app)/quotes/actions";
import { cn } from "@/lib/cn";

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
interface Recipient { email: string; name: string | null }

/** "Send quote" pop-up: who it goes to, the message, a live preview of the email, then send (publishing first if needed). */
export function SendQuoteDialog({ quoteId, flushAll, onClose, onDone, initialSetup }: {
  quoteId: string;
  /** Already-loaded setup (skips the server round trip) */
  initialSetup?: QuoteSendSetup;
  flushAll: () => Promise<boolean>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [setup, setSetup] = useState<QuoteSendSetup | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [to, setTo] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [withSig, setWithSig] = useState(true);
  const [copyMe, setCopyMe] = useState(false);
  const [saveContacts, setSaveContacts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "send" | "publish">(null);
  const [result, setResult] = useState<SendQuoteResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [mounted, setMounted] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const flushRef = useRef(flushAll);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    let live = true;
    if (initialSetup) {
      setSetup(initialSetup); setTo(initialSetup.defaultTo.map((x) => ({ email: x.email, name: x.name })));
      setSubject(initialSetup.subject); setMessage(initialSetup.message); setWithSig(Boolean(initialSetup.signature));
      return;
    }
    (async () => {
      // Save any pending edits first so the total and the published version match what's on screen
      const saved = await flushRef.current();
      if (!saved) { if (live) setLoadErr("Some changes couldn't be saved. Fix them before sending."); return; }
      const r = await quoteSendSetup(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
      if (!live) return;
      if (!r.ok) { setLoadErr(r.error); return; }
      setSetup(r.data); setTo(r.data.defaultTo.map((x) => ({ email: x.email, name: x.name })));
      setSubject(r.data.subject); setMessage(r.data.message); setWithSig(Boolean(r.data.signature));
    })();
    return () => { live = false; };
  }, [quoteId, initialSetup]);

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
    if (good.length) {
      setTo((t) => [...t, ...good.map((email) => ({ email, name: setup?.suggestions.find((s) => s.email === email)?.name ?? null }))]);
    }
    if (bad.length) { setError(`“${bad[0]}” isn't a valid email address.`); setDraft(bad.join(", ")); }
    else { setError(null); setDraft(""); }
  }

  const unused = (setup?.suggestions ?? []).filter((s) => !to.some((t) => t.email === s.email));
  const newAddresses = to.filter((t) => !(setup?.suggestions ?? []).some((s) => s.email === t.email));

  const preview = useMemo(() => {
    if (!setup) return "";
    return quoteEmail({
      businessName: setup.businessName, logoUrl: setup.logoUrl, brand: setup.brand, quoteNumber: setup.quoteNumber, title: setup.title,
      eventLine: setup.eventLine, total: setup.total, validUntil: setup.validUntil, message: message || " ",
      url: "https://www.eventureos.com.au/q/…", signatureHtml: withSig ? setup.signature?.html : null,
    }).html.replace("<head>", "<head><style>a{pointer-events:none}</style>");
  }, [setup, message, withSig]);

  async function send() {
    if (draft.trim()) { add(draft); return; }
    if (!to.length) { setError("Add at least one email address."); input.current?.focus(); return; }
    setError(null); setBusy("send");
    const r = await sendQuoteEmail(quoteId, { recipients: to, subject, message, includeSignature: withSig, copyMe, saveContacts })
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection before trying again — it may have sent." }));
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setResult(r.data);
  }

  async function publishOnly() {
    setError(null); setBusy("publish");
    const r = await publishQuote(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    onDone(`Version ${r.data.versionNumber} published — nothing was emailed.`);
  }

  const body = (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Send quote">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/45" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-ink">{setup ? `Email Quote Q-${setup.quoteNumber}` : "Email quote"}</p>
            {setup && (
              <p className="text-[0.75rem] text-ink-muted">
                {setup.needsPublish ? `Publishes version ${setup.nextVersion} and emails it` : `Emails version ${setup.currentVersion} again`} · {setup.total} inc GST
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close" className="rounded-md p-2 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {!setup ? (
          <div className="grid min-h-[260px] place-items-center p-8 text-[0.875rem] text-ink-muted">
            {loadErr ? <div className="w-full max-w-md"><FormError message={loadErr} /></div> : <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Preparing the email…</span>}
          </div>
        ) : result ? (
          <div className="p-6 sm:p-8">
            <div className="mx-auto max-w-lg text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-6 w-6" /></span>
              <p className="mt-3 text-[1.0625rem] font-semibold text-ink">{result.sent.length ? `Quote sent${result.published ? ` (version ${result.versionNumber})` : ""}` : "Nothing was sent"}</p>
              {result.sent.length > 0 && <p className="mt-1 text-[0.875rem] text-ink-muted">To {result.sent.join(", ")}. You&apos;ll see when it&apos;s opened under <b>Sent emails</b> on this quote.</p>}
              {result.failed.length > 0 && (
                <div className="mt-4 rounded-xl bg-rose-50 p-3 text-left text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-200">
                  {result.failed.map((f) => <p key={f.email}><b>{f.email}</b>: {f.error}</p>)}
                </div>
              )}
              <Button variant="primary" className="mt-5" onClick={() => onDone(result.sent.length ? `Quote emailed to ${result.sent.join(", ")}.` : "The quote wasn't emailed.")}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:overflow-hidden">
              {/* Compose */}
              <div className="min-w-0 space-y-4 p-4 sm:p-5 lg:overflow-y-auto">
                {!setup.emailReady && <FormError message="Email sending isn't set up — RESEND_API_KEY is missing in Vercel." />}
                <div>
                  <Label htmlFor="send-to">To</Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100" onClick={() => input.current?.focus()}>
                    {to.map((t) => (
                      <span key={t.email} className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 py-1 pl-2 pr-1 text-[0.8125rem] text-brand-900 ring-1 ring-inset ring-brand-200">
                        <span className="truncate">{t.name ? <><b className="font-medium">{t.name}</b> <span className="text-brand-800/80">&lt;{t.email}&gt;</span></> : t.email}</span>
                        <button type="button" aria-label={`Remove ${t.email}`} onClick={(e) => { e.stopPropagation(); setTo((x) => x.filter((y) => y.email !== t.email)); }} className="rounded p-0.5 hover:bg-brand-100"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                    <input ref={input} id="send-to" type="email" inputMode="email" autoComplete="off" value={draft} placeholder={to.length ? "Add another email" : "name@example.com"}
                      onChange={(e) => { setDraft(e.target.value); setError(null); }}
                      onKeyDown={(e) => {
                        if (["Enter", ",", ";", "Tab"].includes(e.key) && draft.trim()) { e.preventDefault(); add(draft); }
                        if (e.key === "Backspace" && !draft && to.length) setTo((x) => x.slice(0, -1));
                      }}
                      onBlur={() => draft.trim() && add(draft)} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[,;\s]/.test(t.trim())) { e.preventDefault(); add(t); } }}
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
                  {setup.previouslySentTo.length > 0 && <p className="mt-1.5 text-[0.75rem] text-ink-faint">Sent before to {setup.previouslySentTo.join(", ")}.</p>}
                </div>
                <div>
                  <Label htmlFor="send-subject">Subject</Label>
                  <Input id="send-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="text-base sm:text-[0.8438rem]" />
                </div>
                <div>
                  <Label htmlFor="send-message" hint="The quote, total and button are added below it">Message</Label>
                  <Textarea id="send-message" value={message} maxLength={5000} rows={11} onChange={(e) => setMessage(e.target.value)} className="text-base leading-relaxed sm:text-[0.8438rem]" />
                </div>
                <div className="space-y-2 text-[0.8125rem]">
                  {setup.signature ? (
                    <Check2 on={withSig} onChange={setWithSig}>Add my email signature</Check2>
                  ) : (
                    <p className="text-ink-muted">No email signature yet. <Link href="/my-signature" className="font-medium text-brand-700 hover:underline">Set one up</Link></p>
                  )}
                  <Check2 on={copyMe} onChange={setCopyMe}>Send me a copy ({setup.senderEmail})</Check2>
                  {newAddresses.length > 0 && <Check2 on={saveContacts} onChange={setSaveContacts}>Save {newAddresses.map((a) => a.email).join(", ")} as {newAddresses.length === 1 ? "a contact" : "contacts"} on this client</Check2>}
                </div>
                <p className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">
                  <Mail className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>Sent from {setup.businessName} by EventureOS. Replies go to <b className="text-ink">{setup.replyTo}</b>. Each person gets their own link, so you can see who opened it.
                    {!setup.deliveryTracking && " Delivery tracking (delivered/bounced) isn't switched on yet."}</span>
                </p>
                <button type="button" onClick={() => setShowPreview((s) => !s)} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-700 lg:hidden">
                  <Eye className="h-4 w-4" />{showPreview ? "Hide preview" : "Preview the email"}
                </button>
                {showPreview && <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[560px] w-full rounded-xl border border-line bg-[#f4f4f5] lg:hidden" />}
              </div>
              {/* Preview (desktop) */}
              <div className="hidden min-h-0 border-l border-line bg-[#f4f4f5] lg:block">
                <p className="border-b border-line bg-surface px-4 py-2 text-[0.75rem] font-medium text-ink-muted">Preview — what {to[0]?.name?.split(" ")[0] ?? "they"} will see</p>
                <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[calc(94dvh-10.5rem)] max-h-[680px] w-full border-0" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                {error ? <p role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
                  : setup.needsPublish ? <p className="text-[0.75rem] text-ink-muted">Sending publishes version {setup.nextVersion}{setup.currentVersion ? ` and replaces version ${setup.currentVersion}` : ""}.</p> : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {setup.needsPublish && (
                  <Button type="button" variant="ghost" onClick={publishOnly} disabled={Boolean(busy)} className="h-10 sm:h-9">
                    {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Publish without emailing
                  </Button>
                )}
                <Button type="button" variant="primary" onClick={send} disabled={Boolean(busy) || !setup.emailReady || !subject.trim() || !message.trim()} className="h-10 sm:h-9">
                  {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {busy === "send" ? "Sending…" : `Send to ${to.length || "…"} ${to.length === 1 ? "person" : "people"}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
  return mounted ? createPortal(body, document.body) : null;
}

function Check2({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-ink")}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-brand-500" />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}
