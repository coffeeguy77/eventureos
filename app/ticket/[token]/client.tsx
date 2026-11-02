"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Circle, CreditCard, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { quoteLight, type QuoteStatus } from "@/lib/nerdherd/quotes";
import { acceptQuote, clientTicketReply, declineQuote } from "./actions";

export interface ClientQuote { id: string; seq: number; kind: "quote" | "variation"; title: string; description: string | null; amount: number; status: QuoteStatus; payUrl: string | null; tasks: { id: string; label: string; done: boolean }[] }
export interface ClientUpdate { id: string; mine: boolean; who: string; body: string; at: string }

const fmt = (n: number, c: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency: c }).format(n);

/** What the client sees: the quote to accept and pay, the steps ticked off as we go (no hours), and the conversation. */
export function ClientTicket({ token, business, logo, accent, currency, tz, number, subject, status, done, domain, name, quotes, updates, portal }: {
  token: string; business: string; logo: string | null; accent: string; currency: string; tz: string; number: number; subject: string; status: string; done: boolean; domain: string | null;
  name: string | null; quotes: ClientQuote[]; updates: ClientUpdate[]; portal: string;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="h-36 w-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)` }} />
      <div className="mx-auto -mt-24 max-w-2xl space-y-4 px-4 pb-16">
        <div className="rounded-3xl bg-surface p-5 shadow-xl ring-1 ring-line sm:p-7">
          <div className="flex items-center justify-between gap-3">
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt={business} className="h-10 max-w-[180px] object-contain" />
              : <span className="text-[1rem] font-bold text-ink">{business}</span>}
            <span className={cn("rounded-full px-3 py-1 text-[0.75rem] font-semibold", done ? "bg-emerald-500/15 text-emerald-600" : "bg-ink/10 text-ink")}>{status}</span>
          </div>
          <p className="mt-5 text-[0.8125rem] font-medium text-ink-muted">Support ticket #{number}{domain ? ` · ${domain}` : ""}</p>
          <h1 className="mt-0.5 text-[1.5rem] font-bold leading-tight text-ink">{subject}</h1>
          {name && <p className="mt-1 text-[0.875rem] text-ink-muted">Hi {name.split(" ")[0]} 👋</p>}
        </div>

        {quotes.map((q) => <QuoteCard key={q.id} q={q} token={token} accent={accent} currency={currency} onChanged={() => router.refresh()} />)}

        <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-7">
          <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><MessageSquare className="h-5 w-5" style={{ color: accent }} />Messages</h2>
          {updates.length === 0 ? <p className="mt-3 text-[0.875rem] text-ink-muted">No messages yet.</p> : (
            <ol className="mt-4 space-y-3">
              {updates.map((u) => (
                <li key={u.id} className={cn("max-w-[92%] rounded-2xl px-4 py-3", u.mine ? "ml-auto bg-canvas ring-1 ring-line" : "text-white")} style={u.mine ? undefined : { background: accent }}>
                  <p className={cn("text-[0.6875rem] font-semibold", u.mine ? "text-ink-faint" : "text-white/80")}>{u.who} · {when(u.at)}</p>
                  <p className={cn("mt-1 whitespace-pre-wrap break-words text-[0.9375rem]", u.mine ? "text-ink" : "text-white")}>{u.body}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 space-y-2">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="min-h-[96px] w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[0.9375rem] text-ink focus:outline-none focus:ring-2" />
            {msg && <p className={cn("text-[0.8125rem] font-medium", msg.ok ? "text-emerald-600" : "text-rose-600")}>{msg.text}</p>}
            <button disabled={pending || reply.trim().length < 2} onClick={() => start(async () => { const r = await clientTicketReply(token, reply); if (r.ok) { setReply(""); setMsg({ ok: true, text: "Sent — we'll get back to you." }); router.refresh(); } else setMsg({ ok: false, text: r.error }); })}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-6" style={{ background: accent }}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
            </button>
          </div>
        </div>
        <a href={portal} className="block rounded-2xl bg-surface p-4 text-center text-[0.875rem] ring-1 ring-line hover:ring-2"><span className="font-semibold text-ink">Your client portal</span><span className="block text-ink-muted">All your tickets, quotes and invoices</span></a>
        <p className="text-center text-[0.75rem] text-ink-faint">{business} · powered by EventureOS</p>
      </div>
    </div>
  );
}

function QuoteCard({ q, token, accent, currency, onChanged }: { q: ClientQuote; token: string; accent: string; currency: string; onChanged: () => void }) {
  const [step, setStep] = useState<"view" | "accept" | "decline">("view");
  const [who, setWho] = useState("");
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const L = quoteLight(q.status);
  const done = q.tasks.filter((t) => t.done).length;
  const working = q.status === "paid" || q.status === "completed";
  return (
    <div className={cn("overflow-hidden rounded-3xl bg-surface shadow-sm ring-1", q.status === "sent" ? "ring-2" : "ring-line")} style={q.status === "sent" ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{q.kind === "variation" ? `Variation ${q.seq} — extra work` : "Quote"}</p>
            <h2 className="mt-0.5 text-[1.25rem] font-bold leading-snug text-ink">{q.title}</h2>
          </div>
          <div className="text-right"><p className="text-[1.5rem] font-bold tabular text-ink">{fmt(q.amount, currency)}</p><p className="text-[0.75rem] text-ink-muted">inc GST</p></div>
        </div>
        {q.description && <p className="mt-4 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">{q.description}</p>}

        {q.tasks.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{working ? `Progress — ${done} of ${q.tasks.length} done` : "What we'll do"}</p>
            {working && <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full transition-all" style={{ width: `${(done / q.tasks.length) * 100}%`, background: accent }} /></div>}
            <ul className="space-y-1.5">
              {q.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 text-[0.9375rem]">
                  {working && t.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />}
                  <span className={cn("text-ink", working && t.done && "text-ink-muted")}>{t.label}{working && t.done ? <span className="ml-2 text-[0.75rem] font-semibold text-emerald-600">Completed</span> : null}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-canvas/60 p-5 sm:px-7">
        {q.status === "sent" && step === "view" && (
          <div className="space-y-3">
            <p className="text-[0.875rem] text-ink-muted">We start as soon as it&apos;s accepted and paid.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button onClick={() => setStep("accept")} className="flex h-14 items-center justify-center gap-2 rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg" style={{ background: accent }}><Check className="h-5 w-5" />Accept &amp; pay {fmt(q.amount, currency)}</button>
              <button onClick={() => setStep("decline")} className="h-12 rounded-2xl px-5 text-[0.9375rem] font-medium text-ink-muted ring-1 ring-line sm:h-14">Not now</button>
            </div>
          </div>
        )}
        {q.status === "sent" && step === "accept" && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { setError(null); const r = await acceptQuote(token, q.id, who); if (r.ok) window.location.href = r.payUrl; else setError(r.error); }); }}>
            <label className="block text-[0.875rem] font-medium text-ink">Your name<input value={who} onChange={(e) => setWho(e.target.value)} autoComplete="name" className="mt-1 h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[1rem] text-ink" /></label>
            <label className="flex items-start gap-2.5 text-[0.875rem] text-ink"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5" />I accept this quote and will pay {fmt(q.amount, currency)} inc GST now, before the work starts.</label>
            {error && <p className="text-[0.875rem] font-medium text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("view")} className="h-12 rounded-xl px-5 font-medium text-ink ring-1 ring-line">Back</button>
              <button disabled={pending || !agree || who.trim().length < 2} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: accent }}>{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}Accept and go to payment</button>
            </div>
          </form>
        )}
        {q.status === "sent" && step === "decline" && (
          <div className="space-y-3">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Anything you'd like changed? (optional)" className="min-h-[90px] w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink" />
            {error && <p className="text-[0.875rem] font-medium text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep("view")} className="h-12 rounded-xl px-5 font-medium text-ink ring-1 ring-line">Back</button>
              <button disabled={pending} onClick={() => start(async () => { const r = await declineQuote(token, q.id, reason); if (r.ok) onChanged(); else setError(r.error); })} className="h-12 flex-1 rounded-xl font-semibold text-ink ring-1 ring-line-strong">Decline this quote</button>
            </div>
          </div>
        )}
        {q.status === "accepted" && (
          <div className="space-y-3">
            <p className="text-[0.875rem] font-medium text-ink">Accepted — thank you. Payment is needed before we start.</p>
            {q.payUrl && <a href={q.payUrl} className="flex h-14 items-center justify-center gap-2 rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg" style={{ background: accent }}><CreditCard className="h-5 w-5" />Pay {fmt(q.amount, currency)}</a>}
          </div>
        )}
        {(q.status === "paid" || q.status === "completed" || q.status === "declined") && <p className={cn("text-[0.9375rem] font-semibold", q.status === "declined" ? "text-ink-muted" : "text-emerald-600")}>{L.client}{q.status === "paid" ? " — we'll let you know when it's finished." : q.status === "completed" ? " — thanks for your business!" : ""}</p>}
      </div>
    </div>
  );
}
