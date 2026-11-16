"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { brokerMessage, requestBrokerLink } from "./actions";
import type { LoanMsg } from "@/lib/loans/server";

const box = "h-11 w-full rounded-lg border border-line bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function BrokerSignIn({ error }: { error: string | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(error);
  const [pending, start] = useTransition();
  if (sent) return (
    <div className="text-center">
      <Mail className="mx-auto h-8 w-8 text-brand-600" />
      <p className="mt-3 font-semibold">Check your email</p>
      <p className="mt-1 text-[0.875rem] text-ink-muted">If {email} has access, a sign-in link is on its way. It works once, for 20 minutes.</p>
      <button type="button" onClick={() => setSent(false)} className="mt-4 text-[0.8125rem] text-ink-muted underline">Use a different email</button>
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await requestBrokerLink(email); if (r.ok) setSent(true); else setErr(r.error); }); }}>
      <label htmlFor="b-email" className="mb-1 block text-[0.8125rem] font-medium">Your email</label>
      <input id="b-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={box} />
      {err && <p className="mt-2 text-[0.8125rem] text-rose-700">{err}</p>}
      <button type="submit" disabled={pending} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white disabled:opacity-60">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Email me a sign-in link
      </button>
      <p className="mt-3 text-center text-[0.75rem] text-ink-faint">No password — we email you a one-time link.</p>
    </form>
  );
}

/** Keep the page current while it's open (answers, documents, messages). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return null;
}

export function BrokerMessages({ fileId, msgs, preview, clientName }: { fileId: string; msgs: LoanMsg[]; preview: boolean; clientName: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);
  const shown = msgs.filter((m) => m.from_side !== "system");
  return (
    <div className="flex max-h-[460px] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="text-[0.8125rem] text-ink-muted">No messages yet.</p>}
        {shown.map((m) => (
          <div key={m.id} className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-[0.875rem]", m.from_side === "broker" ? "ml-auto bg-brand-600 text-white" : "bg-canvas text-ink ring-1 ring-inset ring-line")}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-0.5 text-[0.6875rem] opacity-70">{m.from_side === "client" ? clientName : m.author ?? ""} · {new Date(m.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {err && <p className="mt-2 text-[0.8125rem] text-rose-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <textarea rows={2} value={text} disabled={preview} onChange={(e) => setText(e.target.value)} placeholder={preview ? "Brokers can message the client here" : `Message ${clientName}…`} className={cn(box, "h-auto flex-1 resize-none py-2")} />
        <button type="button" disabled={preview || pending || !text.trim()} aria-label="Send" onClick={() => start(async () => { setErr(null); const r = await brokerMessage(fileId, text); if (!r.ok) { setErr(r.error); return; } setText(""); router.refresh(); })}
          className="inline-flex w-12 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}
