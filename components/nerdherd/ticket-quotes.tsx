"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Eye, EyeOff, Loader2, Mail, Pencil, Plus, Send, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { priceFor, quoteLight, sumHours, type Light, type QuoteStatus } from "@/lib/nerdherd/quotes";
import {
  addTicketPerson, cancelTicketQuote, draftQuoteWithAI, emailTicketReply, notifyQuoteDone, quoteSendDraft, removeTicketPerson, saveTicketQuote, sendTicketQuote, tickQuoteTask, ticketPeople,
  type Person, type Recipient,
} from "@/app/(app)/nerd-herd/quote-actions";

export interface QuoteTaskView { id: string; label: string; hours: number; done_at: string | null; done_by: string | null }
export interface QuoteView {
  id: string; seq: number; kind: "quote" | "variation"; title: string; description: string | null; hours: number; rate: number; amount: number; status: QuoteStatus;
  ai_hours: number | null; ai_notes: string | null; ai_description: string | null; invoice: { id: string; number: string | null; status: string } | null;
  ai_job?: boolean; ai_request?: string | null; ai_job_id?: string | null; ai_job_number?: number | null; ai_job_status?: string | null;
  sent_at: string | null; send_count: number; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number; accepted_at: string | null; accepted_by: string | null; paid_at: string | null; completed_at: string | null; client_notified_at: string | null;
  tasks: QuoteTaskView[];
}
export interface ViewRow { who: string | null; what: "ticket" | "quote"; at: string; quote_id: string | null }

const DOT: Record<Light, string> = { grey: "bg-zinc-400", amber: "bg-amber-500", red: "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.18)]", green: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]", done: "bg-sky-500", off: "bg-zinc-300" };
const when = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const label = (q: { kind: string; seq: number }) => (q.kind === "variation" ? `Variation ${q.seq}` : `Quote ${q.seq}`);
const StaffOnly = () => <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6562rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"><EyeOff className="h-3 w-3" />Staff only</span>;

