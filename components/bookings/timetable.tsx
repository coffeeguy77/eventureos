"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { saveSchedules } from "@/app/(app)/bookings/actions";
import type { Closure, Schedule } from "@/lib/bookings/core";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AHEAD = [30, 45, 60, 90];

/** Weekly timetable per course: dates are opened for booking automatically, the set number of days ahead. */
export function TimetableEditor({ courses, schedules, closures }: { courses: { id: string; name: string }[]; schedules: Schedule[]; closures: Closure[] }) {
  const router = useRouter();
  const blank = (id: string): Schedule => ({ course_id: id, weekdays: [], times: [], days_ahead: 60, active: false });
  const [rows, setRows] = useState<Schedule[]>(courses.map((c) => schedules.find((s) => s.course_id === c.id) ?? blank(c.id)));
  const [cls, setCls] = useState<Closure[]>(closures);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<Schedule>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = () => start(async () => {
    setMsg(null);
    const bad = rows.find((r) => r.active && (!r.weekdays.length || !r.times.length));
    if (bad) { setMsg({ ok: false, text: `${courses.find((c) => c.id === bad.course_id)?.name}: choose a day and a start time, or turn it off.` }); return; }
    const r = await saveSchedules(rows.filter((x) => x.weekdays.length && x.times.length), cls.filter((c) => c.from))
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><CalendarClock className="h-4 w-4" />Weekly timetable</p>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">Dates open for booking automatically and keep rolling forward. To skip one date, cancel that session.</p>
      <div className="mt-3 space-y-3">
        {rows.map((r, i) => (
          <div key={r.course_id} className={cn("rounded-lg border border-line p-3", !r.active && "bg-zinc-50")}>
            <label className="flex items-center justify-between gap-2 text-[0.875rem] font-semibold text-ink">
              <span className="min-w-0 truncate">{courses[i].name}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[0.8125rem] font-medium text-ink-muted">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand-500,#0f766e)]" checked={r.active} onChange={(e) => set(i, { active: e.target.checked, weekdays: r.weekdays.length ? r.weekdays : [6], times: r.times.length ? r.times : ["10:00"] })} />
                {r.active ? "On" : "Off"}
              </span>
            </label>
            {r.active && (
              <div className="mt-2.5 grid gap-2.5">
                <div className="flex flex-wrap gap-1">{DAYS.map((d, w) => (
                  <button key={d} type="button" aria-pressed={r.weekdays.includes(w)} onClick={() => set(i, { weekdays: r.weekdays.includes(w) ? r.weekdays.filter((x) => x !== w) : [...r.weekdays, w].sort() })}
                    className={cn("h-9 w-11 rounded-lg text-[0.78rem] font-medium ring-1 ring-inset", r.weekdays.includes(w) ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink ring-line-strong hover:bg-zinc-50")}>{d}</button>
                ))}</div>
                <div><Label>Start times</Label>
                  <div className="space-y-1.5">
                    {r.times.map((t, k) => (
                      <div key={k} className="flex gap-1.5"><Input type="time" value={t} onChange={(e) => set(i, { times: r.times.map((x, j) => (j === k ? e.target.value : x)) })} />
                        {r.times.length > 1 && <button type="button" onClick={() => set(i, { times: r.times.filter((_, j) => j !== k) })} className="rounded px-2 text-ink-faint hover:bg-zinc-100" aria-label="Remove time"><Trash2 className="h-4 w-4" /></button>}</div>
                    ))}
                    {r.times.length < 6 && <Button size="sm" onClick={() => set(i, { times: [...r.times, "14:00"] })}><Plus className="h-3.5 w-3.5" />Another time</Button>}
                  </div>
                </div>
                <div><Label>Open for booking</Label>
                  <Select value={String(r.days_ahead)} onChange={(e) => set(i, { days_ahead: Number(e.target.value) })}>
                    {[...new Set([...AHEAD, r.days_ahead])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} days ahead{n === 60 ? " (about 2 months)" : ""}</option>)}
                  </Select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-[0.875rem] font-semibold text-ink">Closed periods</p>
      <p className="text-[0.8125rem] text-ink-muted">No timetable dates are added between these dates (e.g. Christmas).</p>
      <div className="mt-2 space-y-2">
        {cls.map((c, i) => (
          <div key={i} className="rounded-lg border border-line p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>From</Label><Input type="date" value={c.from} onChange={(e) => setCls(cls.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /></div>
              <div><Label>Until</Label><Input type="date" value={c.to} onChange={(e) => setCls(cls.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} /></div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <Input value={c.label ?? ""} placeholder="e.g. Christmas break" onChange={(e) => setCls(cls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" onClick={() => setCls(cls.filter((_, j) => j !== i))} className="rounded px-2 text-ink-faint hover:bg-zinc-100" aria-label="Remove closed period"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        <Button size="sm" onClick={() => setCls([...cls, { from: "", to: "", label: null }])}><Plus className="h-3.5 w-3.5" />Add closed period</Button>
      </div>

      <Button variant="primary" className="mt-4 w-full" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save timetable</Button>
      {msg && <p className={cn("mt-2 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
