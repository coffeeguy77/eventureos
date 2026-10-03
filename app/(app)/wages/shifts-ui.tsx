"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { assignPastBooking, assignPastEvent, createShift, deleteShift, endSeries, unassignPastEvent, type ShiftResult } from "./shift-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<ShiftResult>, after?: () => void) => start(async () => {
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error, ok: false });
    if (r.ok) { after?.(); router.refresh(); }
  });
  const note = msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>;
  return { run, pending, note };
}

export type StaffOption = { id: string; name: string };

export function AddShiftForm({ staff, today }: { staff: StaffOption[]; today: string }) {
  const { run, pending, note } = useRun();
  const [open, setOpen] = useState(false);
  const blank = { crewId: staff[0]?.id ?? "", title: "", date: today, start: "07:00", finish: "11:00", location: "", notes: "", repeat: "none" as "none" | "weekly" | "fortnightly", until: "" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  if (!open) return (<div className="space-y-2"><Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add a shift</Button>{note}</div>);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="sh-who">Who</Label><Select id="sh-who" value={f.crewId} onChange={(e) => set("crewId", e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label htmlFor="sh-title">Shift</Label><Input id="sh-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Coffee delivery round" maxLength={120} autoFocus /></div>
        <div><Label htmlFor="sh-date">{f.repeat === "none" ? "Date" : "First date"}</Label><Input id="sh-date" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div><Label htmlFor="sh-start">Start</Label><Input id="sh-start" type="time" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
        <div><Label htmlFor="sh-finish">Finish</Label><Input id="sh-finish" type="time" value={f.finish} onChange={(e) => set("finish", e.target.value)} /></div>
        <div><Label htmlFor="sh-repeat">Repeats</Label>
          <Select id="sh-repeat" value={f.repeat} onChange={(e) => set("repeat", e.target.value as typeof f.repeat)}>
            <option value="none">Just once</option><option value="weekly">Every week</option><option value="fortnightly">Every fortnight</option>
          </Select></div>
        {f.repeat !== "none" && <div><Label htmlFor="sh-until" hint="optional">Until</Label><Input id="sh-until" type="date" value={f.until} min={f.date} onChange={(e) => set("until", e.target.value)} /></div>}
        <div className={f.repeat !== "none" ? "" : "sm:col-span-2"}><Label htmlFor="sh-loc">Where</Label><Input id="sh-loc" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Roastery, Fyshwick" maxLength={300} /></div>
        <div className="sm:col-span-3"><Label htmlFor="sh-notes" hint="shown in their app and calendar invite">Notes</Label><Textarea id="sh-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} placeholder="e.g. Pick up the van keys from the café; deliveries list is in the folder" /></div>
      </div>
      {note}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending || !f.title.trim() || !f.crewId} onClick={() => run(() => createShift({ ...f, start: f.start || null, finish: f.finish || null, until: f.until || null }), () => { setF(blank); setOpen(false); })}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}{f.repeat === "none" ? "Add shift" : "Set regular shift"}
        </Button>
      </div>
    </div>
  );
}

export function DeleteShiftButton({ id, label }: { id: string; label: string }) {
  const { run, pending, note } = useRun();
  return (<span className="inline-flex items-center gap-2">{note}<button type="button" disabled={pending} onClick={() => run(() => deleteShift(id))} aria-label={`Remove ${label}`} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button></span>);
}

export function EndSeriesButton({ id }: { id: string }) {
  const { run, pending, note } = useRun();
  const [sure, setSure] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">{note}
      {sure ? <><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button><Button size="sm" disabled={pending} onClick={() => run(() => endSeries(id))}>Stop it</Button></>
        : <Button size="sm" variant="ghost" onClick={() => setSure(true)}>Stop</Button>}
    </span>
  );
}

/** "Who worked it?" — add staff to a past event or Google Calendar booking. */
export function AssignWorked({ kind, id, staff, assigned }: { kind: "event" | "booking"; id: string; staff: StaffOption[]; assigned: { key: string; crewId: string; name: string; paid: boolean; kind: "event" | "custom" }[] }) {
  const { run, pending, note } = useRun();
  const [pick, setPick] = useState("");
  const free = staff.filter((s) => !assigned.some((a) => a.crewId === s.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((a) => (
        <span key={a.key} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-2.5 pr-1 text-[0.75rem] text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {a.name}{a.paid && <span className="text-[0.6875rem] text-emerald-600">· paid</span>}
          {!a.paid && <button type="button" disabled={pending} aria-label={`Remove ${a.name}`} onClick={() => run(() => a.kind === "event" ? unassignPastEvent(a.key.slice(2)) : deleteShift(a.key.slice(2)))} className="rounded-full p-0.5 hover:bg-emerald-100"><X className="h-3 w-3" /></button>}
        </span>
      ))}
      {free.length > 0 && (
        <select value={pick} disabled={pending} aria-label="Who worked it"
          onChange={(e) => { const v = e.target.value; setPick(""); if (v) run(() => kind === "event" ? assignPastEvent(id, v) : assignPastBooking(id, v)); }}
          className="h-7 rounded-md border border-line bg-surface px-1.5 text-[0.75rem] text-ink-muted">
          <option value="">+ Who worked it?</option>
          {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
      {note}
    </div>
  );
}
