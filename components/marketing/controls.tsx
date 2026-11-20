"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/form";
import { approveChange, buildReport, markSent, rejectChange, runNow, saveCommentary, syncNow, undoChangeAction } from "@/app/(app)/marketing/actions";

type Act = (id: string) => Promise<{ ok: true; data: string } | { ok: false; error: string }>;

/** A button that runs a server action and shows what came back. */
export function ActButton({ id, act, label, busy, variant = "secondary", confirm }: { id: string; act: "sync" | "run" | "approve" | "reject" | "undo"; label: string; busy: string; variant?: "primary" | "secondary" | "ghost" | "danger"; confirm?: string }) {
  const fn: Record<typeof act, Act> = { sync: syncNow, run: runNow, approve: approveChange, reject: rejectChange, undo: undoChangeAction };
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={variant} className="h-10 sm:h-8" disabled={pending} onClick={() => {
        if (confirm && !armed) { setArmed(true); setMsg({ ok: true, text: confirm }); return; }
        start(async () => { setArmed(false); const r = await fn[act](id); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); });
      }}>{pending ? busy : armed ? "Yes, do it" : label}</Button>
      {msg && <span className={`max-w-[42rem] whitespace-pre-line text-[0.75rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`}>{msg.text}</span>}
    </span>
  );
}

export function BuildReport({ id, months }: { id: string; months: { value: string; label: string }[] }) {
  const router = useRouter();
  const [m, setM] = useState(months[0]?.value ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} className="h-10 rounded-lg border border-line bg-surface px-2 text-[0.8125rem] text-ink sm:h-8">
        {months.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
      <Button type="button" size="sm" className="h-10 sm:h-8" disabled={pending || !m} onClick={() => start(async () => {
        setErr(null);
        const r = await buildReport(id, m);
        if (!r.ok) setErr(r.error); else router.push(`/marketing/${id}/reports/${r.data}`);
      })}>{pending ? "Building… (about a minute)" : "Build report"}</Button>
      {err && <span className="text-[0.75rem] text-rose-700">{err}</span>}
    </div>
  );
}

export function CommentaryEditor({ reportId, initial }: { reportId: string; initial: string }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea rows={10} value={t} onChange={(e) => { setT(e.target.value); setMsg(null); }} aria-label="Commentary" />
      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-[0.75rem] text-ink-muted">{msg}</span>}
        <Button type="button" size="sm" className="h-10 sm:h-8" disabled={pending} onClick={() => start(async () => { const r = await saveCommentary(reportId, t); setMsg(r.ok ? r.data : r.error); })}>{pending ? "Saving…" : "Save commentary"}</Button>
      </div>
    </div>
  );
}

export function ShareReport({ reportId, url, to, subject, sent }: { reportId: string; url: string; to: string[]; subject: string; sent: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const body = `Hi,\n\nHere's your report for the month:\n${url}\n\nAny questions, just reply.\n`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" className="h-10 sm:h-8" onClick={() => { navigator.clipboard?.writeText(url).then(() => setCopied(true)); }}>{copied ? "Link copied" : "Copy client link"}</Button>
      <a className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-[0.8125rem] font-medium text-ink hover:bg-zinc-50 sm:h-8" href={`mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Email it</a>
      <a className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-[0.8125rem] font-medium text-ink hover:bg-zinc-50 sm:h-8" href={url} target="_blank" rel="noreferrer">Open as the client sees it</a>
      {sent ? <Badge tone="green">Sent</Badge> : <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-8" disabled={pending} onClick={() => start(async () => { await markSent(reportId); router.refresh(); })}>Mark as sent</Button>}
    </div>
  );
}
