"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { deleteShift, editShift, removeEventShift, type ShiftResult } from "./shift-actions";

export interface EditableShift {
  key: string; kind: "event" | "custom"; crewId: string;
  hoursOverride: number | null; rateOverride: number | null; planned: number | null; rate: number;
  title?: string; date?: string | null; start?: string | null; finish?: string | null; location?: string | null; notes?: string | null;
}

const box = "h-8 rounded-md border border-line bg-surface px-2 text-[0.8125rem] text-ink";

/** Change who worked a shift, its hours and rate — and for office shifts, the name, date, times, place and notes. Unpaid shifts only. */
export function ShiftEditor({ s, staff, onDone, minHours }: { s: EditableShift; staff: { id: string; name: string }[]; onDone: () => void; minHours?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [f, setF] = useState({
    crewId: s.crewId, hours: s.hoursOverride == null ? "" : String(s.hoursOverride), rate: s.rateOverride == null ? "" : String(s.rateOverride),
    title: s.title ?? "", date: s.date ?? "", start: s.start?.slice(0, 5) ?? "", finish: s.finish?.slice(0, 5) ?? "", location: s.location ?? "", notes: s.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const run = (fn: () => Promise<ShiftResult>) => start(async () => {
    setErr(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    router.refresh(); onDone();
  });
  const save = () => run(() => editShift(s.key, {
    crewId: f.crewId, hoursOverride: f.hours === "" ? null : Number(f.hours), rateOverride: f.rate === "" ? null : Number(f.rate),
    ...(s.kind === "custom" ? { title: f.title, date: f.date, start: f.start || null, finish: f.finish || null, location: f.location, notes: f.notes } : {}),
  }));
  const remove = () => run(() => s.kind === "custom" ? deleteShift(s.key.slice(2)) : removeEventShift(s.key.slice(2)));
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 px-3 py-3 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Who
          <select value={f.crewId} onChange={(e) => set("crewId", e.target.value)} className={box}>{staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {s.kind === "custom" && <>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="Shift name" className={cn(box, "w-44")} aria-label="Shift name" />
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={box} aria-label="Date" />
          <input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} className={box} aria-label="Start" />–
          <input type="time" value={f.finish} onChange={(e) => set("finish", e.target.value)} className={box} aria-label="Finish" />
        </>}
      </div>
      {s.kind === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={f.location} onChange={(e) => set("location", e.target.value)} maxLength={300} placeholder="Where" className={cn(box, "w-48")} aria-label="Where" />
          <input value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} placeholder="Notes for them" className={cn(box, "min-w-0 flex-1 basis-56")} aria-label="Notes" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Paid hours<input value={f.hours} onChange={(e) => set("hours", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={s.planned == null ? "?" : String(Math.max(s.planned, minHours ?? 0))} className={cn(box, "w-16 text-right tabular")} /></label>
        <label className="flex items-center gap-1">Rate $<input value={f.rate} onChange={(e) => set("rate", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={String(s.rate)} className={cn(box, "w-16 text-right tabular")} />/hr</label>
        <span className="text-ink-faint">Blank = worked out from the times{minHours ? ` (min ${minHours} hrs)` : ""} / their usual rate.</span>
      </div>
      {err && <p className="text-rose-700">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {sure
          ? <span className="flex items-center gap-2"><span className="text-rose-700">Remove this shift completely?</span><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button><Button size="sm" disabled={pending} onClick={remove}>Remove</Button></span>
          : <button type="button" onClick={() => setSure(true)} className="inline-flex items-center gap-1 text-rose-700 hover:underline"><Trash2 className="h-3.5 w-3.5" />Remove shift</button>}
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
        </span>
      </div>
    </div>
  );
}

/** A pencil that opens the editor under a list row. */
export function EditShiftToggle({ s, staff, minHours, children }: { s: EditableShift; staff: { id: string; name: string }[]; minHours?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50">{open ? "Close" : "Edit"}</button>
      </div>
      {open && <ShiftEditor s={s} staff={staff} minHours={minHours} onDone={() => setOpen(false)} />}
    </div>
  );
}
