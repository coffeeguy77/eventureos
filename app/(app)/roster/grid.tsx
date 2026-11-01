"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDate, money } from "@/lib/format";
import { shiftWarnings, type PlainWeek } from "@/lib/roster/warnings";
import { copyPreviousWeek, decideLeave, decideOffer, deleteRosterShift, publishWeek, saveRosterShift, textWeek } from "./actions";

type Shift = PlainWeek["shifts"][number];
type Draft = { id: string | null; crewId: string | null; areaId: string | null; date: string; start: string; finish: string; breakMinutes: number; notes: string; also: string[] };
const TYPE = { casual: "Casual", part_time: "Part-time", full_time: "Full-time" } as const;
const t5 = (x: string) => x.slice(0, 5);
const len = (s: { start_time: string; finish_time: string; break_minutes: number }) => {
  const a = Number(s.start_time.slice(0, 2)) * 60 + Number(s.start_time.slice(3, 5));
  let b = Number(s.finish_time.slice(0, 2)) * 60 + Number(s.finish_time.slice(3, 5));
  if (b <= a) b += 1440;
  return Math.max(0, b - a - s.break_minutes) / 60;
};
const hrs = (n: number) => `${Math.round(n * 100) / 100}h`;

export function RosterGrid({ week, today, prev, next, smsOn = false, meal = { after_hours: 5, minutes: 30 } }: { week: PlainWeek; today: string; prev: string; next: string; smsOn?: boolean; meal?: { after_hours: number; minutes: number } }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(smsOn);
  const [pending, start] = useTransition();
  const areas = week.areas.filter((a) => a.active);
  const areaOf = (id: string | null) => week.areas.find((a) => a.id === id) ?? null;
  const rows: { id: string | null; name: string; sub: string }[] = [
    { id: null, name: "Open shifts", sub: "No one yet" },
    ...week.people.map((p) => ({ id: p.id, name: p.name, sub: `${TYPE[p.employment_type]}${week.totals[p.id] ? ` · ${hrs(week.totals[p.id].hours)} · ~${money(week.totals[p.id].cost)}` : ""}` })),
  ];
  const byCell = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of week.shifts) { const k = `${s.crew_member_id ?? "open"}|${s.shift_date}`; m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [week.shifts]);
  const dayHours = (d: string) => week.shifts.filter((s) => s.shift_date === d && s.crew_member_id).reduce((t, s) => t + len(s), 0);
  const totalCost = Object.values(week.totals).reduce((t, x) => t + x.cost, 0);
  const totalHours = Object.values(week.totals).reduce((t, x) => t + x.hours, 0);

  const open = (crewId: string | null, date: string, s?: Shift) => {
    setMsg(null);
    const p = week.people.find((x) => x.id === crewId);
    setDraft(s ? { id: s.id, crewId: s.crew_member_id, areaId: s.area_id, date: s.shift_date, start: t5(s.start_time), finish: t5(s.finish_time), breakMinutes: s.break_minutes, notes: s.notes ?? "", also: [] }
      : { id: null, crewId, areaId: p?.default_area_id ?? areas[0]?.id ?? null, date, start: "07:00", finish: "15:00", breakMinutes: 30, notes: "", also: [] });
  };
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, close = false) => start(async () => {
    const r: { ok: boolean; message?: string; error?: string } = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    if (r.ok && close) setDraft(null);
    router.refresh();
  });
  const save = () => draft && run(async () => {
    const base = { crewId: draft.crewId, areaId: draft.areaId, start: draft.start, finish: draft.finish, breakMinutes: draft.breakMinutes, notes: draft.notes || null };
    const r = await saveRosterShift({ ...base, id: draft.id, date: draft.date });
    if (!r.ok) return r;
    for (const d of draft.also) { const x = await saveRosterShift({ ...base, id: null, date: d }); if (!x.ok) return x; }
    return { ok: true as const, message: draft.also.length ? `Saved on ${draft.also.length + 1} days.` : undefined };
  }, true);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Link href={`/roster?w=${prev}`} className="rounded-md p-1.5 text-ink-muted hover:bg-zinc-100" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Link>
        <p className="text-[0.875rem] font-semibold text-ink">Week of {fmtDate(week.monday, "long")}</p>
        <Link href={`/roster?w=${next}`} className="rounded-md p-1.5 text-ink-muted hover:bg-zinc-100" aria-label="Next week"><ChevronRight className="h-4 w-4" /></Link>
        {!week.dates.includes(today) && <Link href="/roster" className="text-[0.75rem] font-medium text-brand-600">This week</Link>}
        <span className="text-[0.75rem] text-ink-muted sm:ml-2">{hrs(totalHours)} · ~{money(totalCost)} estimated</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {smsOn && !week.unpublished && week.shifts.some((x) => x.published_at && x.crew_member_id) && <Button size="sm" disabled={pending} onClick={() => run(() => textWeek(week.monday, null))}>Text this week to staff</Button>}
          <Button size="sm" disabled={pending} onClick={() => run(() => copyPreviousWeek(week.monday))}><Copy className="h-3.5 w-3.5" />Copy last week</Button>
          <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />Email staff</label>
          {smsOn && <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />Text staff</label>}
          <Button size="sm" variant="primary" disabled={pending || !week.unpublished} onClick={() => run(() => publishWeek(week.monday, email, sms))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{week.unpublished ? `Publish ${week.unpublished} change${week.unpublished === 1 ? "" : "s"}` : "Published"}
          </Button>
        </div>
      </div>
      {msg && <p className={cn("px-4 py-2 text-[0.7812rem]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{msg.text}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-[0.75rem]">
          <thead>
            <tr className="border-b border-line bg-zinc-50/70">
              <th className="sticky left-0 z-10 w-44 bg-zinc-50 px-3 py-2 text-left font-medium text-ink-muted">Staff</th>
              {week.dates.map((d) => (
                <th key={d} className={cn("px-2 py-2 text-left font-medium", d === today ? "text-brand-700" : "text-ink-muted")}>
                  {fmtDate(d, "weekday")}
                  {week.holidays[d] && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[0.65rem] font-semibold text-amber-800" title={week.holidays[d]}>Public holiday</span>}
                  <span className="block text-[0.6875rem] font-normal text-ink-faint">{hrs(dayHours(d))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? "open"} className={cn("border-b border-line align-top", !r.id && "bg-zinc-50/40")}>
                <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-[0.6875rem] text-ink-faint">{r.sub}</p>
                </td>
                {week.dates.map((d) => {
                  const list = byCell.get(`${r.id ?? "open"}|${d}`) ?? [];
                  const blocked = r.id ? week.blocks[r.id]?.[d] ?? [] : [];
                  return (
                    <td key={d} className="group px-1.5 py-1.5">
                      <div className="flex min-h-[52px] flex-col gap-1">
                        {blocked.map((b, i) => <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] text-ink-muted" title={b}>{b.length > 28 ? `${b.slice(0, 26)}…` : b}</span>)}
                        {list.map((s) => {
                          const a = areaOf(s.area_id);
                          const warn = shiftWarnings(week, s);
                          return (
                            <button key={s.id} onClick={() => open(r.id, d, s)} className="rounded-md border px-1.5 py-1 text-left hover:shadow-sm"
                              style={{ borderColor: a?.colour ?? "#d4d4d8", background: `${a?.colour ?? "#a1a1aa"}14` }} title={warn.join("\n") || undefined}>
                              <span className="flex items-center gap-1 font-semibold text-ink">
                                {t5(s.start_time)}–{t5(s.finish_time)}
                                {(!s.published_at || s.changed_since_publish) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={s.published_at ? "Changed — publish to tell them" : "Draft — not published yet"} />}
                                {warn.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                              </span>
                              <span className="block truncate text-[0.6875rem] text-ink-muted">{a?.name ?? "Shift"}{s.break_minutes ? ` · ${s.break_minutes}m break` : ""}</span>
                            </button>
                          );
                        })}
                        <button onClick={() => open(r.id, d)} className="flex h-6 items-center justify-center rounded-md text-ink-faint opacity-0 hover:bg-zinc-100 hover:text-ink group-hover:opacity-100 focus:opacity-100" aria-label={`Add a shift on ${fmtDate(d, "weekday")}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[0.6875rem] text-ink-faint">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />not published yet · costs are estimates from Setup → Pay rules; Xero Payroll pays the real amounts.
      </p>

      {draft && <ShiftDialog meal={meal} week={week} draft={draft} setDraft={setDraft} pending={pending} onSave={save}
        onDelete={() => draft.id && run(() => deleteRosterShift(draft.id!), true)} onClose={() => setDraft(null)} />}
    </Card>
  );
}

function ShiftDialog({ meal, week, draft, setDraft, pending, onSave, onDelete, onClose }: {
  meal: { after_hours: number; minutes: number }; week: PlainWeek; draft: Draft; setDraft: (d: Draft) => void; pending: boolean; onSave: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [sure, setSure] = useState(false);
  const warn = shiftWarnings(week, { id: draft.id, crew_member_id: draft.crewId, area_id: draft.areaId, shift_date: draft.date, start_time: draft.start, finish_time: draft.finish, break_minutes: draft.breakMinutes });
  // changing the times puts the award's unpaid meal break in (or takes it out for a short shift)
  const set = (p: Partial<Draft>) => {
    const d = { ...draft, ...p };
    if ((p.start !== undefined || p.finish !== undefined) && meal.minutes > 0 && /^\d{2}:\d{2}$/.test(d.start) && /^\d{2}:\d{2}$/.test(d.finish)) {
      const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      let span = m(d.finish) - m(d.start); if (span <= 0) span += 1440;
      d.breakMinutes = span >= meal.after_hours * 60 ? Math.max(d.breakMinutes, meal.minutes) : d.breakMinutes === meal.minutes ? 0 : d.breakMinutes;
    }
    setDraft(d);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[0.9375rem] font-semibold text-ink">{draft.id ? "Edit shift" : "New shift"}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-zinc-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="r-who">Who</Label>
            <Select id="r-who" value={draft.crewId ?? ""} onChange={(e) => set({ crewId: e.target.value || null })}>
              <option value="">Open shift — anyone can pick it up</option>
              {week.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label htmlFor="r-area">Area</Label>
            <Select id="r-area" value={draft.areaId ?? ""} onChange={(e) => set({ areaId: e.target.value || null })}>
              <option value="">No area</option>
              {week.areas.filter((a) => a.active || a.id === draft.areaId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2"><Label htmlFor="r-date">Date</Label>
            <Select id="r-date" value={draft.date} onChange={(e) => set({ date: e.target.value, also: draft.also.filter((x) => x !== e.target.value) })}>
              {week.dates.map((d) => <option key={d} value={d}>{fmtDate(d, "weekday")}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="r-start">Start</Label><Input id="r-start" type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} /></div>
          <div><Label htmlFor="r-finish">Finish</Label><Input id="r-finish" type="time" value={draft.finish} onChange={(e) => set({ finish: e.target.value })} /></div>
          <div><Label htmlFor="r-break" hint="Unpaid">Break (minutes)</Label><Input id="r-break" type="number" min={0} max={240} step={5} value={draft.breakMinutes} onChange={(e) => set({ breakMinutes: Number(e.target.value) })} /></div>
          <div className="flex items-end text-[0.75rem] text-ink-muted">{hrs(len({ start_time: draft.start, finish_time: draft.finish, break_minutes: draft.breakMinutes }))} paid</div>
          <div className="col-span-2"><Label htmlFor="r-notes" hint="Staff see this">Notes</Label><Textarea id="r-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
          {!draft.id && (
            <div className="col-span-2">
              <p className="mb-1 text-[0.75rem] font-medium text-ink">Same shift on other days</p>
              <div className="flex flex-wrap gap-1.5">
                {week.dates.filter((d) => d !== draft.date).map((d) => (
                  <label key={d} className={cn("cursor-pointer rounded-md border px-2 py-1 text-[0.7188rem]", draft.also.includes(d) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink-muted")}>
                    <input type="checkbox" className="sr-only" checked={draft.also.includes(d)} onChange={(e) => set({ also: e.target.checked ? [...draft.also, d] : draft.also.filter((x) => x !== d) })} />
                    {fmtDate(d, "weekday").split(" ")[0]}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        {warn.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-100">
            {warn.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
          </ul>
        )}
        <div className="mt-4 flex items-center gap-2">
          {draft.id && <Button size="sm" variant="ghost" className="text-rose-700" disabled={pending} onClick={() => (sure ? onDelete() : setSure(true))}>{sure ? "Tap again to delete" : "Delete"}</Button>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={onSave}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type LeaveReq = { id: string; who: string; from: string; to: string; type: string; hours: number | null; note: string | null };
type OfferReq = { id: string; status: string; note: string | null; from: string; to: string | null; shift: { shift_date: string; start_time: string; finish_time: string; title: string } | null; swap: { shift_date: string; start_time: string; finish_time: string } | null };

/** Leave and shift-swap requests waiting for the office. */
export function Requests({ leave, offers }: { leave: LeaveReq[]; offers: OfferReq[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r: { ok: boolean; message?: string; error?: string } = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? r.message ?? null : r.error ?? null);
    router.refresh();
  });
  const when = (s: { shift_date: string; start_time: string; finish_time: string }) => `${fmtDate(s.shift_date, "weekday")} ${t5(s.start_time)}–${t5(s.finish_time)}`;
  return (
    <Card>
      <CardHeader title="Requests" subtitle="Staff asked for these in the staff app." />
      <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
        {leave.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1"><b>{l.who}</b> — {l.type}, {fmtDate(l.from, "short")}{l.to !== l.from ? `–${fmtDate(l.to, "short")}` : ""}{l.hours ? ` (${l.hours}h)` : ""}{l.note ? <span className="text-ink-muted"> · {l.note}</span> : null}</span>
            <Button size="sm" disabled={pending} onClick={() => act(() => decideLeave(l.id, false, null))}>Decline</Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={() => act(() => decideLeave(l.id, true, null))}>Approve</Button>
          </li>
        ))}
        {offers.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1">
              <b>{o.from}</b> {o.swap ? "wants to swap" : "is giving away"} {o.shift ? when(o.shift) : "a shift"}
              {o.to ? <> — <b>{o.to}</b> {o.swap ? `gives ${when(o.swap)} back` : "will take it"}</> : <span className="text-ink-muted"> — nobody has picked it up yet</span>}
              {o.note ? <span className="text-ink-muted"> · {o.note}</span> : null}
            </span>
            <Button size="sm" disabled={pending} onClick={() => act(() => decideOffer(o.id, false))}>Decline</Button>
            <Button size="sm" variant="primary" disabled={pending || !o.to} onClick={() => act(() => decideOffer(o.id, true))}>Approve</Button>
          </li>
        ))}
      </ul>
      {msg && <p className="border-t border-line px-5 py-2 text-[0.75rem] text-ink-muted">{msg}</p>}
    </Card>
  );
}
