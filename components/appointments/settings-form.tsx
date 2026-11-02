"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, MapPin, Phone, Plus, Trash2, Video } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { ApptKind, ApptSettings } from "@/lib/appointments/core";
import { saveApptSettings } from "@/app/(app)/calendar/appointment-actions";

const DAYS: [string, string][] = [["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"]];
const DUR = [15, 20, 30, 45, 60, 90, 120];
const KINDS: [ApptKind, string, typeof Video][] = [["video", "Video call", Video], ["phone", "Phone call", Phone], ["in_person", "In person", MapPin]];
const dur = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} h`);

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 text-left disabled:opacity-60">
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand-600" : "bg-ink/20")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", on ? "left-[22px]" : "left-0.5")} /></span>
      <span className="min-w-0"><span className="block text-[0.875rem] font-medium text-ink">{label}</span>{hint && <span className="block text-[0.75rem] text-ink-muted">{hint}</span>}</span>
    </button>
  );
}

/** Booking settings: when clients can book, how much notice, days you're away, and the public page. */
export function ApptSettingsForm({ initial, canEdit, bookingUrl, tz }: { initial: ApptSettings; canEdit: boolean; bookingUrl: string; tz: string }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [block, setBlock] = useState({ from: "", to: "", reason: "" });
  const set = <K extends keyof ApptSettings>(k: K, v: ApptSettings[K]) => { setS({ ...s, [k]: v }); };
  const setDay = (d: string, ranges: [string, string][]) => set("weekly", { ...s.weekly, [d]: ranges });
  const save = () => start(async () => { setMsg({ ok: "Saving…" }); const r = await saveApptSettings(s); setMsg(r.ok ? { ok: "Saved ✓" } : { error: r.error }); });
  // every change saves itself (a moment after you stop) — no hunting for a Save button
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!canEdit) return;
    const t = setTimeout(save, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  const dis = !canEdit;

  return (
    <div>
      <div className="mb-5">
        <p className="text-[0.75rem] font-medium text-ink-faint"><Link href="/calendar" className="hover:text-ink">Calendar</Link> / <Link href="/calendar/appointments" className="hover:text-ink">Appointments</Link> / Settings</p>
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">Booking settings</h1>
        <p className="mt-1 text-[0.8438rem] text-ink-muted">Changes save automatically. When clients can book a meeting with you. Times are {tz.replace("_", " ")}. Anything already on your calendar is never offered.</p>
      </div>
      {!canEdit && <p className="mb-4 rounded-xl bg-amber-500/15 px-4 py-3 text-[0.875rem] text-amber-700 dark:text-amber-300">Only owners, admins and managers can change these.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Online booking" subtitle="Your public page where clients pick a time" />
            <div className="space-y-4 border-t border-line p-4 sm:p-5">
              <Toggle disabled={dis} on={s.enabled} onChange={(v) => set("enabled", v)} label="Let clients book online" hint={s.enabled ? "Your booking page is live" : "Off — the page says booking isn't open"} />
              <div className="flex items-center gap-2 rounded-xl bg-canvas p-3 ring-1 ring-line">
                <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">{bookingUrl.replace(/^https?:\/\//, "")}</span>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(bookingUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[0.75rem] font-semibold ring-1 ring-line hover:bg-surface">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>
                <a href={bookingUrl} target="_blank" rel="noreferrer" aria-label="Preview" className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-line hover:bg-surface"><ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
              <Toggle disabled={dis} on={s.on_website} onChange={(v) => set("on_website", v)} label="Show “Book a meeting” on your website" hint="Adds the button to your EventureOS website" />
              <Toggle disabled={dis} on={s.auto_confirm} onChange={(v) => set("auto_confirm", v)} label="Confirm online bookings straight away" hint={s.auto_confirm ? "They're booked as soon as they pick a time" : "They wait for you to confirm — you'll get a notification"} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Page heading</Label><Input disabled={dis} value={s.title} onChange={(e) => set("title", e.target.value)} /></div>
                <div className="sm:col-span-2"><Label>Intro</Label><Textarea disabled={dis} rows={3} value={s.intro} onChange={(e) => set("intro", e.target.value)} placeholder="e.g. Book a free 30-minute chat about your website, hosting or IT." /></div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="When you're available" subtitle="Clients can only pick times inside these hours" />
            <ul className="divide-y divide-line border-t border-line">
              {DAYS.map(([d, name]) => { const ranges = s.weekly[d] ?? []; const on = ranges.length > 0; return (
                <li key={d} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:px-5">
                  <div className="w-36 shrink-0 pt-1.5"><Toggle disabled={dis} on={on} onChange={(v) => setDay(d, v ? [["09:00", "17:00"]] : [])} label={name} /></div>
                  <div className="flex-1 space-y-2">
                    {!on ? <p className="pt-2 text-[0.8125rem] text-ink-faint">Unavailable</p> : ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input disabled={dis} type="time" step={900} className="w-32" value={r[0]} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                        <span className="text-ink-faint">–</span>
                        <Input disabled={dis} type="time" step={900} className="w-32" value={r[1]} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                        {ranges.length > 1 && <button type="button" disabled={dis} aria-label="Remove" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} className="rounded-md p-2 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                        {i === ranges.length - 1 && ranges.length < 4 && <button type="button" disabled={dis} aria-label="Add a split" title="Add another block (e.g. after lunch)" onClick={() => setDay(d, [...ranges, ["13:00", "17:00"]])} className="rounded-md p-2 text-ink-faint hover:text-ink"><Plus className="h-4 w-4" /></button>}
                      </div>
                    ))}
                  </div>
                </li>
              ); })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Days you're away" subtitle="Holidays, conferences, busy days — no bookings on these" />
            <div className="space-y-3 border-t border-line p-4 sm:p-5">
              {s.blocked.length === 0 && <p className="text-[0.8125rem] text-ink-faint">None yet.</p>}
              {s.blocked.map((b, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-line">
                  <span className="min-w-0 flex-1 text-[0.875rem] text-ink"><span className="font-semibold">{b.from === b.to ? b.from : `${b.from} → ${b.to}`}</span>{b.reason && <span className="text-ink-muted"> · {b.reason}</span>}</span>
                  <button type="button" disabled={dis} aria-label="Remove" onClick={() => set("blocked", s.blocked.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                <Input disabled={dis} type="date" value={block.from} onChange={(e) => setBlock({ ...block, from: e.target.value, to: block.to && block.to >= e.target.value ? block.to : e.target.value })} aria-label="From" />
                <Input disabled={dis} type="date" value={block.to} min={block.from} onChange={(e) => setBlock({ ...block, to: e.target.value })} aria-label="To" />
                <Input disabled={dis} placeholder="Reason (optional)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
                <Button disabled={dis || !block.from} onClick={() => { set("blocked", [...s.blocked, { from: block.from, to: block.to || block.from, reason: block.reason }].sort((a, b) => a.from.localeCompare(b.from))); setBlock({ from: "", to: "", reason: "" }); }}><Plus className="h-4 w-4" />Add</Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Rules" />
            <div className="space-y-4 border-t border-line p-4 sm:p-5">
              <div><Label hint="The earliest a client can book from now">Notice</Label><Select disabled={dis} value={s.notice_hours} onChange={(e) => set("notice_hours", Number(e.target.value))}>{[0, 2, 4, 12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h === 0 ? "No notice" : h < 24 ? `${h} hours` : h === 168 ? "1 week" : `${h / 24} day${h > 24 ? "s" : ""} (${h} hours)`}</option>)}</Select></div>
              <div><Label hint="Kept free before and after each meeting">Buffer</Label><Select disabled={dis} value={s.buffer} onChange={(e) => set("buffer", Number(e.target.value))}>{[0, 5, 10, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m ? `${m} min` : "None"}</option>)}</Select></div>
              <div><Label hint="How far ahead they can book">Booking window</Label><Select disabled={dis} value={s.horizon_days} onChange={(e) => set("horizon_days", Number(e.target.value))}>{[7, 14, 21, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</Select></div>
              <div><Label hint="Start times are offered every…">Start times</Label><Select disabled={dis} value={s.step} onChange={(e) => set("step", Number(e.target.value))}>{[15, 30, 60].map((m) => <option key={m} value={m}>Every {m} min</option>)}</Select></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Meetings clients can choose" />
            <div className="space-y-4 border-t border-line p-4 sm:p-5">
              <div><Label>Lengths</Label><div className="flex flex-wrap gap-2">{DUR.map((d) => { const on = s.durations.includes(d); return <button key={d} type="button" disabled={dis} onClick={() => set("durations", on ? (s.durations.length > 1 ? s.durations.filter((x) => x !== d) : s.durations) : [...s.durations, d].sort((a, b) => a - b))} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ring-1", on ? "bg-brand-600 text-white ring-transparent" : "text-ink ring-line")}>{dur(d)}</button>; })}</div></div>
              <div><Label>Ways to meet</Label><div className="space-y-2">{KINDS.map(([k, l, I]) => { const on = s.kinds.includes(k); return <button key={k} type="button" disabled={dis} onClick={() => set("kinds", on ? (s.kinds.length > 1 ? s.kinds.filter((x) => x !== k) : s.kinds) : [...s.kinds, k])} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1", on ? "bg-brand-500/10 ring-brand-500/40" : "ring-line")}><I className="h-4 w-4 text-ink-muted" /><span className="flex-1 text-[0.875rem] font-medium text-ink">{l}</span>{on && <Check className="h-4 w-4 text-brand-600" />}</button>; })}</div></div>
              {s.kinds.includes("in_person") && <div><Label>Meeting place</Label><Input disabled={dis} value={s.location} onChange={(e) => set("location", e.target.value)} placeholder="Your office address" /></div>}
              {s.kinds.includes("video") && <div><Label hint="Optional — your standing Google Meet / Zoom room">Video link</Label><Input disabled={dis} value={s.meeting_url} onChange={(e) => set("meeting_url", e.target.value)} placeholder="https://meet.google.com/…" /></div>}
            </div>
          </Card>
        </div>
      </div>

      {canEdit && (
        <div className="pb-safe sticky bottom-0 z-30 mt-6 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
          <div className="flex items-center justify-end gap-3">
            {msg && <span className={cn("text-[0.8125rem] font-medium", msg.error ? "text-rose-600" : "text-emerald-600")}>{msg.error ?? msg.ok}</span>}
            <Button variant="primary" className="h-11 px-8" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save now</Button>
          </div>
        </div>
      )}
    </div>
  );
}
