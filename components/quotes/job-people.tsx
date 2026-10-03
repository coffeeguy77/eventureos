"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Users, X } from "lucide-react";
import { addJobPerson, removeJobPerson } from "@/app/(app)/events/staff-actions";
import { cn } from "@/lib/cn";

export interface JobPerson { linkId: string; contactId: string; name: string; email: string | null; main: boolean }
export interface ClientPerson { id: string; name: string; email: string | null }

/**
 * Who at the client this job is with. Only these people are ticked when the quote is emailed — others at the same
 * organisation (who look after different events) stay on file but aren't sent anything unless added here.
 */
export function JobPeople({ eventId, people, others, clientName }: { eventId: string; people: JobPerson[]; others: ClientPerson[]; clientName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ first: string; last: string; email: string } | null>(null);
  const rest = others.filter((o) => !people.some((p) => p.contactId === o.id));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setErr(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) setErr(r.error ?? "Something went wrong."); else { after?.(); router.refresh(); }
  });

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-[0.8125rem]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink"><Users className="h-4 w-4 text-ink-faint" />People on this job</span>
        {people.length === 0 && <span className="text-ink-muted">Nobody yet — add who this quote is for.</span>}
        {people.map((p) => (
          <span key={p.linkId} className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[0.75rem] ring-1 ring-inset", p.main ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-zinc-50 text-ink ring-line")}
            title={p.email ?? "No email"}>
            {p.name}{p.main && <span className="text-[0.6875rem] text-brand-600">· main</span>}{!p.email && <span className="text-[0.6875rem] text-amber-700">· no email</span>}
            {!p.main && (
              <button type="button" disabled={pending} onClick={() => run(() => removeJobPerson(p.linkId))} aria-label={`Take ${p.name} off this job`} className="rounded-full p-0.5 text-ink-faint hover:bg-zinc-200 hover:text-ink"><X className="h-3 w-3" /></button>
            )}
          </span>
        ))}
        <button type="button" onClick={() => { setAdding((a) => !a); setForm(null); }} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50">
          <Plus className="h-3.5 w-3.5" />Add person
        </button>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
      </div>
      {adding && (
        <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          {rest.length > 0 && (
            <div>
              <p className="mb-1 text-[0.7188rem] text-ink-faint">Other people at {clientName}</p>
              <div className="flex flex-wrap gap-1.5">
                {rest.map((o) => (
                  <button key={o.id} type="button" disabled={pending} onClick={() => run(() => addJobPerson(eventId, { contactId: o.id }))}
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[0.75rem] text-ink ring-1 ring-inset ring-line hover:ring-brand-300">
                    <Plus className="h-3 w-3 text-ink-faint" />{o.name}{o.email ? <span className="text-ink-faint">· {o.email}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
          {form ? (
            <div className="flex flex-wrap items-center gap-2">
              <input autoFocus placeholder="First name" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} className="h-9 w-32 rounded-md border border-line px-2 text-[0.8125rem]" />
              <input placeholder="Last name" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} className="h-9 w-32 rounded-md border border-line px-2 text-[0.8125rem]" />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9 min-w-0 flex-1 basis-48 rounded-md border border-line px-2 text-[0.8125rem]" />
              <button type="button" disabled={pending || !form.first.trim()} onClick={() => run(() => addJobPerson(eventId, form), () => setForm(null))}
                className="h-9 rounded-md bg-brand-600 px-3 text-[0.8125rem] font-medium text-on-brand disabled:opacity-60">Add to job</button>
            </div>
          ) : (
            <button type="button" onClick={() => setForm({ first: "", last: "", email: "" })} className="text-[0.75rem] font-medium text-brand-700 hover:underline">+ Someone new at {clientName}</button>
          )}
        </div>
      )}
      {err && <p className="mt-1.5 text-[0.75rem] text-rose-700">{err}</p>}
      <p className="mt-1.5 text-[0.7188rem] text-ink-faint">Only these people are ticked when you email the quote. Others stay on file but aren&apos;t sent anything.</p>
    </div>
  );
}
