"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BellRing, Check, Eye, Loader2, Mail, Plus, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { quoteEmail } from "@/lib/email/quote-email";
import { quoteSendSetup, sendQuoteEmail, type QuoteSendSetup, type SendQuoteResult } from "@/app/(app)/quotes/send-actions";
import { publishQuote } from "@/app/(app)/quotes/actions";
import { followUpToTask } from "@/app/(app)/tasks/actions";
import { addDaysISO, todayISO, zonedTimeUTC } from "@/lib/format";
import { cn } from "@/lib/cn";

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
interface Recipient { email: string; name: string | null }

/** Where to go once the quote has gone out */
export interface AfterSend {
  clientId: string; clientName: string; eventId: string; tz: string;
  /** The customer's emails: the conversation it was opened from, else the job's Communication tab */
  emailsHref: string; emailsLabel?: string;
}

/** "Send quote" pop-up: who it goes to, the message, a live preview of the email, then send (publishing first if needed). */
export function SendQuoteDialog({ quoteId, flushAll, onClose, onDone, initialSetup, replyThreadId, after }: {
  quoteId: string;
  after?: AfterSend;
  /** Start in "reply in this email conversation" mode (e.g. from "Reply with quote" on a thread) */
  replyThreadId?: string | null;
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
  const [via, setVia] = useState<"gmail" | "resend">("gmail");
  const [saveContacts, setSaveContacts] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null); // null = a new email
  const [attachPdf, setAttachPdf] = useState(true);
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
      apply(initialSetup);
      return;
    }
    (async () => {
      // Save any pending edits first so the total and the published version match what's on screen
      const saved = await flushRef.current();
      if (!saved) { if (live) setLoadErr("Some changes couldn't be saved. Fix them before sending."); return; }
      const r = await quoteSendSetup(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
      if (!live) return;
      if (!r.ok) { setLoadErr(r.error); return; }
      apply(r.data);
    })();
    return () => { live = false; };
    function apply(d: QuoteSendSetup) {
      setSetup(d);
      setSubject(d.subject); setMessage(d.message); setWithSig(Boolean(d.signature)); setVia(d.gmail ? "gmail" : "resend");
      // Reply in the customer's conversation when there is one (the one asked for, else the latest)
      const t = d.gmail ? d.threads.find((x) => x.id === replyThreadId) ?? d.threads[0] ?? null : null;
      setThreadId(t?.id ?? null);
      setTo(t ? [{ email: t.to, name: d.defaultTo.find((x) => x.email === t.to)?.name ?? null }] : d.defaultTo.map((x) => ({ email: x.email, name: x.name })));
    }
  }, [quoteId, initialSetup, replyThreadId]);

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
  const replying = via === "gmail" && !!threadId;
  /** Choosing a conversation also addresses the email to the customer in it */
  function pickThread(id: string) {
    const t = setup?.threads.find((x) => x.id === id);
    if (!t) return;
    setThreadId(id);
    if (!to.some((r) => r.email === t.to)) setTo((cur) => [{ email: t.to, name: setup?.suggestions.find((x) => x.email === t.to)?.name ?? null }, ...cur]);
  }

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
    const reply = via === "gmail" ? threadId : null;
    const r = await sendQuoteEmail(quoteId, {
      recipients: to, subject, message, includeSignature: withSig, copyMe, saveContacts, via,
      replyThreadId: reply, attachPdf: via === "gmail" && attachPdf,
    })
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
      <div className="relative flex max-h-[94dvh] w-full max-w-[min(1360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:rounded-2xl">
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
          <SentScreen result={result} quoteId={quoteId} quoteNumber={setup.quoteNumber} names={to} after={after}
            onDone={() => onDone(result.sent.length ? `Quote emailed to ${result.sent.join(", ")}.` : "The quote wasn't emailed.")} />
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)] lg:overflow-hidden">
              {/* Compose */}
              <div className="min-w-0 space-y-4 p-4 sm:p-5 lg:overflow-y-auto">
                {!setup.emailReady && <FormError message="Email can't be sent yet — connect Gmail in Settings → Integrations." />}
                <div>
                  <p className="mb-1.5 text-[0.7812rem] font-medium text-ink">From</p>
                  <div role="radiogroup" aria-label="Send from" className="grid gap-2 sm:grid-cols-2">
                    <FromOption on={via === "gmail"} disabled={!setup.gmail} onPick={() => setVia("gmail")}
                      title={setup.gmail ? setup.gmail : "Your Gmail"}
                      hint={setup.gmail ? "From your own address · saved in Gmail's Sent folder · replies come straight back" : <>Not connected. <Link href="/settings/integrations" className="font-medium text-brand-700 hover:underline">Connect Gmail</Link></>} />
                    <FromOption on={via === "resend"} disabled={!setup.resendReady} onPick={() => setVia("resend")}
                      title="EventureOS"
                      hint={`Sent for ${setup.businessName} from EventureOS's address · replies go to ${setup.senderEmail}`} />
                  </div>
                </div>
                {via === "gmail" && setup.threads.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[0.7812rem] font-medium text-ink">Send as</p>
                    <div role="radiogroup" aria-label="Send as" className="grid gap-2 sm:grid-cols-2">
                      <FromOption on={!!threadId} disabled={false} onPick={() => pickThread(threadId ?? setup.threads[0].id)}
                        title="A reply in their email"
                        hint={setup.threads.length === 1 ? <>Joins “{setup.threads[0].subject}” · to {setup.threads[0].to}</> : "Joins the conversation you choose below"} />
                      <FromOption on={!threadId} disabled={false} onPick={() => setThreadId(null)}
                        title="A new email" hint="Starts a new conversation with your own subject" />
                    </div>
                    {threadId && setup.threads.length > 1 && (
                      <select aria-label="Conversation" value={threadId} onChange={(e) => pickThread(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink sm:text-[0.8438rem]">
                        {setup.threads.map((t) => <option key={t.id} value={t.id}>{t.subject} — {t.to}</option>)}
                      </select>
                    )}
                  </div>
                )}
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
                  <Label htmlFor="send-subject" hint={replying ? "kept the same so it stays in their conversation" : undefined}>Subject</Label>
                  {replying
                    ? <Input id="send-subject" value={setup.threads.find((t) => t.id === threadId)?.subject ?? ""} readOnly className="bg-canvas text-base text-ink-muted sm:text-[0.8438rem]" />
                    : <Input id="send-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="text-base sm:text-[0.8438rem]" />}
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
                  {via === "gmail" && <Check2 on={attachPdf} onChange={setAttachPdf}>Attach a PDF of the quote <span className="text-ink-faint">(with their accept link inside)</span></Check2>}
                  {via === "resend" && <Check2 on={copyMe} onChange={setCopyMe}>Send me a copy ({setup.senderEmail})</Check2>}
                  {newAddresses.length > 0 && <Check2 on={saveContacts} onChange={setSaveContacts}>Save {newAddresses.map((a) => a.email).join(", ")} as {newAddresses.length === 1 ? "a contact" : "contacts"} on this client</Check2>}
                </div>
                <p className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">
                  <Mail className="mt-px h-3.5 w-3.5 shrink-0" />
                  {via === "gmail" ? (
                    <span>Each person gets their own email and personal link, so you can see who opened it. If an address bounces, Gmail&apos;s notice is picked up on the next sync and shown under Sent emails.</span>
                  ) : (
                    <span>Sent from {setup.businessName} by EventureOS. Replies go to <b className="text-ink">{setup.senderEmail}</b>. Each person gets their own link, so you can see who opened it.
                      {!setup.deliveryTracking && " Delivery tracking (delivered/bounced) isn't switched on yet."}</span>
                  )}
                </p>
                <button type="button" onClick={() => setShowPreview((s) => !s)} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-700 lg:hidden">
                  <Eye className="h-4 w-4" />{showPreview ? "Hide preview" : "Preview the email"}
                </button>
                {showPreview && <div className="max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-[#f4f4f5] lg:hidden"><FitPreview html={preview} /></div>}
              </div>
              {/* Preview (desktop) */}
              <div className="hidden min-h-0 flex-col border-l border-line bg-[#f4f4f5] lg:flex">
                <p className="shrink-0 border-b border-line bg-surface px-4 py-2 text-[0.75rem] font-medium text-ink-muted">Preview — what {to[0]?.name?.split(" ")[0] ?? "they"} will see</p>
                <div className="min-h-0 flex-1 overflow-y-auto"><FitPreview html={preview} /></div>
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
                <Button type="button" variant="primary" onClick={send} disabled={Boolean(busy) || (via === "gmail" ? !setup.gmail : !setup.resendReady) || (!replying && !subject.trim()) || !message.trim()} className="h-10 sm:h-9">
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

function FromOption({ on, disabled, onPick, title, hint }: { on: boolean; disabled: boolean; onPick: () => void; title: string; hint: React.ReactNode }) {
  return (
    <div role="radio" aria-checked={on} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onPick()} onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      className={cn("flex items-start gap-2.5 rounded-xl p-3 ring-1 ring-inset", on ? "bg-brand-50/60 ring-2 ring-brand-500" : disabled ? "opacity-70 ring-line" : "cursor-pointer ring-line-strong hover:bg-zinc-50")}>
      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1", on ? "bg-brand-500 ring-brand-500" : "ring-line-strong")}>{on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
      <span className="min-w-0"><span className="block truncate text-[0.8125rem] font-medium text-ink">{title}</span><span className="block text-[0.72rem] leading-snug text-ink-muted">{hint}</span></span>
    </div>
  );
}

function Check2({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-ink")}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-brand-500" />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

/**
 * The email preview, shrunk to fit its pane. Emails (and some signatures) have a fixed minimum width, which used to
 * leave the right-hand side cut off behind a sideways scrollbar.
 */
function FitPreview({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ pane: 0, inner: 0, height: 600 });

  const measure = useCallback(() => {
    const el = box.current, f = frame.current;
    const doc = f?.contentDocument;
    if (!el || !f || !doc?.documentElement) return;
    const pane = el.clientWidth;
    if (!pane) return;
    // Lay it out at the pane's width; if the content needs more room, give it that and scale the lot down
    f.style.width = `${pane}px`;
    const inner = Math.max(pane, doc.documentElement.scrollWidth);
    f.style.width = `${inner}px`;
    const height = Math.max(200, doc.documentElement.scrollHeight);
    setSize({ pane, inner, height });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const scale = size.inner ? size.pane / size.inner : 1;
  return (
    <div ref={box} className="w-full overflow-hidden" style={{ height: Math.ceil(size.height * scale) }}>
      {/* allow-same-origin (no scripts) only so the preview can be measured */}
      <iframe ref={frame} title="Email preview" srcDoc={html} sandbox="allow-same-origin" onLoad={measure} scrolling="no"
        className="block border-0" style={{ width: size.inner || "100%", height: size.height, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
    </div>
  );
}

const FOLLOW_UPS = [{ days: 2, label: "In 2 days" }, { days: 4, label: "In 4 days" }, { days: 7, label: "In a week" }] as const;

/** 9am on a working day, `days` from today, in the business's timezone */
function followUpTime(days: number, tz: string) {
  let d = addDaysISO(todayISO(tz), days);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDaysISO(d, 1);
  return zonedTimeUTC(d, "09:00", tz);
}

/** After sending: who got it, then straight back to the customer's emails, the client, or a follow-up reminder. */
export function SentScreen({ result, quoteId, quoteNumber, names, after, onDone }: {
  result: SendQuoteResult; quoteId: string; quoteNumber: number | string; names: Recipient[]; after?: AfterSend; onDone: () => void;
}) {
  const [follow, setFollow] = useState<{ busy: number | null; msg: string | null; ok: boolean }>({ busy: null, msg: null, ok: true });
  const sent = result.sent.length > 0;
  const who = result.sent.map((e) => names.find((n) => n.email === e)?.name || e);
  const first = names.find((n) => n.email === result.sent[0])?.name?.split(" ")[0] ?? after?.clientName ?? "them";

  async function remind(days: number) {
    if (!after) return;
    setFollow({ busy: days, msg: null, ok: true });
    const r = await followUpToTask({
      key: `quote-follow-up:${quoteId}:v${result.versionNumber}`, title: `Follow up quote Q-${quoteNumber} with ${first}`,
      dueIso: followUpTime(days, after.tz), eventId: after.eventId, customerId: after.clientId,
    }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setFollow({ busy: null, ok: r.ok, msg: r.ok ? (r.message ?? "Added to your to-do list.") : r.error });
  }

  return (
    <div className="overflow-y-auto p-6 sm:p-10">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <span className={cn("mx-auto grid h-14 w-14 place-items-center rounded-full", sent ? "bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50" : "bg-rose-50 text-rose-600")}>
            {sent ? <Check className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
          </span>
          <p className="mt-4 text-[1.25rem] font-semibold tracking-tight text-ink">{sent ? `Quote Q-${quoteNumber} is on its way` : "Nothing was sent"}</p>
          {sent && (
            <p className="mt-1 text-[0.875rem] text-ink-muted">
              Sent to {who.join(", ")}{result.published ? ` · version ${result.versionNumber} published` : ""}. You&apos;ll see when it&apos;s opened under <b className="font-medium text-ink">Sent emails</b> on this quote.
            </p>
          )}
        </div>
        {result.failed.length > 0 && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-left text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-200">
            {result.failed.map((f) => <p key={f.email}><b>{f.email}</b>: {f.error}</p>)}
          </div>
        )}

        {after && (
          <div className="mt-6 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={after.emailsHref} className="flex items-center gap-3 rounded-xl bg-brand-600 px-4 py-3 text-white shadow-sm hover:bg-brand-700">
                <ArrowLeft className="h-5 w-5 shrink-0" />
                <span className="min-w-0"><span className="block text-[0.875rem] font-semibold">{after.emailsLabel ?? `Back to ${after.clientName}'s emails`}</span><span className="block text-[0.72rem] text-white/80">See the conversation with this quote in it</span></span>
              </Link>
              <Link href={`/clients/${after.clientId}`} className="flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                <UserRound className="h-5 w-5 shrink-0 text-ink-faint" />
                <span className="min-w-0"><span className="block truncate text-[0.875rem] font-semibold text-ink">Open {after.clientName}</span><span className="block text-[0.72rem] text-ink-muted">Their jobs, quotes, invoices and people</span></span>
              </Link>
            </div>
            {sent && (
              <div className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink"><BellRing className="h-4 w-4 text-ink-faint" />Remind me to follow up if {first} hasn&apos;t replied</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FOLLOW_UPS.map((f) => (
                    <button key={f.days} type="button" disabled={follow.busy !== null || (follow.ok && !!follow.msg)} onClick={() => remind(f.days)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[0.78rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50 disabled:opacity-60">
                      {follow.busy === f.days && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{f.label}
                    </button>
                  ))}
                </div>
                {follow.msg && <p className={cn("mt-2 text-[0.75rem]", follow.ok ? "text-emerald-700" : "text-rose-700")}>{follow.msg}</p>}
                <p className="mt-1.5 text-[0.7rem] text-ink-faint">Adds a to-do at 9am (skipping weekends) with a calendar reminder, linked to this job.</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <Button variant={after ? "ghost" : "primary"} onClick={onDone}>{after ? "Stay on this quote" : "Done"}</Button>
        </div>
      </div>
    </div>
  );
}
