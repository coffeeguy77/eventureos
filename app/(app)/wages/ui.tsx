"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmtDate, money } from "@/lib/format";
import { fmtHours } from "@/lib/crew/shifts";
import type { WageShift } from "@/lib/crew/wages";
import { adjustShift, decideHourClaim, markShiftsPaid, undoPayment, type WageResult } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<WageResult>, after?: () => void) => start(async () => {
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error, ok: false });
    if (r.ok) { after?.(); router.refresh(); }
  });
  return { run, pending, msg };
}

export function ClaimRow({ c }: { c: { id: string; hours: number; reason: string; who: string; job: string; eventId: string | null; date: string; paid: boolean } }) {
  const { run, pending, msg } = useRun();
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[0.8438rem] font-medium text-ink">{c.who} · +{fmtHours(c.hours)}</p>
        <p className="text-[0.75rem] text-ink-muted">{c.eventId ? <Link href={`/events/${c.eventId}`} className="hover:text-brand-700">{c.job}</Link> : c.job} · {c.date}{c.paid ? " · already paid" : ""}</p>
        <p className="mt-0.5 text-[0.7812rem] italic text-ink">“{c.reason}”</p>
        {msg && !msg.ok && <p className="text-[0.75rem] text-rose-700">{msg.text}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideHourClaim(c.id, false))}><X className="h-4 w-4" />Decline</Button>
        <Button size="sm" variant="primary" disabled={pending || c.paid} onClick={() => run(() => decideHourClaim(c.id, true))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve</Button>
      </div>
    </li>
  );
}

export function OwedCard({ crewId, name, shifts, currency, today }: { crewId: string; name: string; shifts: WageShift[]; currency: string; today: string }) {
  const { run, pending, msg } = useRun();
  const [picked, setPicked] = useState<string[]>(shifts.filter((s) => s.amount != null).map((s) => s.key));
  const [paidOn, setPaidOn] = useState(today);
  const [ref, setRef] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const sel = useMemo(() => shifts.filter((s) => picked.includes(s.key)), [shifts, picked]);
  const total = sel.reduce((t, s) => t + (s.amount ?? 0), 0);
  const hours = sel.reduce((t, s) => t + (s.hours ?? 0), 0);
  const all = shifts.filter((s) => s.amount != null);
  return (
    <Card>
      <CardHeader title={name} subtitle={`${shifts.length} shift${shifts.length === 1 ? "" : "s"} owed · ${money(shifts.reduce((t, s) => t + (s.amount ?? 0), 0), currency, { cents: true })}`}
        action={<button type="button" className="text-[0.75rem] font-medium text-brand-700 hover:underline" onClick={() => setPicked(picked.length === all.length ? [] : all.map((s) => s.key))}>{picked.length === all.length ? "Untick all" : "Tick all"}</button>} />
      <ul className="divide-y divide-line border-t border-line">
        {shifts.map((s) => (
          <li key={s.key} className={cn("px-5 py-2.5", !picked.includes(s.key) && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-3">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={picked.includes(s.key)} disabled={s.amount == null}
                onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key))} aria-label={`Pay ${s.eventName}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium text-ink">{s.eventId ? <Link href={`/events/${s.eventId}`} className="hover:text-brand-700">{s.eventName}</Link> : <>{s.eventName} <span className="font-normal text-ink-faint">· shift</span></>}</p>
                <p className="text-[0.7188rem] text-ink-muted">{s.date ? fmtDate(s.date) : "TBC"} · {s.start ?? "?"}–{s.finish ?? "?"}
                  {s.hoursOverride != null && <span className="text-amber-700"> · hours changed</span>}
                  {s.extraApproved > 0 && <span> · +{fmtHours(s.extraApproved)} extra</span>}
                  {s.extraPending > 0 && <span className="text-amber-700"> · +{fmtHours(s.extraPending)} waiting approval</span>}</p>
              </div>
              <p className="w-28 text-right text-[0.75rem] tabular text-ink-muted">{fmtHours(s.hours)} × {money(s.rate, currency, { cents: true })}</p>
              <p className="w-20 text-right text-[0.8438rem] font-semibold tabular text-ink">{s.amount != null ? money(s.amount, currency, { cents: true }) : "No times"}</p>
              <button type="button" onClick={() => setEdit(edit === s.key ? null : s.key)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label="Change hours or rate"><Pencil className="h-3.5 w-3.5" /></button>
            </div>
            {edit === s.key && <AdjustForm s={s} onDone={() => setEdit(null)} />}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-zinc-50/60 px-5 py-3">
        <p className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted"><b className="text-[1rem] text-ink">{money(total, currency, { cents: true })}</b> for {sel.length} shift{sel.length === 1 ? "" : "s"} · {fmtHours(Math.round(hours * 100) / 100)}</p>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">Paid on<input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-[0.8125rem] text-ink" /></label>
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder="Reference (as on their bank statement)" className="h-9 w-56 rounded-md border border-line bg-surface px-2 text-[0.8125rem] text-ink" />
        <Button variant="primary" size="sm" className="h-9" disabled={pending || !sel.length} onClick={() => run(() => markShiftsPaid(crewId, picked, paidOn, ref), () => { setRef(""); })}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}Mark {sel.length ? money(total, currency, { cents: true }) : ""} paid
        </Button>
        {msg && <p className={cn("w-full text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      </div>
    </Card>
  );
}

function AdjustForm({ s, onDone }: { s: WageShift; onDone: () => void }) {
  const { run, pending, msg } = useRun();
  const [h, setH] = useState(s.hoursOverride == null ? "" : String(s.hoursOverride));
  const [r, setR] = useState(s.rateOverride == null ? "" : String(s.rateOverride));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">
      <label className="flex items-center gap-1">Hours<input value={h} onChange={(e) => setH(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={s.planned == null ? "?" : String(s.planned)} className="h-8 w-16 rounded border border-line bg-surface px-2 text-right tabular text-ink" /></label>
      <label className="flex items-center gap-1">Rate $<input value={r} onChange={(e) => setR(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={String(s.rate)} className="h-8 w-16 rounded border border-line bg-surface px-2 text-right tabular text-ink" />/hr</label>
      <span className="text-ink-faint">Blank = planned hours / their usual rate. Approved extra hours are added on top.</span>
      <Button size="sm" variant="primary" className="ml-auto h-8" disabled={pending} onClick={() => run(() => adjustShift(s.key, h === "" ? null : Number(h), r === "" ? null : Number(r)), onDone)}>Save</Button>
      {msg && !msg.ok && <p className="w-full text-rose-700">{msg.text}</p>}
    </div>
  );
}

export function PaymentRow({ p, canUndo }: { p: { id: string; when: string; who: string; hours: string; amount: string; reference: string | null }; canUndo: boolean }) {
  const { run, pending, msg } = useRun();
  const [sure, setSure] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium text-ink">{p.who} · {p.amount}</p>
        <p className="text-[0.7188rem] text-ink-muted">{p.when} · {p.hours}{p.reference ? ` · Ref ${p.reference}` : ""}</p>
        {msg && !msg.ok && <p className="text-[0.75rem] text-rose-700">{msg.text}</p>}
      </div>
      {canUndo && (sure
        ? <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button><Button size="sm" disabled={pending} onClick={() => run(() => undoPayment(p.id))}>Undo payment</Button></span>
        : <button type="button" onClick={() => setSure(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] text-ink-faint hover:bg-zinc-100 hover:text-ink"><Undo2 className="h-3.5 w-3.5" />Undo</button>)}
    </li>
  );
}
