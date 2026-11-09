import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDateTime, money } from "@/lib/format";
import { readNerd } from "@/lib/nerdherd/core";
import { KIND_LABEL, readAiSettings, type AiJob } from "@/lib/nerdherd/ai-runner";
import { Card, CardHeader, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ACTIVE, AI_STATUS } from "@/components/nerdherd/ai-maintenance";
import { AiJobActions, AiLiveStatus, ReportText, UndoChange } from "@/components/nerdherd/ai-job-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One AI maintenance job: the request, live progress, the report, every change (undoable), backup and invoice. */
export default async function AiJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const { data } = await supabase.from("nh_ai_jobs").select("*, websites(id, domain, customers(id, name)), support_tickets(id, number, subject), invoices(id, number, status, total)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!data) notFound();
  const j = data as unknown as AiJob & {
    websites: { id: string; domain: string; customers: { id: string; name: string } | null } | null;
    support_tickets: { id: string; number: number; subject: string } | null;
    invoices: { id: string; number: string | null; status: string; total: number } | null;
  };
  const st = AI_STATUS[j.status] ?? { label: j.status, tone: "neutral" as const };
  const running = ACTIVE.includes(j.status);
  const nerd = readNerd(org.settings), ai = readAiSettings(org.settings);
  const rateInc = Math.round(nerd.hourlyRate * 1.1 * 100) / 100;
  const hours = Number(j.manual_hours) || 0;
  const changes = (j.changes ?? []).slice().reverse();
  const undoable = new Set<string>();
  // the newest change on each page can be undone; the connector refuses out-of-order undo anyway
  for (const c of changes) if (c.ok && /^c\d+/.test(c.change_id)) undoable.add(c.change_id);
  const backup = j.backup as { size?: number; parts?: { name: string; size: number }[]; seconds?: number } | null;

  return (
    <div className="space-y-5">
      <Link href="/nerd-herd/ai" className="inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />AI maintenance</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[1.125rem] font-semibold text-ink">AI-{j.number} · {KIND_LABEL[j.kind]}{j.websites ? ` · ${j.websites.domain}` : ""}</h2>
          <p className="text-[0.8125rem] text-ink-muted">
            {j.websites?.customers ? <Link href={`/clients/${j.websites.customers.id}?tab=web`} className="font-medium text-brand-600 hover:underline">{j.websites.customers.name}</Link> : "No client"}
            {j.websites && <>{" · "}<Link href={`/nerd-herd/websites/${j.websites.id}`} className="hover:underline">Website file</Link>{" · "}<a href={`https://${j.websites.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">Visit <ExternalLink className="h-3 w-3" /></a></>}
            {j.support_tickets && <>{" · "}<Link href={`/nerd-herd/tickets/${j.support_tickets.id}`} className="hover:underline">Ticket #{j.support_tickets.number}</Link></>}
          </p>
        </div>
        <Badge tone={st.tone} dot={running}>{st.label}</Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {running && (
            <Card className="px-5 py-4 text-[0.8125rem] text-ink-muted">
              <span className="font-medium text-ink">Working: </span><AiLiveStatus row={{ id: j.id, number: j.number, domain: j.websites?.domain ?? "", client: null, kind: j.kind, request: j.request, billable: j.billable, source: j.source, status: j.status, stage_note: j.stage_note, report_summary: j.report_summary, changes: (j.changes ?? []).length, when: "", invoice_id: j.invoice_id }} />
              <span className="block pt-1 text-[0.7188rem]">You can leave this page — the job carries on and you'll get a notification when it's done.</span>
            </Card>
          )}
          {(j.status === "failed" || j.error) && j.error && j.error !== "needs_attention" && (
            <Card className="bg-rose-50 px-5 py-3 text-[0.8125rem] text-rose-800">{j.error}</Card>
          )}
          {j.notes && (
            <Card className="bg-amber-50 px-5 py-3 text-[0.8125rem] text-amber-900"><span className="font-semibold">For the technician: </span><span className="whitespace-pre-wrap">{j.notes}</span></Card>
          )}
          <Card>
            <CardHeader title="Report" subtitle={j.report_summary ?? (running ? "Written when the job finishes" : "No report")} />
            <div className="border-t border-line px-5 py-4">{j.report ? <ReportText text={j.report} /> : <p className="text-[0.8125rem] text-ink-muted">{running ? "Claude writes the report when it has finished." : "—"}</p>}</div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={`Changes (${changes.length})`} subtitle="Time-stamped, newest first. Each content change kept an undo copy on the site." />
            {changes.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {changes.map((c, i) => (
                  <li key={`${c.change_id}${i}`} className="flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="min-w-0">
                      <span className={`block text-[0.8125rem] ${c.ok ? "text-ink" : "text-ink-faint line-through"}`}>{c.summary}</span>
                      <span className="block text-[0.7188rem] text-ink-muted">{fmtDateTime(c.at, org.timezone)}</span>
                    </span>
                    {canManage(role) && !running && c.ok && undoable.has(c.change_id) && <UndoChange id={j.id} changeId={c.change_id} />}
                  </li>
                ))}
              </ul>
            ) : <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">{running ? "Changes appear here as they're made." : "No changes were made."}</p>}
          </Card>
          <Card>
            <CardHeader title="Request" />
            <p className="whitespace-pre-wrap border-t border-line px-5 py-4 text-[0.8125rem] text-ink">{j.request}</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Billing" />
            <dl className="space-y-3 border-t border-line px-5 py-4">
              <Field label="Invoiced">{j.source === "quote" ? "Paid by the ticket's quote" : j.billable ? "Yes — draft invoice" : "No — record only"}</Field>
              {hours > 0 && <Field label="Manual web-designer estimate">{hours} h × {money(rateInc, org.currency)} = {money(hours * rateInc, org.currency)} inc GST</Field>}
              {ai.backupHours > 0 && j.backup && j.billable && <Field label="Backup line">{ai.backupHours} h = {money(ai.backupHours * rateInc, org.currency)} inc GST</Field>}
              {(j.hours_breakdown ?? []).length > 0 && (
                <div className="text-[0.75rem] text-ink-muted">
                  {(j.hours_breakdown ?? []).map((b, i) => <div key={i} className="flex justify-between gap-3"><span className="min-w-0">{b.task}</span><span className="shrink-0 tabular-nums">{b.hours} h</span></div>)}
                </div>
              )}
              {j.invoices && <Field label="Invoice">{j.invoices.number ?? "Draft"} · {j.invoices.status} · {money(j.invoices.total, org.currency)}</Field>}
              <div className="pt-1"><AiJobActions id={j.id} status={j.status} canRun={canManage(role)} hasBackup={!!j.backup_id && !!j.backup} invoiceId={j.invoice_id} canInvoice={j.source !== "quote" && (j.changes ?? []).length > 0} /></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Backup" />
            <dl className="space-y-3 border-t border-line px-5 py-4">
              <Field label="Made before the work">{backup ? `${j.backup_scope === "code" ? "Database, themes and plugins" : j.backup_scope === "full" ? "Database and all files" : "Database"} · ${((backup.size ?? 0) / 1048576).toFixed(1)} MB${backup.seconds ? ` · ${backup.seconds}s` : ""}` : running ? "In progress" : "None"}</Field>
              <p className="text-[0.7188rem] text-ink-muted">Kept on the site's own server (web access blocked). The newest 5 backups per site are kept.</p>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-3 border-t border-line px-5 py-4">
              <Field label="Started">{fmtDateTime(j.created_at, org.timezone)}</Field>
              {j.finished_at && <Field label="Finished">{fmtDateTime(j.finished_at, org.timezone)}</Field>}
              {j.kind === "request" && <Field label="Claude">{j.model ?? "—"} · {j.turns} step{j.turns === 1 ? "" : "s"} · about US${Number(j.cost_usd).toFixed(2)}</Field>}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
