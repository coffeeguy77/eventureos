"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NERD_JOBS, nerdJob, type NerdJobKey } from "@/lib/accounts/nerd-jobs";
import { addAccountTodo, raiseNerdJob, setAccountTodo } from "@/app/(app)/accounts/todo-actions";

export interface TodoRow { id: string; title: string; due: string | null; overdue: boolean }
export interface JobRow { id: string; number: number; subject: string; status: string }
const STATUS: Record<string, string> = { new: "New", open: "Open", in_progress: "In progress", waiting: "Waiting", on_hold: "On hold", resolved: "Done", closed: "Closed" };

/** On an Accounts customer: my to-dos for them, and jobs handed to Nerd Herd (delete / suspend a website, or anything else). */
export function TodoPanel({ customerId, todos, jobs, sites, nerdHerd, ticketLinks }: {
  customerId: string; todos: TodoRow[]; jobs: JobRow[]; sites: string[]; nerdHerd: boolean; ticketLinks: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [jobOpen, setJobOpen] = useState(false);
  const [job, setJob] = useState<NerdJobKey>("delete_site");
  const [site, setSite] = useState(sites[0] ?? "");
  const [typed, setTyped] = useState(sites.length === 0);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const j = nerdJob(job)!;
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) => start(async () => {
    setErr(null); setOk(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error ?? "Something went wrong."); return; }
    setOk(done); after?.(); router.refresh();
  });

  return (
    <Card className="p-4 text-[0.8125rem]">
      <p className="font-semibold text-ink">To-do</p>
      <p className="mb-2 text-[0.75rem] text-ink-muted">Your reminders for this customer — all of them are on Accounts → To-do.</p>
      {todos.length > 0 && (
        <ul className="mb-2 space-y-1">
          {todos.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button type="button" disabled={pending} onClick={() => go(() => setAccountTodo(t.id, true), "Done ✓")} aria-label={`Done: ${t.title}`}
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ring-inset ring-line-strong hover:bg-emerald-50 hover:ring-emerald-400"><Check className="h-3.5 w-3.5 text-transparent hover:text-emerald-600" /></button>
              <span className="min-w-0 flex-1 text-ink">{t.title}{t.due && <span className={cn("ml-1 text-[0.75rem]", t.overdue ? "font-medium text-rose-700" : "text-ink-muted")}>· {t.due}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ring Donald back about INV-4150" aria-label="New to-do" className="min-w-0 flex-1 basis-48" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" className="w-full sm:w-36" />
        <Button size="sm" disabled={pending || !title.trim()} onClick={() => go(() => addAccountTodo(customerId, title, due || null), "Added to your to-do list.", () => { setTitle(""); setDue(""); })}><Plus className="h-4 w-4" />Add</Button>
      </div>

      {nerdHerd && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-semibold text-ink">Nerd Herd</p>
            {!jobOpen && <Button size="sm" onClick={() => { setJobOpen(true); setErr(null); setOk(null); }}><Wrench className="h-4 w-4" />Send a job</Button>}
          </div>
          {jobs.length > 0 && (
            <ul className="mt-2 space-y-1">
              {jobs.map((x) => (
                <li key={x.id} className="flex items-baseline gap-2">
                  {ticketLinks ? <a href={`/nerd-herd/tickets/${x.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand-700 hover:underline">#{x.number} {x.subject}</a> : <span className="min-w-0 flex-1 truncate text-ink">#{x.number} {x.subject}</span>}
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", ["resolved", "closed"].includes(x.status) ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-ink-muted")}>{STATUS[x.status] ?? x.status}</span>
                </li>
              ))}
            </ul>
          )}
          {jobOpen && (
            <div className="mt-3 space-y-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-line">
              <div><Label htmlFor="nj-job">What needs doing</Label>
                <Select id="nj-job" value={job} onChange={(e) => { setJob(e.target.value as NerdJobKey); setReason(""); }}>{NERD_JOBS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></div>
              {j.site && (
                <div><Label htmlFor="nj-site" hint={sites.length ? "from their hosting" : "type the website"}>Website</Label>
                  {sites.length > 0 && !typed ? (
                    <Select id="nj-site" value={site} onChange={(e) => { if (e.target.value === "__typed") { setTyped(true); setSite(""); } else setSite(e.target.value); }}>
                      {sites.map((d) => <option key={d} value={d}>{d}</option>)}
                      <option value="__typed">Another website — type it…</option>
                    </Select>
                  ) : (
                    <Input id="nj-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. lockdoctor.com.au" autoFocus={typed && sites.length > 0} />
                  )}
                  {typed && sites.length > 0 && <button type="button" onClick={() => { setTyped(false); setSite(sites[0]); }} className="mt-1 text-[0.75rem] font-medium text-brand-700 hover:underline">Pick from their websites</button>}
                </div>
              )}
              {job === "other" && <div><Label htmlFor="nj-title">Job</Label><Input id="nj-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Remove Donald's email account" /></div>}
              {j.reasons.length > 0 && (
                <div><Label htmlFor="nj-reason">Reason</Label>
                  <Select id="nj-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose…</option>{j.reasons.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
              )}
              <div><Label htmlFor="nj-note" hint="optional">Notes for Nerd Herd</Label><Textarea id="nj-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who you spoke to, anything to keep (emails, backups)…" /></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={pending} onClick={() => go(async () => {
                  const r = await raiseNerdJob(customerId, { job, site, reason, note, title: jobTitle });
                  return r.ok ? { ok: true } : r;
                }, "Sent to Nerd Herd — it's on their jobs board.", () => { setJobOpen(false); setNote(""); setReason(""); setJobTitle(""); })}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Send to Nerd Herd
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setJobOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {err && <div className="mt-2"><FormError message={err} /></div>}
      {ok && <p className="mt-2 text-[0.75rem] text-emerald-700">{ok}</p>}
    </Card>
  );
}
