"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { backupDownload, cancelAiJob, invoiceAiJob, restoreAiBackup, retryAiJob, undoAiChange } from "@/app/(app)/nerd-herd/ai/actions";
import { useLiveJobs, type AiJobRow } from "./ai-maintenance";

type Res = { ok: true; data: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (label: string, fn: () => Promise<Res>, confirmText?: string, then?: (d: string) => void) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label); setMsg(null);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r.ok && then) then(r.data); else setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
      router.refresh();
    });
  };
  const spin = (label: string, icon: React.ReactNode) => (pending && busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon);
  const status = msg && <p role="status" className={`rounded-lg px-3 py-2 text-[0.7812rem] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>;
  return { run, spin, status, pending };
}

/** Live status line on the report page while the job runs. */
export function AiLiveStatus({ row }: { row: AiJobRow }) {
  const [live] = useLiveJobs([row]);
  return <>{live.stage_note ?? ""}</>;
}

/** The job's buttons: cancel / retry / invoice / backup download / restore. */
export function AiJobActions({ id, status, canRun, hasBackup, invoiceId, canInvoice }: { id: string; status: string; canRun: boolean; hasBackup: boolean; invoiceId: string | null; canInvoice: boolean }) {
  const { run, spin, status: note, pending } = useRun();
  if (!canRun) return invoiceId ? <ButtonLink href={`/invoices/${invoiceId}`} variant="primary" size="sm"><FileText className="h-3.5 w-3.5" />Open the draft invoice</ButtonLink> : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {invoiceId && <ButtonLink href={`/invoices/${invoiceId}`} variant="primary" size="sm"><FileText className="h-3.5 w-3.5" />Review & send the invoice</ButtonLink>}
        {!invoiceId && canInvoice && ["done", "needs_attention"].includes(status) && <Button size="sm" variant="primary" disabled={pending} onClick={() => run("inv", () => invoiceAiJob(id), "Make a draft invoice for this job?")}>{spin("inv", <FileText className="h-3.5 w-3.5" />)}Create draft invoice</Button>}
        {["queued", "backing_up"].includes(status) && <Button size="sm" disabled={pending} onClick={() => run("cancel", () => cancelAiJob(id), "Cancel this job? Nothing has been changed on the site yet.")}>{spin("cancel", <X className="h-3.5 w-3.5" />)}Cancel</Button>}
        {["failed", "needs_attention"].includes(status) && <Button size="sm" disabled={pending} onClick={() => run("retry", () => retryAiJob(id))}>{spin("retry", <RotateCcw className="h-3.5 w-3.5" />)}Try again</Button>}
        {hasBackup && <Button size="sm" disabled={pending} onClick={() => run("dl", () => backupDownload(id), undefined, (url) => { window.location.href = url; })}>{spin("dl", <Download className="h-3.5 w-3.5" />)}Download database backup</Button>}
        {hasBackup && ["done", "needs_attention", "failed"].includes(status) && (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run("restore", () => restoreAiBackup(id), "Restore the site's database to the backup made before this job?\n\nThis reverses EVERY content change made on the site since then — including any edits by the client or other jobs. Files (images, plugins) are not touched.")}>{spin("restore", <Undo2 className="h-3.5 w-3.5" />)}Restore backup</Button>
        )}
      </div>
      {note}
    </div>
  );
}

export function UndoChange({ id, changeId }: { id: string; changeId: string }) {
  const { run, spin, status, pending } = useRun();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("undo", () => undoAiChange(id, changeId), "Undo this change on the live site? (Later changes to the same page must be undone first.)")}>{spin("undo", <Undo2 className="h-3.5 w-3.5" />)}Undo</Button>
      {status}
    </span>
  );
}

/** Markdown-lite for reports: headings, bullets, **bold**, paragraphs. No HTML is rendered from the text. */
export function ReportText({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={`l${blocks.length}`} className="list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) { list.push(b[1]); continue; }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? <p key={`h${blocks.length}`} className="pt-1 text-[0.8438rem] font-semibold text-ink">{inline(h[1])}</p> : <p key={`p${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-2 text-[0.8125rem] leading-relaxed text-ink-muted">{blocks}</div>;
}
