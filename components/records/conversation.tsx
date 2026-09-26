"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLASSIFICATION } from "@/lib/status";
import { fmtDateTime, relative } from "@/lib/format";
import type { EmailMessage, EmailThread } from "@/lib/types";
import { cn } from "@/lib/cn";
import { draftReplyAction, sendReply, type ReplyState } from "@/app/(app)/inbox-actions";

export function Conversation({ threads, messages, tz, orgName, gmailConnected }: {
  threads: EmailThread[]; messages: EmailMessage[]; tz: string; orgName: string; gmailConnected: boolean;
}) {
  if (threads.length === 0) {
    return (
      <div className="px-5 pb-5">
        <p className="text-[12.5px] text-ink-muted">No email conversation linked yet.</p>
        <NotConnectedHint connected={gmailConnected} empty />
      </div>
    );
  }
  return (
    <div className="space-y-5 px-5 pb-5">
      {threads.map((t) => {
        const msgs = messages.filter((m) => m.thread_id === t.id).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
        const c = CLASSIFICATION[t.classification];
        return (
          <section key={t.id} className="rounded-xl border border-line">
            <header className="flex flex-wrap items-center gap-2 border-b border-line bg-zinc-50/60 px-4 py-2.5">
              <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{t.subject ?? "(no subject)"}</h4>
              <Badge tone={c.tone}>{c.label}{t.classification_confidence != null && t.classification === "needs_review" ? ` · ${Math.round(t.classification_confidence * 100)}%` : ""}</Badge>
              {t.state === "needs_reply" && <Badge tone="red" dot>Needs reply</Badge>}
              {t.state === "awaiting_customer" && <Badge tone="neutral">Awaiting customer</Badge>}
            </header>
            <ol className="divide-y divide-line">
              {msgs.map((m) => {
                const out = m.direction === "outbound";
                return (
                  <li key={m.id} className={cn("flex gap-3 px-4 py-3.5", out && "bg-brand-50/30")}>
                    <Avatar name={out ? orgName : m.from_name ?? m.from_email} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={cn("min-w-0 break-words text-[13px] text-ink", !m.is_read && "font-semibold")}>{m.from_name ?? m.from_email}</span>
                        <span className="min-w-0 break-all text-[12px] text-ink-faint">{out ? `to ${m.to_emails.join(", ")}` : m.from_email}</span>
                        <span suppressHydrationWarning className="ml-auto text-[11.5px] text-ink-faint" title={fmtDateTime(m.sent_at, tz)}>{relative(m.sent_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink-muted">{m.body_text ?? m.snippet}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {gmailConnected && t.classification !== "spam" && <ReplyBox threadId={t.id} />}
          </section>
        );
      })}
      {!gmailConnected && <NotConnectedHint connected={false} />}
    </div>
  );
}

function ReplyBox({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply.bind(null, threadId), undefined);
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) { formRef.current?.reset(); setBody(""); setDraftNotes([]); setOpen(false); }
  }, [state]);
  async function draft() {
    setDrafting(true); setDraftError(null);
    const r = await draftReplyAction(threadId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    setDrafting(false);
    if (!r.ok) { setDraftError(r.error); return; }
    setBody(r.body); setDraftNotes(r.notes); setOpen(true);
  }

  if (!open) {
    return (<>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <span className="min-w-0 text-[12px] text-ink-faint">
          {state?.ok ? `Sent to ${state.sentTo} via Gmail.` : "Replies send from your connected Gmail and stay in Gmail."}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" className="h-10 sm:h-8" onClick={draft} disabled={drafting}>
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />{drafting ? "Drafting…" : "Draft with AI"}
          </Button>
          <Button size="sm" variant="secondary" className="h-10 sm:h-8" onClick={() => setOpen(true)}>Reply</Button>
        </div>
      </div>
      {draftError && <p role="alert" className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 ring-1 ring-inset ring-rose-100">{draftError}</p>}
    </>);
  }
  return (
    <form ref={formRef} action={action} className="border-t border-line px-4 py-3">
      {draftNotes.length > 0 && (
        <ul className="mb-2 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-inset ring-amber-100">
          {draftNotes.map((n, i) => <li key={i}>• {n}</li>)}
        </ul>
      )}
      <textarea name="body" rows={body ? 14 : 4} autoFocus required placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y rounded-lg border border-line-strong bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 ring-1 ring-inset ring-rose-100">{state.error}</p>}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-[12px] text-ink-faint">Sent through your Gmail account, in the same Gmail thread.</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
        </div>
      </div>
    </form>
  );
}

function NotConnectedHint({ connected, empty }: { connected: boolean; empty?: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-zinc-50/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 flex-1 basis-56 text-[12px] text-ink-faint">
          {connected
            ? empty ? "Emails with this customer will appear here automatically after the next Gmail sync." : "Replies send from your connected Gmail and stay in Gmail."
            : "Gmail isn’t connected yet. Once it is, you can reply from here — replies send through your own Gmail and thread back automatically."}
        </span>
        {!connected && (
          <Link href="/settings/integrations" className="shrink-0 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Connect Gmail</Link>
        )}
      </div>
    </div>
  );
}
