"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown, BellPlus, FileText, Sparkles, X } from "lucide-react";
import { DateTimeField } from "@/components/ui/datetime-field";
import { addTask } from "@/app/(app)/tasks/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION } from "@/lib/status";
import { fmtDateTime, relative } from "@/lib/format";
import type { EmailMessage, EmailThread } from "@/lib/types";
import { cn } from "@/lib/cn";
import { discardSavedDraft, draftReplyAction, replyRecipients, replySignaturePreview, sendReply, startQuoteFromThread, type ReplyState, type SignaturePreviewState } from "@/app/(app)/inbox-actions";
import { useRouter } from "next/navigation";

export function Conversation({ threads, messages, tz, orgName, gmailConnected, originalLabel = "First email" }: {
  threads: EmailThread[]; messages: EmailMessage[]; tz: string; orgName: string; gmailConnected: boolean;
  /** Badge on the earliest email (e.g. "Original enquiry"). */
  originalLabel?: string;
}) {
  const [flash, setFlash] = useState(false);
  if (threads.length === 0) {
    return (
      <div className="px-5 pb-5">
        <p className="text-[0.7812rem] text-ink-muted">No email conversation linked yet.</p>
        <NotConnectedHint connected={gmailConnected} empty />
      </div>
    );
  }
  // The very first email across every linked thread is the one that started it all
  const original = messages.reduce<EmailMessage | null>((a, m) => (!a || m.sent_at < a.sent_at ? m : a), null);
  const anchor = original ? `email-${original.id}` : null;
  const jump = () => {
    if (!anchor) return;
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  };
  // Threads with the latest activity first
  const ordered = [...threads].sort((a, b) => lastAt(b, messages).localeCompare(lastAt(a, messages)));
  return (
    <div className="space-y-3 px-5 pb-5">
      {messages.length > 1 && (
        <div className="flex items-center justify-between gap-3 text-[0.75rem] text-ink-faint">
          <span>{messages.length} emails · newest first</span>
          <button type="button" onClick={jump} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
            <ArrowDown className="h-3.5 w-3.5" />Jump to {originalLabel.toLowerCase()}
          </button>
        </div>
      )}
      <div className="space-y-5">
      {ordered.map((t) => {
        // Newest at the top — scroll down to go back in time
        const msgs = messages.filter((m) => m.thread_id === t.id).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
        const c = CLASSIFICATION[t.classification];
        return (
          <section key={t.id} className="rounded-xl border border-line">
            <header className="flex flex-wrap items-center gap-2 border-b border-line bg-zinc-50/60 px-4 py-2.5">
              <h4 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-ink">{t.subject ?? "(no subject)"}</h4>
              <Badge tone={c.tone}>{c.label}{t.classification_confidence != null && t.classification === "needs_review" ? ` · ${Math.round(t.classification_confidence * 100)}%` : ""}</Badge>
              {t.state === "needs_reply" && <Badge tone="red" dot>Needs reply</Badge>}
              {t.state === "awaiting_customer" && <Badge tone="neutral">Awaiting customer</Badge>}
              {savedDraft(t) && <Badge tone="amber">Draft ready</Badge>}
            </header>
            {gmailConnected && t.classification !== "spam" && <ReplyBox threadId={t.id} saved={savedDraft(t)} orgName={orgName} thread={t} />}
            <ol className="divide-y divide-line">
              {msgs.map((m, i) => {
                const out = m.direction === "outbound";
                const isOriginal = m.id === original?.id;
                return (
                  <li key={m.id} id={`email-${m.id}`}
                    className={cn("flex scroll-mt-24 gap-3 px-4 py-3.5 transition-colors duration-700", out && "bg-brand-50/30", isOriginal && flash && "bg-amber-50")}>
                    <Avatar name={out ? orgName : m.from_name ?? m.from_email} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cn("min-w-0 break-words text-[0.8125rem] text-ink", !m.is_read && "font-semibold")}>{m.from_name ?? m.from_email}</span>
                        <span className="min-w-0 break-all text-[0.75rem] text-ink-faint">{out ? `to ${m.to_emails.join(", ")}` : m.from_email}</span>
                        {i === 0 && msgs.length > 1 && <Badge tone="blue">Latest</Badge>}
                        {isOriginal && <Badge tone="brand">{originalLabel}</Badge>}
                        <span suppressHydrationWarning className="ml-auto text-[0.7188rem] text-ink-faint" title={fmtDateTime(m.sent_at, tz)}>{relative(m.sent_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line break-words text-[0.8125rem] leading-relaxed text-ink-muted">{m.body_text ?? m.snippet}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      </div>
      {!gmailConnected && <NotConnectedHint connected={false} />}
    </div>
  );
}

function lastAt(t: EmailThread, messages: EmailMessage[]) {
  return messages.reduce((a, m) => (m.thread_id === t.id && m.sent_at > a ? m.sent_at : a), "");
}

export interface SavedDraft { body: string; notes: string[]; drafted_at: string | null; by: string | null; quote_url: string | null }

/** A reply draft saved on the conversation (e.g. prepared overnight), if there is one. */
function savedDraft(t: EmailThread): SavedDraft | null {
  const d = (t.extracted?.reply_draft ?? null) as Record<string, unknown> | null;
  if (!d || typeof d.body !== "string" || !d.body.trim()) return null;
  return {
    body: d.body, notes: Array.isArray(d.notes) ? d.notes.map(String).slice(0, 8) : [],
    drafted_at: typeof d.drafted_at === "string" ? d.drafted_at : null, by: typeof d.by === "string" ? d.by : null,
    quote_url: typeof d.quote_url === "string" && d.quote_url.startsWith("/quotes/") ? d.quote_url : null,
  };
}

function ReplyBox({ threadId, saved, orgName, thread }: { threadId: string; saved?: SavedDraft | null; orgName: string; thread: EmailThread }) {
  const [followUp, setFollowUp] = useState(false);
  const [open, setOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply.bind(null, threadId), undefined);
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const router = useRouter();
  const [quoting, setQuoting] = useState(false);
  async function replyWithQuote() {
    setQuoting(true); setDraftError(null);
    const r = await startQuoteFromThread(threadId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    if (!r.ok) { setQuoting(false); setDraftError(r.error); return; }
    router.push(r.url);
  }
  useEffect(() => {
    if (state?.ok) { formRef.current?.reset(); setBody(""); setDraftNotes([]); setOpen(false); setSig(null); setRcpt(null); }
  }, [state]);
  // The signature this reply will get (loaded when the box opens)
  const [sig, setSig] = useState<SignaturePreviewState | null>(null);
  const [withSig, setWithSig] = useState(true);
  useEffect(() => {
    if (!open || sig) return;
    let live = true;
    replySignaturePreview(threadId).then((r) => { if (live) setSig(r); }).catch(() => {});
    return () => { live = false; };
  }, [open, sig, threadId]);
  // Who it goes to: the customer, plus the job's people in this conversation (removable)
  const [rcpt, setRcpt] = useState<{ to: string | null; cc: string[] } | null>(null);
  const [cc, setCc] = useState<string[]>([]);
  useEffect(() => {
    if (!open || rcpt) return;
    let live = true;
    replyRecipients(threadId).then((r) => { if (live) { setRcpt(r); setCc(r.cc); } }).catch(() => {});
    return () => { live = false; };
  }, [open, rcpt, threadId]);
  async function draft() {
    setDrafting(true); setDraftError(null);
    const r = await draftReplyAction(threadId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    setDrafting(false);
    if (!r.ok) { setDraftError(r.error); return; }
    setBody(r.body); setDraftNotes(r.notes); setOpen(true);
  }

  if (!open) {
    return (<>
      {saved && !state?.ok && (
        // The prepared reply shown in the thread, as the newest message — not sent until you press Send
        <div className="border-b border-line bg-amber-50/50 px-4 py-3.5">
          <div className="flex gap-3">
            <Avatar name={orgName} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[0.8125rem] font-semibold text-ink">Draft reply</span>
                <Badge tone="amber">Not sent</Badge>
                <span className="text-[0.7188rem] text-ink-faint">{saved.by ? `Prepared by ${saved.by}` : "Prepared"}{saved.drafted_at ? ` · ${relative(saved.drafted_at)}` : ""}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-line break-words text-[0.8125rem] leading-relaxed text-ink">{saved.body}</p>
              {saved.notes.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-100/60 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-200">
                  <p className="mb-1 font-semibold">Check before sending (only you see this)</p>
                  <ul className="space-y-1">{saved.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
                </div>
              )}
              {saved.quote_url && <p className="mt-2 text-[0.75rem] text-ink-muted">A <Link href={saved.quote_url} className="font-medium text-brand-700 underline underline-offset-2">draft quote</Link> with these prices is ready too.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" className="h-10 sm:h-8" onClick={() => { setBody(saved.body); setDraftNotes(saved.notes); setOpen(true); }}>Edit &amp; send</Button>
                <Button size="sm" variant="ghost" className="h-10 sm:h-8" disabled={discarding} onClick={async () => {
                  setDiscarding(true);
                  const r = await discardSavedDraft(threadId).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
                  setDiscarding(false);
                  if (!r.ok) setDraftError(r.error); else router.refresh();
                }}>{discarding ? "Discarding…" : "Discard draft"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="min-w-0 text-[0.75rem] text-ink-faint">
          {state?.ok ? `Sent to ${state.sentTo} via Gmail.` : "Replies send from your connected Gmail and stay in Gmail."}
        </span>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-10 sm:h-8" onClick={() => setFollowUp((f) => !f)} aria-expanded={followUp}>
            <BellPlus className="h-3.5 w-3.5 text-brand-600" />Follow up later
          </Button>
          <Button size="sm" variant="ghost" className="h-10 sm:h-8" onClick={replyWithQuote} disabled={quoting}>
            <FileText className="h-3.5 w-3.5 text-brand-600" />{quoting ? "Opening…" : "Reply with quote"}
          </Button>
          <Button size="sm" variant="ghost" className="h-10 sm:h-8" onClick={draft} disabled={drafting}>
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />{drafting ? "Drafting…" : "Draft with AI"}
          </Button>
          <Button size="sm" variant="secondary" className="h-10 sm:h-8" onClick={() => setOpen(true)}>Reply</Button>
        </div>
      </div>
      {followUp && <FollowUpLater thread={thread} onDone={() => setFollowUp(false)} />}
      {draftError && <p role="alert" className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700 ring-1 ring-inset ring-rose-100">{draftError}</p>}
    </>);
  }
  return (
    <form ref={formRef} action={action} className="border-b border-line px-4 py-3">
      {draftNotes.length > 0 && (
        <ul className="mb-2 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-100">
          {draftNotes.map((n, i) => <li key={i}>• {n}</li>)}
        </ul>
      )}
      {rcpt && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-ink-muted">
          <span>To <b className="font-medium text-ink">{rcpt.to ?? "—"}</b></span>
          {rcpt.cc.length > 0 && <>
            <input type="hidden" name="cc_shown" value="1" />
            <span className="ml-1">Cc</span>
            {rcpt.cc.map((e) => cc.includes(e) ? (
              <span key={e} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2 pr-1 text-ink">
                <input type="hidden" name="cc" value={e} />{e}
                <button type="button" aria-label={`Don't copy in ${e}`} onClick={() => setCc((x) => x.filter((y) => y !== e))} className="rounded-full p-0.5 text-ink-faint hover:bg-zinc-200 hover:text-ink"><X className="h-3 w-3" /></button>
              </span>
            ) : (
              <button key={e} type="button" onClick={() => setCc((x) => [...x, e])} className="rounded-full px-2 py-0.5 text-ink-faint line-through hover:text-ink">{e}</button>
            ))}
            <span className="text-ink-faint">· people on this job in the conversation</span>
          </>}
        </div>
      )}
      <textarea name="body" rows={body ? 14 : 4} autoFocus required placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      <SignatureStrip sig={sig} on={withSig} onChange={setWithSig} />
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700 ring-1 ring-inset ring-rose-100">{state.error}</p>}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-[0.75rem] text-ink-faint">Sent through your Gmail account, in the same Gmail thread.</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
        </div>
      </div>
    </form>
  );
}

function SignatureStrip({ sig, on, onChange }: { sig: SignaturePreviewState | null; on: boolean; onChange: (v: boolean) => void }) {
  const [show, setShow] = useState(false);
  if (!sig) return <p className="mt-2 text-[0.75rem] text-ink-faint">Checking your signature…</p>;
  if (!sig.ok) {
    return (
      <p className="mt-2 text-[0.75rem] text-ink-faint">
        {sig.reason === "unpublished" ? "No email signature yet — this reply goes without one. " : `Signature unavailable: ${sig.message}. `}
        {sig.canEdit ? <Link href="/settings/signatures" className="font-medium text-brand-600 hover:text-brand-700">Set up signatures</Link>
          : sig.reason === "unpublished" ? "Ask an admin to publish the company signature." : null}
      </p>
    );
  }
  return (
    <div className="mt-2">
      <input type="hidden" name="signature" value={on ? "on" : "off"} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
        <label className="inline-flex cursor-pointer items-center gap-2 text-ink">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand-500" />
          Add my signature <span className="text-ink-faint">({sig.variant === "full" ? "full" : "short reply version"})</span>
        </label>
        {on && <button type="button" onClick={() => setShow((x) => !x)} className="font-medium text-brand-600 hover:text-brand-700">{show ? "Hide" : "Preview"}</button>}
        <Link href="/my-signature" className="text-ink-faint hover:text-ink">Edit my details</Link>
      </div>
      {/* Our renderer escapes every value and only allows https/mailto/tel links */}
      {on && show && <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white p-3 [color-scheme:light]" dangerouslySetInnerHTML={{ __html: sig.html }} />}
    </div>
  );
}

function NotConnectedHint({ connected, empty }: { connected: boolean; empty?: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-zinc-50/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 flex-1 basis-56 text-[0.75rem] text-ink-faint">
          {connected
            ? empty ? "Emails with this customer will appear here automatically after the next Gmail sync." : "Replies send from your connected Gmail and stay in Gmail."
            : "Gmail isn’t connected yet. Once it is, you can reply from here — replies send through your own Gmail and thread back automatically."}
        </span>
        {!connected && (
          <Link href="/settings/integrations" className="shrink-0 text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">Connect Gmail</Link>
        )}
      </div>
    </div>
  );
}

/** "Follow up later": a to-do linked to this conversation, with a reminder in the calendar at that time. */
function FollowUpLater({ thread, onDone }: { thread: EmailThread; onDone: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} className="space-y-2 border-b border-line bg-brand-50/40 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const due = String(fd.get("due") ?? "");
        if (!due) { setMsg({ text: "Pick when to follow up.", ok: false }); return; }
        setPending(true);
        const r = await addTask({
          title: String(fd.get("title") ?? "").trim() || `Follow up: ${thread.subject ?? "email"}`, notes: String(fd.get("notes") ?? ""),
          dueIso: due, remind: true, enquiryId: thread.enquiry_id, eventId: thread.event_id, customerId: thread.customer_id,
        }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
        setPending(false);
        setMsg(r.ok ? { text: r.message ?? "Added to the to-do list.", ok: true } : { text: r.error, ok: false });
        if (r.ok) { router.refresh(); setTimeout(onDone, 1800); }
      }}>
      <p className="text-[0.75rem] font-medium text-ink">Follow up later — adds a to-do and a reminder in the calendar</p>
      <input name="title" defaultValue={`Follow up: ${thread.subject ?? "email"}`} maxLength={300} aria-label="What to follow up"
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[0.8125rem] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-60"><DateTimeField name="due" /></div>
        <input name="notes" placeholder="Note for yourself (optional)" maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[0.8125rem] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
        </div>
      </div>
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </form>
  );
}
