"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Check, CheckCircle2, CircleDashed, Copy, ExternalLink, Eye, History, UserPlus, FileText, Loader2, Mail, MessageCircle, Plus, RotateCcw, Send, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { fieldShown, stepProgress, steps as allSteps, type Field } from "@/lib/loans/form";
import type { DocRequest } from "@/lib/loans/server";
import {
  addBrokerToFile, analyseLoanFile, removeBrokerFromFile, sendBrokerSignIn,
  addRequest, emailLoanLink, liveFile, loanDocLink, removeRequest, sendBrokerMessage, setRequest, updateLoanFile, type LiveFile,
} from "@/app/(app)/loans/actions";
import { STATUS_LABEL, STATUS_ORDER } from "./status";
import { FinancialPosition } from "./position";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const money = (v: string) => { const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && String(v).trim() ? `$${n.toLocaleString("en-AU")}` : v; };
function show(f: Field, v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (f.type === "money") return money(s);
  if (f.type === "multi") return s.split("|").join(", ");
  if (f.type === "check") return s === "yes" ? "Yes" : "";
  if (f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return `${+s.slice(8)}/${+s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}

export function LiveLoanFile({ initial, link }: { initial: LiveFile; link: string }) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const prev = useRef<Record<string, unknown>>(initial.file.answers);
  const [changed, setChanged] = useState<Record<string, number>>({});
  const refresh = useCallback(async () => {
    const r = await liveFile(initial.file.id).catch(() => null);
    if (!r || !r.ok) return;
    const now = Date.now(); const ch: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.data.file.answers)) if (JSON.stringify(prev.current[k]) !== JSON.stringify(v)) ch[k] = now;
    prev.current = r.data.file.answers;
    if (Object.keys(ch).length) setChanged((c) => ({ ...Object.fromEntries(Object.entries(c).filter(([, t]) => now - t < 8000)), ...ch }));
    setD(r.data);
  }, [initial.file.id]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const f = d.file;
  const live = !!f.client_seen_at && Date.now() - new Date(f.client_seen_at).getTime() < 20_000;
  const steps = allSteps(f.applicants);
  const names = Array.from({ length: f.applicants }, (_, i) => String(f.answers[`a${i + 1}.first_name`] ?? "").trim() || `Applicant ${i + 1}`);
  const focusKey = live ? f.client_focus?.field ?? null : null;

  return (
    <div className="space-y-4">
      {/* presence + link */}
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-0 flex-1">
          {live ? (
            <p className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
              Filling it in now{f.client_focus?.label ? <> — <span className="text-brand-700 dark:text-brand-300">{f.client_focus.label}</span></> : f.client_focus?.step ? <> — {steps.find((s) => s.key === f.client_focus?.step)?.title}</> : null}
            </p>
          ) : (
            <p className="text-[0.9375rem] text-ink-muted">{f.client_seen_at ? `Last on the form ${ago(f.client_seen_at)}` : "Hasn't opened the link yet"}{f.submitted_at ? ` · sent to you ${ago(f.submitted_at)}` : ""}</p>
          )}
          <p className="mt-0.5 text-[0.75rem] text-ink-faint">Updates every few seconds while this page is open.</p>
        </div>
        <LinkBox fileId={f.id} link={link} hasEmail={!!(f.contact_email || f.answers["a1.email"])} />
        <a href={`/broker/${f.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-canvas"><Eye className="h-4 w-4" />View as broker</a>
        <Select aria-label="Status" value={f.status} className="w-auto" onChange={async (e) => { const r = await updateLoanFile(f.id, { status: e.target.value }); if (!r.ok) setErr(r.error); refresh(); }}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </Card>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-800 ring-1 ring-inset ring-rose-200">{err}</p>}

      <FinancialPosition answers={f.answers} applicants={f.applicants} names={names} business={d.business} saved={d.analysis} run={(as) => analyseLoanFile(f.id, as)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* answers */}
        <div className="space-y-4">
          {steps.filter((s) => !s.special || s.key === "review").map((s) => {
            const p = s.special ? null : Math.round(stepProgress(s, f.applicants, f.answers) * 100);
            const onIt = live && f.client_focus?.step === s.key;
            return (
              <Card key={s.key} className={cn("p-4", onIt && "ring-2 ring-emerald-400")}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="flex-1 text-[0.9375rem] font-semibold text-ink">{s.title}{onIt && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">On this now</span>}</h3>
                  {p !== null && <span className={cn("text-[0.75rem]", p >= 100 ? "text-emerald-700" : "text-ink-muted")}>{p}%</span>}
                </div>
                {s.perApplicant && names.map((n, i) => (
                  <div key={i} className="mb-2">
                    {f.applicants > 1 && <p className="mb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{n}</p>}
                    <Rows fields={s.perApplicant!} prefix={`a${i + 1}.`} answers={f.answers} changed={changed} focus={focusKey} />
                  </div>
                ))}
                {s.fields && <Rows fields={s.fields} prefix="" answers={f.answers} changed={changed} focus={focusKey} />}
                {s.lists?.map((l) => {
                  const rows = (Array.isArray(f.answers[l.key]) ? f.answers[l.key] : []) as Record<string, string>[];
                  return (
                    <div key={l.key} className={cn("mt-2 rounded-lg", changed[l.key] && "bg-amber-50/70 dark:bg-amber-500/10", focusKey === l.key && "ring-2 ring-emerald-400")}>
                      <p className="text-[0.8125rem] font-medium text-ink">{l.label}{!rows.length && <span className="ml-2 font-normal text-ink-faint">{f.answers[`${l.key}__none`] === true ? "None" : "—"}</span>}</p>
                      {rows.length > 0 && (
                        <div className="mt-1 overflow-x-auto">
                          <table className="w-full text-[0.8125rem]">
                            <thead><tr className="text-left text-ink-faint">{l.fields.map((x) => <th key={x.key} className="pb-1 pr-3 font-medium">{x.label}</th>)}</tr></thead>
                            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{l.fields.map((x) => <td key={x.key} className="py-1 pr-3 text-ink">{show(x, r[x.key]) || <span className="text-ink-faint">—</span>}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>

        {/* documents, messages, connections, notes */}
        <div className="space-y-4">
          <Messages fileId={f.id} msgs={d.messages} focusLabel={live ? f.client_focus?.label ?? null : null} onSent={refresh} />
          <Docs fileId={f.id} names={names} requests={d.requests} docs={d.documents} onChange={refresh} />
          <Card className="p-4">
            <h3 className="mb-2 text-[0.9375rem] font-semibold text-ink">Connected by the client</h3>
            {d.connections.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Nothing yet. They can connect Xero (profit and loss and balance sheet) or Gmail (finds their documents) from their link.</p> : (
              <ul className="space-y-1.5 text-[0.8125rem]">
                {d.connections.map((c) => (
                  <li key={c.id} className="text-ink">
                    <b>{c.provider === "xero" ? "Xero" : "Gmail"}</b> · {c.account_label} <span className="text-ink-faint">({c.provider === "xero" ? "reports pulled, then disconnected" : c.status})</span>
                    {c.error && <span className="block text-rose-700">{c.error}</span>}
                  </li>
                ))}
                {d.xeroReports.length > 0 && <li className="text-ink-muted">Xero reports: {[...new Set(d.xeroReports.map((r) => `${r.tenant} ${r.fy}`))].join(", ")} — on the documents list.</li>}
                {d.gmailFound > 0 && <li className="text-ink-muted">Gmail found {d.gmailFound} likely email{d.gmailFound === 1 ? "" : "s"}; only what they tick is shared.</li>}
              </ul>
            )}
          </Card>
          <Brokers fileId={f.id} on={d.brokers} all={d.allBrokers} onChange={refresh} />
          <Activity log={d.log} />
          <Notes fileId={f.id} initial={f.notes ?? ""} />
        </div>
      </div>
    </div>
  );
}

function Rows({ fields, prefix, answers, changed, focus }: { fields: Field[]; prefix: string; answers: Record<string, unknown>; changed: Record<string, number>; focus: string | null }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {fields.filter((x) => fieldShown(x, answers, prefix)).map((x) => {
        const k = `${prefix}${x.key}`; const v = show(x, answers[k]);
        return (
          <div key={k} className={cn("rounded-md px-1.5 py-1 transition-colors", x.type === "textarea" && "sm:col-span-2", changed[k] && "bg-amber-50 dark:bg-amber-500/10", focus === k && "ring-2 ring-emerald-400")}>
            <dt className="text-[0.6875rem] text-ink-faint">{x.label}</dt>
            <dd className={cn("text-[0.875rem]", v ? "text-ink" : "text-ink-faint")}>{v ? <span className="whitespace-pre-wrap">{v}</span> : focus === k ? <span className="italic text-emerald-700">typing…</span> : "—"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function LinkBox({ fileId, link, hasEmail }: { fileId: string; link: string; hasEmail: boolean }) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy client link"}</Button>
      <a href={link} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[0.8125rem] text-ink-muted hover:bg-canvas hover:text-ink"><ExternalLink className="h-4 w-4" />Open</a>
      {hasEmail && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await emailLoanLink(fileId, window.location.origin); setMsg(r.ok ? r.data : r.error); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Email them the link</Button>}
      {msg && <span className="basis-full text-[0.75rem] text-ink-muted">{msg}</span>}
    </div>
  );
}

function Messages({ fileId, msgs, focusLabel, onSent }: { fileId: string; msgs: LiveFile["messages"]; focusLabel: string | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);
  const send = () => start(async () => { setErr(null); const r = await sendBrokerMessage(fileId, text, focusLabel); if (!r.ok) { setErr(r.error); return; } setText(""); onSent(); });
  return (
    <Card className="flex max-h-[520px] flex-col p-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3"><MessageCircle className="h-4 w-4 text-brand-600" /><h3 className="text-[0.9375rem] font-semibold text-ink">Messages</h3>
        <span className="ml-auto text-[0.75rem] text-ink-faint">They see these on their form</span></div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <p className="text-[0.8125rem] text-ink-muted">If they get stuck, they can message you from the form — and you can nudge them here.</p>}
        {msgs.map((m) => m.from_side === "system" ? (
          <p key={m.id} className="text-center text-[0.75rem] text-ink-faint">{m.body} · {ago(m.created_at)}</p>
        ) : (
          <div key={m.id} className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-[0.875rem]", m.from_side === "broker" ? "ml-auto bg-brand-600 text-white" : "bg-canvas text-ink ring-1 ring-inset ring-line")}>
            {m.about && <p className="mb-0.5 text-[0.6875rem] opacity-75">About: {m.about}</p>}
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-0.5 text-[0.6875rem] opacity-70">{m.author ?? ""} · {ago(m.created_at)}{m.from_side === "broker" && m.read_at ? " · seen" : ""}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {err && <p className="px-4 text-[0.8125rem] text-rose-700">{err}</p>}
      <div className="flex gap-2 border-t border-line p-3">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={focusLabel ? `Help with “${focusLabel}”…` : "Message the client…"} className="flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); send(); } }} />
        <Button variant="primary" disabled={pending || !text.trim()} onClick={send} aria-label="Send">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </div>
    </Card>
  );
}

function Docs({ fileId, names, requests, docs, onChange }: { fileId: string; names: string[]; requests: DocRequest[]; docs: LiveFile["documents"]; onChange: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState(""); const [who, setWho] = useState("");
  const [redo, setRedo] = useState<{ id: string; note: string } | null>(null);
  const open = async (id: string) => { const r = await loanDocLink(fileId, id); if (r.ok) window.open(r.data, "_blank", "noopener"); else setErr(r.error); };
  const act = async (p: Promise<{ ok: boolean; error?: string }>) => { const r = await p; if (!r.ok) setErr(r.error ?? "Couldn't save."); onChange(); };
  const got = requests.filter((r) => ["received", "accepted", "not_applicable"].includes(r.status)).length;
  const groups = [...names.map((n, i) => ({ t: n, list: requests.filter((r) => r.applicant === i + 1) })), { t: "Application", list: requests.filter((r) => !r.applicant) }].filter((g) => g.list.length);
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2"><h3 className="flex-1 text-[0.9375rem] font-semibold text-ink">Documents</h3><span className="text-[0.75rem] text-ink-muted">{got}/{requests.length} done</span></div>
      {err && <p className="mb-2 text-[0.8125rem] text-rose-700">{err}</p>}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.t}>
            {groups.length > 1 && <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{g.t}</p>}
            <ul className="space-y-1.5">
              {g.list.map((r) => {
                const files = docs.filter((x) => x.request_id === r.id);
                return (
                  <li key={r.id} className="rounded-lg px-2 py-1.5 ring-1 ring-inset ring-line">
                    <div className="flex items-start gap-2">
                      {r.status === "accepted" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : r.status === "received" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : r.status === "not_applicable" ? <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" /> : <CircleDashed className={cn("mt-0.5 h-4 w-4 shrink-0", r.status === "redo" ? "text-rose-500" : "text-ink-faint")} />}
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[0.8125rem] text-ink", r.status === "not_applicable" && "text-ink-faint line-through")}>{r.label}</p>
                        <p className="text-[0.6875rem] text-ink-faint">{r.status === "received" ? "Received — check it" : r.status === "accepted" ? "Checked" : r.status === "redo" ? `Asked again${r.broker_note ? `: ${r.broker_note}` : ""}` : r.status === "not_applicable" ? "Doesn't apply" : "Waiting"}</p>
                        {files.map((x) => (
                          <button key={x.id} type="button" onClick={() => open(x.id)} className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[0.75rem] text-brand-700 hover:underline dark:text-brand-300">
                            <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{x.name}</span><span className="shrink-0 text-ink-faint">· {x.source}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {r.status === "received" && <button type="button" title="Checked — it's right" onClick={() => act(setRequest(fileId, r.id, { status: "accepted" }))} className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>}
                        {(r.status === "received" || r.status === "accepted") && <button type="button" title="Ask for it again" onClick={() => setRedo({ id: r.id, note: "" })} className="rounded p-1 text-ink-faint hover:bg-canvas hover:text-ink"><RotateCcw className="h-4 w-4" /></button>}
                        <button type="button" title="Remove from the list" onClick={() => act(removeRequest(fileId, r.id))} className="rounded p-1 text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {redo?.id === r.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Input autoFocus value={redo.note} onChange={(e) => setRedo({ id: r.id, note: e.target.value })} placeholder="What's wrong? e.g. need the back as well" className="min-w-0 flex-1" />
                        <Button size="sm" variant="primary" onClick={() => { act(setRequest(fileId, r.id, { status: "redo", broker_note: redo.note })); setRedo(null); }}>Ask again</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRedo(null)}>Cancel</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {docs.some((x) => !x.request_id) && (
          <div>
            <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Other files (emailed in)</p>
            {docs.filter((x) => !x.request_id).map((x) => (
              <button key={x.id} type="button" onClick={() => open(x.id)} className="flex max-w-full items-center gap-1 text-[0.75rem] text-brand-700 hover:underline dark:text-brand-300"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{x.name}</span></button>
            ))}
          </div>
        )}
      </div>
      {adding ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Document needed" className="min-w-0 flex-1 basis-full sm:basis-auto" />
          <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-auto" aria-label="For"><option value="">Application</option>{names.map((n, i) => <option key={i} value={String(i + 1)}>{n}</option>)}</Select>
          <Button size="sm" variant="primary" disabled={!label.trim()} onClick={async () => { await act(addRequest(fileId, label, who ? Number(who) : null, "")); setLabel(""); setAdding(false); }}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      ) : <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Ask for another document</Button>}
    </Card>
  );
}

function Notes({ fileId, initial }: { fileId: string; initial: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-[0.9375rem] font-semibold text-ink">Your notes <span className="text-[0.75rem] font-normal text-ink-faint">(only your team sees these)</span></h3>
      <Textarea rows={4} value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} onBlur={async () => { if (v !== initial) { const r = await updateLoanFile(fileId, { notes: v }); setSaved(r.ok); } }} />
      {saved && <p className="mt-1 text-[0.75rem] text-ink-muted">Saved</p>}
    </Card>
  );
}

const ACTION: Record<string, string> = {
  signed_in: "signed in", viewed_file: "viewed the application", opened_document: "opened", downloaded_document: "downloaded",
  link_sent: "", opened_link: "opened their application link", uploaded: "uploaded", signed: "signed", sent_application: "sent the application",
};

function Activity({ log }: { log: LiveFile["log"] }) {
  const [all, setAll] = useState(false);
  const shown = all ? log : log.slice(0, 12);
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-ink-faint" /><h3 className="flex-1 text-[0.9375rem] font-semibold text-ink">Activity</h3><span className="text-[0.75rem] text-ink-faint">who looked, opened and downloaded</span></div>
      {log.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Nothing yet. Every visit, view and download by your brokers and the client shows here with the time.</p> : (
        <ul className="space-y-1.5 text-[0.8125rem]">
          {shown.map((x) => (
            <li key={x.id} className="flex gap-2">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", x.actor_kind === "broker" ? "bg-brand-500" : x.actor_kind === "client" ? "bg-emerald-500" : "bg-ink-faint")} />
              <span className="min-w-0 flex-1">
                <b className="text-ink">{x.actor_name ?? x.actor_email ?? x.actor_kind}</b>{x.actor_kind === "broker" ? " (broker)" : ""} {x.action === "link_sent" ? (x.detail ?? "") : <>{ACTION[x.action] ?? x.action}{x.detail ? <> <span className="text-ink">{x.detail}</span></> : null}</>}
                <span className="block text-[0.6875rem] text-ink-faint">{new Date(x.at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}{x.ip ? ` · IP ${x.ip}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {log.length > 12 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${log.length}`}</Button>}
    </Card>
  );
}

function Brokers({ fileId, on, all, onChange }: { fileId: string; on: LiveFile["brokers"]; all: LiveFile["allBrokers"]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [f, setF] = useState({ name: "", email: "", company: "" });
  const [send, setSend] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const others = all.filter((b) => !on.some((x) => x.id === b.id));
  const go = (p: Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) => start(async () => { const r = await p; setMsg(r.ok ? (typeof r.data === "string" ? r.data : null) : r.error); if (r.ok) { setAdding(false); setF({ name: "", email: "", company: "" }); setPick(""); } onChange(); });
  return (
    <Card className="p-4">
      <h3 className="mb-1 text-[0.9375rem] font-semibold text-ink">Brokers</h3>
      <p className="mb-2 text-[0.75rem] text-ink-muted">They see this application on a private broker page — signed in by a link emailed to them. No password; nothing is public.</p>
      {on.length === 0 ? <p className="text-[0.8125rem] text-ink-faint">Not shared with a broker yet.</p> : (
        <ul className="space-y-1.5">
          {on.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-inset ring-line">
              <span className="min-w-0 flex-1 text-[0.8125rem]"><b className="text-ink">{b.name}</b>{b.company ? ` · ${b.company}` : ""}<span className="block truncate text-[0.75rem] text-ink-faint">{b.email} · {b.last_seen_at ? `last on ${ago(b.last_seen_at)}` : "hasn't signed in yet"}</span></span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(sendBrokerSignIn(fileId, b.id))}><Mail className="h-4 w-4" />Send link</Button>
              <button type="button" title="Stop sharing" disabled={pending} onClick={() => go(removeBrokerFromFile(fileId, b.id))} className="rounded p-1 text-ink-faint hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-[0.8125rem] text-ink-muted">{msg}</p>}
      {adding ? (
        <div className="mt-3 space-y-2">
          {others.length > 0 && (
            <Select aria-label="Choose a broker" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">New broker…</option>{others.map((b) => <option key={b.id} value={b.id}>{b.name}{b.company ? ` (${b.company})` : ""}</option>)}
            </Select>
          )}
          {!pick && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Input placeholder="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
              <Input placeholder="Email" type="email" className="sm:col-span-2" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
          )}
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="h-4 w-4" />Email them a sign-in link now</label>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => go(addBrokerToFile(fileId, pick ? { brokerId: pick, send } : { ...f, send }))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Share with broker</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add a broker</Button>}
    </Card>
  );
}