/** Quotes & variations on a ticket: write (Claude drafts), send / nudge, see who opened it, red until paid, then tick off the work. */
export function TicketQuotes({ ticketId, ticketNumber, hasClient, defaultRate, currency, tz, quotes, views, needsMigration, aiSite = null }: {
  ticketId: string; ticketNumber: number; hasClient: boolean; defaultRate: number; currency: string; tz: string; quotes: QuoteView[]; views: ViewRow[]; needsMigration: boolean;
  /** the ticket's website, when it's connected to the Web Culture Connector (AI maintenance can do the work) */
  aiSite?: { domain: string } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<QuoteView | "new" | null>(null);
  const [sending, setSending] = useState<{ mode: "quote" | "done" | "email"; quote?: QuoteView } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const live = quotes.filter((q) => !["cancelled", "declined"].includes(q.status));
  const ticketViews = views.filter((v) => v.what === "ticket");

  if (needsMigration) return <p className="rounded-lg bg-amber-500/15 px-3 py-2.5 text-[0.8125rem] text-amber-700 dark:text-amber-300">Quoting needs database update 0092 (ticket quotes).</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!hasClient} onClick={() => setEditing("new")}><Plus className="h-4 w-4" />{live.length ? "Add a variation" : "Quote the work"}</Button>
        <Button size="sm" disabled={!hasClient} onClick={() => setSending({ mode: "email" })}><Mail className="h-4 w-4" />Email the client</Button>
        {!hasClient && <span className="text-[0.75rem] text-ink-muted">Choose the client first (Details).</span>}
        {ticketViews.length > 0 && <span className="ml-auto inline-flex items-center gap-1 text-[0.7188rem] text-ink-muted"><Eye className="h-3.5 w-3.5" />Ticket opened {ticketViews.length}× · last {when(ticketViews[0].at, tz)}{ticketViews[0].who ? ` by ${ticketViews[0].who}` : ""}</span>}
      </div>
      {msg && <p className={cn("text-[0.7812rem] font-medium", msg.ok ? "text-emerald-600" : "text-rose-600")}>{msg.text}</p>}

      {quotes.length === 0 ? (
        <p className="rounded-xl bg-canvas px-4 py-4 text-[0.8125rem] text-ink-muted ring-1 ring-line">No quote yet. <strong className="text-ink">Quote the work</strong> — Claude reads the conversation and drafts the description, steps and hours for you. The client sees the description, the steps and the price — never the hours. Nothing starts until they&apos;ve paid.</p>
      ) : (
        <ul className="space-y-3">
          {quotes.map((q) => {
            const L = quoteLight(q.status);
            const qv = views.filter((v) => v.quote_id === q.id);
            const done = q.tasks.filter((t) => t.done_at).length;
            return (
              <li key={q.id} className={cn("overflow-hidden rounded-xl ring-1", L.light === "green" ? "ring-emerald-500/40" : L.light === "red" ? "ring-rose-500/30" : "ring-line", ["cancelled", "declined"].includes(q.status) && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", DOT[L.light])} title={L.label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.7188rem] font-semibold uppercase tracking-wide text-ink-faint">{label(q)}</p>
                    <p className="break-words text-[0.9375rem] font-semibold text-ink">{q.title}</p>
                    <p className={cn("text-[0.75rem] font-medium", L.light === "green" ? "text-emerald-600" : L.light === "red" ? "text-rose-600" : "text-ink-muted")}>{L.label}{q.invoice ? ` · invoice ${q.invoice.number ?? ""}` : ""}</p>
                    {q.ai_job && (q.ai_job_id
                      ? <Link href={`/nerd-herd/ai/${q.ai_job_id}`} className="mt-0.5 inline-flex items-center gap-1 text-[0.7188rem] font-medium text-brand-600 hover:underline"><Bot className="h-3.5 w-3.5" />AI-{q.ai_job_number}: {q.ai_job_status === "done" ? "done" : q.ai_job_status === "needs_attention" ? "needs checking" : q.ai_job_status === "failed" ? "failed" : "working"}</Link>
                      : <span className="mt-0.5 inline-flex items-center gap-1 text-[0.7188rem] text-ink-muted"><Bot className="h-3.5 w-3.5" />AI maintenance runs it once paid</span>)}
                  </div>
                  <div className="text-right">
                    <p className="text-[1.0625rem] font-bold tabular text-ink">{money(q.amount, currency, { cents: true })}</p>
                    <p className="flex items-center justify-end gap-1.5 text-[0.7188rem] text-ink-muted"><StaffOnly />{q.hours} h × {money(q.rate, currency)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-canvas/50 px-4 py-2 text-[0.7188rem] text-ink-muted">
                  {q.sent_at && <span>Sent {when(q.sent_at, tz)}{q.send_count > 1 ? ` · ${q.send_count - 1} reminder${q.send_count > 2 ? "s" : ""}` : ""}</span>}
                  {q.sent_at && (q.view_count ? <span className="font-medium text-ink">Opened {q.view_count}× · first {when(q.first_viewed_at, tz)} · last {when(q.last_viewed_at, tz)}{qv[0]?.who ? ` by ${qv[0].who}` : ""}</span> : <span className="text-amber-700 dark:text-amber-300">Not opened yet</span>)}
                  {q.accepted_at && <span>Accepted {when(q.accepted_at, tz)}{q.accepted_by ? ` by ${q.accepted_by}` : ""}</span>}
                  {q.paid_at && <span className="font-medium text-emerald-600">Paid {when(q.paid_at, tz)}</span>}
                  {q.completed_at && <span>Completed {when(q.completed_at, tz)}{q.client_notified_at ? " · client told" : ""}</span>}
                </div>

                {(q.status === "paid" || q.status === "completed") && (
                  <div className="border-t border-line px-4 py-3">
                    <p className="mb-2 flex items-center justify-between text-[0.75rem] font-semibold text-ink"><span>The work · {done} of {q.tasks.length} done</span><span className="font-normal text-ink-faint">client sees ticks, not hours</span></p>
                    <ul className="space-y-1">
                      {q.tasks.map((t) => (
                        <li key={t.id}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" checked={!!t.done_at} disabled={pending} onChange={(e) => start(async () => {
                              const r = await tickQuoteTask(t.id, e.target.checked);
                              if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
                              router.refresh();
                              if (r.data.allDone && e.target.checked) setSending({ mode: "done", quote: q });
                            })} />
                            <span className="min-w-0 flex-1"><span className={cn("block text-[0.875rem] text-ink", t.done_at && "text-ink-muted line-through")}>{t.label}</span>{t.done_at && <span className="block text-[0.6875rem] text-ink-faint">{t.done_by} · {when(t.done_at, tz)}</span>}</span>
                            <span className="shrink-0 text-[0.75rem] tabular text-ink-faint">{t.hours} h</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {q.ai_notes && ["draft", "sent"].includes(q.status) && <p className="border-t border-line bg-amber-500/5 px-4 py-2 text-[0.75rem] text-ink-muted"><StaffOnly /> <span className="ml-1">Claude suggested {q.ai_hours} h. {q.ai_notes}</span></p>}

                <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
                  {["draft", "sent"].includes(q.status) && <Button size="sm" onClick={() => setEditing(q)}><Pencil className="h-3.5 w-3.5" />Edit</Button>}
                  {q.status === "draft" && <Button size="sm" variant="primary" onClick={() => setSending({ mode: "quote", quote: q })}><Send className="h-3.5 w-3.5" />Send to client</Button>}
                  {(q.status === "sent" || q.status === "accepted") && <Button size="sm" variant="primary" onClick={() => setSending({ mode: "quote", quote: q })}><Send className="h-3.5 w-3.5" />Nudge — resend</Button>}
                  {q.status === "completed" && !q.client_notified_at && <Button size="sm" variant="primary" onClick={() => setSending({ mode: "done", quote: q })}><Mail className="h-3.5 w-3.5" />Tell the client it&apos;s done</Button>}
                  {q.invoice && <a href={`/invoices/${q.invoice.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[0.75rem] font-medium text-brand-600 hover:bg-canvas">Invoice {q.invoice.number}</a>}
                  {["draft", "sent"].includes(q.status) && <Button size="sm" variant="ghost" className="ml-auto text-rose-600" disabled={pending} onClick={() => start(async () => { const r = await cancelTicketQuote(q.id); setMsg(r.ok ? { ok: true, text: q.status === "draft" ? "Draft removed." : "Quote cancelled." } : { ok: false, text: r.error }); router.refresh(); })}><Trash2 className="h-3.5 w-3.5" />{q.status === "draft" ? "Delete" : "Cancel"}</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <QuoteEditor ticketId={ticketId} quote={editing === "new" ? null : editing} variation={editing === "new" ? live.length > 0 : editing.kind === "variation"} defaultRate={defaultRate} currency={currency} aiSite={aiSite}
        onClose={() => setEditing(null)} onSaved={(id, send) => { setEditing(null); router.refresh(); if (send) setSending({ mode: "quote", quote: { id } as QuoteView }); }} />}
      {sending && <SendDialog ticketId={ticketId} ticketNumber={ticketNumber} mode={sending.mode} quote={sending.quote ?? null} onClose={() => setSending(null)} onDone={(text) => { setSending(null); setMsg({ ok: true, text }); router.refresh(); }} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

function Modal({ title, onClose, children, footer, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-modal="true" className={cn("pt-safe relative flex max-h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-pop sm:max-h-[92dvh] sm:rounded-2xl", wide ? "max-w-3xl" : "max-w-xl")}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"><div className="min-w-0 text-[1rem] font-semibold text-ink">{title}</div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-ink-faint hover:bg-canvas hover:text-ink"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="pb-safe border-t border-line bg-canvas/60 px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

function QuoteEditor({ ticketId, quote, variation, defaultRate, currency, onClose, onSaved, aiSite }: {
  ticketId: string; quote: QuoteView | null; variation: boolean; defaultRate: number; currency: string; onClose: () => void; onSaved: (id: string, send: boolean) => void; aiSite: { domain: string } | null;
}) {
  const [aiJob, setAiJob] = useState(!!quote?.ai_job);
  const [aiRequest, setAiRequest] = useState(quote?.ai_request ?? "");
  const [title, setTitle] = useState(quote?.title ?? "");
  const [description, setDescription] = useState(quote?.description ?? "");
  const [tasks, setTasks] = useState<{ label: string; hours: number }[]>(quote?.tasks.map((t) => ({ label: t.label, hours: Number(t.hours) })) ?? []);
  const [rate, setRate] = useState(quote?.rate ? Number(quote.rate) : defaultRate);
  const [fixed, setFixed] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [ai, setAi] = useState<{ description: string; hours: number; notes: string } | null>(quote?.ai_notes != null ? { description: quote.ai_description ?? "", hours: Number(quote.ai_hours ?? 0), notes: quote.ai_notes ?? "" } : null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, startAi] = useTransition();
  const [pending, start] = useTransition();
  const hours = sumHours(tasks);
  const p = priceFor(hours, rate);
  const price = Number(fixed) > 0 ? Number(fixed) : p.incGst;
  const askClaude = () => startAi(async () => {
    setError(null);
    const r = await draftQuoteWithAI(ticketId, { variation, brief });
    if (!r.ok) { setError(r.error); return; }
    setAi({ description: r.data.description, hours: r.data.hours, notes: r.data.notes });
    if (!title.trim()) setTitle(r.data.title);
    setDescription(r.data.description); setTasks(r.data.tasks);
  });
  const save = (send: boolean) => start(async () => {
    setError(null);
    const r = await saveTicketQuote(ticketId, quote?.id ?? null, { title, description, tasks, rate, priceOverride: Number(fixed) > 0 ? Number(fixed) : null, ai, aiJob: aiSite || quote?.ai_job ? aiJob : undefined, aiRequest });
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data.id, send);
  });
  return (
    <Modal wide onClose={onClose} title={quote ? `Edit ${label(quote)}` : variation ? "New variation — extra work" : "Quote the work"}
      footer={<div className="space-y-2"><FormError message={error} /><div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-[0.8125rem] text-ink"><span className="text-ink-muted">Client pays </span><strong className="text-[1.0625rem]">{money(price, currency, { cents: true })}</strong><span className="text-ink-muted"> inc GST</span></span><Button onClick={() => save(false)} disabled={pending}>Save draft</Button><Button variant="primary" onClick={() => save(true)} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save &amp; send…</Button></div></div>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-500/10 p-3 ring-1 ring-brand-500/25">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink"><Sparkles className="h-4 w-4 text-brand-600" />Let Claude write it</p>
          <p className="mt-0.5 text-[0.75rem] text-ink-muted">Reads the emails, replies and notes on this ticket{variation ? " (and the earlier quotes, so it only covers the extra work)" : ""}. You can change everything after.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Anything to add? e.g. needs a staging copy first, plugin licence is theirs" />
            <Button variant="primary" className="shrink-0" disabled={thinking} onClick={askClaude}>{thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{thinking ? "Writing…" : description ? "Write it again" : "Write it"}</Button>
          </div>
        </div>
        {ai && (
          <div className="rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
            <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold text-ink"><StaffOnly />Claude recommends {ai.hours} h ({money(priceFor(ai.hours, rate).incGst, currency)} inc GST)</p>
            {ai.notes && <p className="mt-1 whitespace-pre-line text-[0.75rem] text-ink-muted">{ai.notes}</p>}
          </div>
        )}
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fix the contact form and update the plugins" /></div>
        <div><Label hint="the client reads this">What we&apos;ll do</Label><Textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><Label hint="the client sees the steps ticked off — not the hours">Steps</Label><StaffOnly /></div>
          <ul className="space-y-2">
            {tasks.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input value={t.label} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Step" />
                <div className="relative w-24 shrink-0"><Input inputMode="decimal" value={String(t.hours)} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x)))} className="pr-7 text-right" /><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.75rem] text-ink-faint">h</span></div>
                <button type="button" aria-label="Remove step" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} className="rounded-md p-2 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setTasks([...tasks, { label: "", hours: 0.5 }])} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-600"><Plus className="h-4 w-4" />Add a step</button>
        </div>
        <div className="grid gap-3 rounded-xl bg-canvas p-3 ring-1 ring-line sm:grid-cols-3">
          <div><Label hint="staff only">Total hours</Label><p className="flex h-10 items-center text-[1rem] font-semibold text-ink">{hours} h{p.hours !== hours ? <span className="ml-1 text-[0.75rem] font-normal text-ink-muted">(charged {p.hours} h)</span> : null}</p></div>
          <div><Label hint="ex GST">Hourly rate</Label><Input inputMode="decimal" value={String(rate)} onChange={(e) => setRate(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} /></div>
          <div><Label hint="optional, inc GST">Fixed price</Label><Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={p.incGst.toFixed(2)} /></div>
        </div>
        {(aiSite || quote?.ai_job) && (
          <div className="rounded-xl bg-canvas p-3 ring-1 ring-line">
            <label className="flex items-start gap-2 text-[0.8125rem]">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={aiJob} onChange={(e) => setAiJob(e.target.checked)} />
              <span><span className="flex flex-wrap items-center gap-2 font-medium text-ink"><Bot className="h-4 w-4 text-brand-600" />Do the work with AI maintenance once it&apos;s paid <StaffOnly /></span>
                <span className="block text-[0.7188rem] text-ink-muted">When the client pays, a job starts straight away on {aiSite?.domain ?? "the ticket's website"}: backup first, then Claude makes the changes and the report goes on the ticket and the website file. No second invoice — this quote pays for it.</span></span>
            </label>
            {aiJob && <div className="mt-2"><Label hint="leave blank to use the title and description">Instructions for Claude</Label><Textarea rows={4} value={aiRequest} onChange={(e) => setAiRequest(e.target.value)} placeholder="Exactly what to change, page by page — technical detail is fine, the client never sees this." /></div>}
          </div>
        )}
        <p className="text-[0.75rem] text-ink-muted">The client pays the full amount before we start. Their invoice shows one line — the title — with no hours.</p>
      </div>
    </Modal>
  );
}

function SendDialog({ ticketId, ticketNumber, mode, quote, onClose, onDone }: {
  ticketId: string; ticketNumber: number; mode: "quote" | "done" | "email"; quote: QuoteView | null; onClose: () => void; onDone: (text: string) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [sender, setSender] = useState<{ via: string; address: string | null } | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [nudge, setNudge] = useState(false);
  const [resolve, setResolve] = useState(true);
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ firstName: "", lastName: "", email: "", position: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = (p: Person) => (p.email ?? "").toLowerCase();

  useEffect(() => {
    start(async () => {
      const r = await ticketPeople(ticketId);
      if (!r.ok) { setError(r.error); return; }
      setPeople(r.data.people); setSender(r.data.sender);
      setChosen(new Set(r.data.people.filter((p) => p.onTicket && p.email).map(key)));
      const first = r.data.first;
      if (mode === "quote" && quote) {
        const d = await quoteSendDraft(quote.id);
        if (d.ok) { setSubject(d.data.subject); setMessage(d.data.message); setNudge(d.data.nudge); } else setError(d.error);
      } else if (mode === "done" && quote) setMessage(`Hi ${first ?? "there"},\n\nGood news — the work on ticket #${ticketNumber} is finished: ${quote.title}.\n\nYou can see everything we did on the ticket page. If anything doesn't look right, just reply to this email.\n\nThanks!`);
      else setMessage(`Hi ${first ?? "there"},\n\n`);
    });
  }, [ticketId, mode, quote, ticketNumber]);

  const toggle = (p: Person) => { const k = key(p); const n = new Set(chosen); if (n.has(k)) n.delete(k); else n.add(k); setChosen(n); };
  const recipients = (): Recipient[] => (people ?? []).filter((p) => p.email && chosen.has(key(p))).map((p) => ({ email: p.email!, name: p.name, contactId: p.contactId }));
  const addPerson = () => start(async () => {
    setError(null);
    const r = await addTicketPerson(ticketId, np);
    if (!r.ok) { setError(r.error); return; }
    const p: Person = { contactId: r.data.contactId, name: `${np.firstName} ${np.lastName}`.trim(), email: np.email.trim().toLowerCase(), phone: null, position: np.position || null, onTicket: true, asked: false };
    setPeople([...(people ?? []).filter((x) => key(x) !== key(p)), p]); setChosen(new Set([...chosen, key(p)]));
    setNp({ firstName: "", lastName: "", email: "", position: "" }); setAdding(false);
  });
  const send = () => start(async () => {
    setError(null);
    const to = recipients();
    if (mode === "quote" && quote) {
      const r = await sendTicketQuote(quote.id, { recipients: to, subject, message });
      if (!r.ok) { setError(r.error); return; }
      onDone(`${nudge ? "Reminder" : "Quote"} sent to ${r.data.sent.join(", ")}${r.data.failed.length ? ` — not sent to ${r.data.failed.map((f) => f.email).join(", ")}` : ""}.`);
    } else if (mode === "done" && quote) {
      const r = await notifyQuoteDone(quote.id, { recipients: to, message, resolveTicket: resolve });
      if (!r.ok) { setError(r.error); return; }
      onDone(r.data.sent.length ? `Told ${r.data.sent.join(", ")} it's done.` : "Marked done.");
    } else {
      const r = await emailTicketReply(ticketId, { recipients: to, message });
      if (!r.ok) { setError(r.error); return; }
      onDone(`Emailed ${r.data.sent.join(", ")}.`);
    }
  });
  const title = mode === "done" ? "The work is done — tell the client" : mode === "email" ? `Email about ticket #${ticketNumber}` : nudge ? "Nudge — send the quote again" : "Send the quote";
  return (
    <Modal onClose={onClose} title={title}
      footer={<div className="space-y-2"><FormError message={error} /><div className="flex flex-wrap items-center gap-2">
        {mode === "done" && <label className="mr-auto flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />Mark the ticket done</label>}
        {mode === "done" && <Button disabled={pending} onClick={() => start(async () => { const r = await notifyQuoteDone(quote!.id, { recipients: [], message: "", resolveTicket: resolve }); if (r.ok) onDone("Marked done — no email sent."); else setError(r.error); })}>Don&apos;t email</Button>}
        <Button variant="primary" className={mode === "done" ? "" : "ml-auto"} disabled={pending || !people || chosen.size === 0} onClick={send}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}<Send className="h-4 w-4" />Send{chosen.size > 1 ? ` to ${chosen.size}` : ""}</Button>
      </div></div>}>
      {!people ? <p className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p> : (
        <div className="space-y-4">
          <div>
            <Label>Send to</Label>
            <ul className="space-y-1.5">
              {people.map((p) => (
                <li key={p.contactId ?? p.email ?? p.name}>
                  <label className={cn("flex items-center gap-3 rounded-lg px-3 py-2 ring-1", p.email ? "cursor-pointer ring-line hover:bg-canvas" : "opacity-50 ring-line")}>
                    <input type="checkbox" className="h-4 w-4" disabled={!p.email} checked={!!p.email && chosen.has(key(p))} onChange={() => toggle(p)} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[0.875rem] font-medium text-ink">{p.name}{p.asked ? <span className="ml-1.5 text-[0.6875rem] font-normal text-ink-faint">asked</span> : p.onTicket ? <span className="ml-1.5 text-[0.6875rem] font-normal text-ink-faint">on the ticket</span> : null}</span><span className="block truncate text-[0.75rem] text-ink-muted">{p.email ?? "no email"}{p.position ? ` · ${p.position}` : ""}</span></span>
                    {p.onTicket && p.contactId && !p.asked && <button type="button" onClick={(e) => { e.preventDefault(); start(async () => { const r = await removeTicketPerson(ticketId, p.contactId!); if (r.ok) setPeople(people.map((x) => (x === p ? { ...x, onTicket: false } : x))); }); }} className="text-[0.6875rem] text-ink-faint hover:text-rose-600">Take off ticket</button>}
                  </label>
                </li>
              ))}
            </ul>
            {adding ? (
              <div className="mt-2 grid gap-2 rounded-lg p-3 ring-1 ring-line sm:grid-cols-2">
                <Input placeholder="First name" value={np.firstName} onChange={(e) => setNp({ ...np, firstName: e.target.value })} />
                <Input placeholder="Last name" value={np.lastName} onChange={(e) => setNp({ ...np, lastName: e.target.value })} />
                <Input type="email" placeholder="Email" value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} />
                <Input placeholder="Role (optional)" value={np.position} onChange={(e) => setNp({ ...np, position: e.target.value })} />
                <div className="flex gap-2 sm:col-span-2"><Button size="sm" variant="primary" disabled={pending} onClick={addPerson}>Add to ticket</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
              </div>
            ) : <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-600"><UserPlus className="h-4 w-4" />Add someone (saved to the client&apos;s contacts)</button>}
          </div>
          {mode === "quote" && <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>}
          <div><Label hint={mode === "email" ? "" : "a button to the ticket goes underneath"}>Message</Label><Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          {sender && <p className="text-[0.75rem] text-ink-muted">{sender.via === "gmail" ? <>From <strong className="text-ink">{sender.address}</strong> (your Gmail) with your signature — their reply comes back onto this ticket.</> : sender.address ? <>From {sender.address} — replies go to your support email. Connect Gmail to send from your own address.</> : "Email isn't set up — connect Gmail in Settings → Integrations."}</p>}
        </div>
      )}
    </Modal>
  );
}
