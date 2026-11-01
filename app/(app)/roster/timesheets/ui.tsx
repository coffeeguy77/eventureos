"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronDown, ChevronRight, Loader2, MapPin, Plus, Send } from "lucide-react";
import { LeafletMap, type Pin } from "@/components/maps/leaflet-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addDaysISO, fmtDate, money } from "@/lib/format";
import { CATEGORY_LABEL, type Category } from "@/lib/roster/award";
import { addEntry, deleteEntry, sendToXero, setEntriesStatus, updateEntry } from "../timesheet-actions";

export interface PersonSheet {
  id: string; name: string; type: string; xero: boolean; hours: number; cost: number; totals: Record<Category, number>;
  approved: number; waiting: number; unsent: number;
  entries: { id: string; date: string; status: string; source: string; note: string | null; sent: boolean; clockIn: string; clockOut: string | null; paidStart: string; paidFinish: string | null; breakMinutes: number; rostered: string | null;
    /** the event this was clocked for (event pay comes from the job — not counted here) */
    event: string | null; inAt: LatLng | null; outAt: LatLng | null; inPhoto: string | null; outPhoto: string | null }[];
  missing: { id: string; date: string; start: string; finish: string; breakMinutes: number }[];
}
type LatLng = { lat: number; lng: number };
type Fence = { lat: number; lng: number; metres: number } | null;
const metresBetween = (a: LatLng, b: LatLng) => { const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(x))); };
type Res = { ok: boolean; message?: string; error?: string };
const hm = (local: string | null) => (local ? local.slice(11, 16) : "—");
const len = (a: string, b: string | null, brk: number) => (b ? Math.max(0, (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 3_600_000 - brk / 60) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function Timesheets({ from, to, today, sheets, earningsReady, fence }: { from: string; to: string; today: string; sheets: PersonSheet[]; earningsReady: boolean; fence: Fence }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const run = (fn: () => Promise<Res>) => start(async () => {
    const r: Res = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    router.refresh();
  });
  const waitingIds = sheets.flatMap((s) => s.entries.filter((e) => e.status === "pending" && !e.event && e.clockOut).map((e) => e.id));
  const [showMap, setShowMap] = useState(false);
  const pins: Pin[] = sheets.flatMap((s) => s.entries.flatMap((e) => [
    ...(e.inAt ? [{ ...e.inAt, label: `${s.name} — on ${fmtDate(e.date, "weekday")} ${hm(e.clockIn)}${e.event ? ` (${e.event})` : ""}`, colour: "#059669" }] : []),
    ...(e.outAt ? [{ ...e.outAt, label: `${s.name} — off ${fmtDate(e.date, "weekday")} ${hm(e.clockOut)}${e.event ? ` (${e.event})` : ""}`, colour: "#e11d48" }] : []),
  ]));
  const sendable = sheets.filter((s) => s.xero && s.unsent > 0).map((s) => s.id);
  const totalCost = sheets.reduce((t, s) => t + s.cost, 0), totalHours = sheets.reduce((t, s) => t + s.hours, 0);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Link href={`/roster/timesheets?from=${addDaysISO(from, -days)}&to=${addDaysISO(to, -days)}`} className="rounded-md px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-zinc-100">‹</Link>
        <p className="text-[0.875rem] font-semibold text-ink">{fmtDate(from, "weekday")} – {fmtDate(to, "weekday")}</p>
        <Link href={`/roster/timesheets?from=${addDaysISO(from, days)}&to=${addDaysISO(to, days)}`} className="rounded-md px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-zinc-100">›</Link>
        <Link href={`/roster/timesheets?from=${from}&to=${addDaysISO(from, days === 7 ? 13 : 6)}`} className="text-[0.75rem] font-medium text-brand-600">{days === 7 ? "Show a fortnight" : "Show a week"}</Link>
        <span className="text-[0.75rem] text-ink-muted">{r2(totalHours)} h · ~{money(totalCost)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || !waitingIds.length} onClick={() => run(() => setEntriesStatus(waitingIds, "approved"))}><Check className="h-3.5 w-3.5" />Approve all waiting ({waitingIds.length})</Button>
          <Button size="sm" variant="primary" disabled={pending || !sendable.length || !earningsReady} onClick={() => run(() => sendToXero(sendable, from, to))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send approved to Xero
          </Button>
        </div>
        <button onClick={() => setShowMap(!showMap)} className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-600"><MapPin className="h-3.5 w-3.5" />{showMap ? "Hide map" : `Where they clocked (${pins.length})`}</button>
        {showMap && (
          <div className="w-full space-y-1">
            {pins.length || fence ? <LeafletMap pins={pins} circle={fence} height={320} /> : null}
            <p className="text-[0.7188rem] text-ink-muted">Green = clocked on, red = clocked off{fence ? `, circle = the ${fence.metres} m sign-in area` : ""}. Only phone clock-ons with location turned on are saved — the iPad and phones with location off leave no point.{!pins.length ? " No points this period yet." : ""}</p>
          </div>
        )}
        {!earningsReady && <p className="w-full text-[0.75rem] text-amber-800">Xero Payroll is connected, but no earnings rates are chosen yet — pick them in <Link href="/roster/setup" className="font-semibold underline">Setup → Xero Payroll</Link> (Ordinary at least) before sending.</p>}
      </Card>
      {msg && <p className={cn("rounded-lg px-3 py-2 text-[0.8125rem]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{msg.text}</p>}
      {sheets.length === 0 && <Card><p className="px-5 py-6 text-[0.8125rem] text-ink-muted">No one is on the roster yet.</p></Card>}
      {sheets.map((s) => <PersonCard key={s.id} s={s} today={today} pending={pending} run={run} from={from} to={to} earningsReady={earningsReady} fence={fence} />)}
    </div>
  );
}

function PersonCard({ s, today, pending, run, from, to, earningsReady, fence }: { s: PersonSheet; today: string; pending: boolean; run: (fn: () => Promise<Res>) => void; from: string; to: string; earningsReady: boolean; fence: Fence }) {
  const [open, setOpen] = useState(s.waiting > 0 || s.missing.length > 0);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState({ date: today, start: "07:00", finish: "15:00", brk: 30 });
  const cats = (Object.keys(s.totals) as Category[]).filter((c) => s.totals[c] > 0);
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-ink-faint" /> : <ChevronRight className="h-4 w-4 text-ink-faint" />}
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-ink">{s.name}</span>
          <span className="ml-2 text-[0.75rem] text-ink-muted">{s.hours} h · ~{money(s.cost)}{!s.xero ? " · not matched in Xero Payroll" : ""}</span>
        </span>
        {s.waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-amber-800">{s.waiting} to approve</span>}
        {s.missing.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-rose-800">{s.missing.length} not clocked</span>}
        {s.unsent > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-sky-800">{s.unsent} not in Xero yet</span>}
      </button>
      {open && (
        <div className="border-t border-line">
          {cats.length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 bg-zinc-50/70 px-5 py-2 text-[0.7188rem] text-ink-muted">
              {cats.map((c) => <span key={c}>{CATEGORY_LABEL[c]}: <b className="text-ink">{s.totals[c]} h</b></span>)}
            </p>
          )}
          <ul className="divide-y divide-line">
            {s.entries.map((e) => <EntryRow key={e.id} e={e} pending={pending} run={run} fence={fence} />)}
            {s.missing.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[0.8125rem]">
                <span className="w-28 text-ink-muted">{fmtDate(m.date, "weekday")}</span>
                <span className="flex-1 text-rose-700">Rostered {hm(m.start)}–{hm(m.finish)} but didn&rsquo;t clock on</span>
                <Button size="sm" disabled={pending} onClick={() => run(() => addEntry({ crewId: s.id, start: m.start, finish: m.finish, breakMinutes: m.breakMinutes, shiftId: m.id, note: "Added from the roster (no clock-on)" }))}>They worked it — add</Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-2.5">
            {!adding ? <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />Add hours</Button> : (
              <>
                <Input type="date" className="w-40" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} />
                <Input type="time" className="w-28" value={add.start} onChange={(e) => setAdd({ ...add, start: e.target.value })} />
                <Input type="time" className="w-28" value={add.finish} onChange={(e) => setAdd({ ...add, finish: e.target.value })} />
                <Input type="number" className="w-20" min={0} step={5} value={add.brk} onChange={(e) => setAdd({ ...add, brk: Number(e.target.value) })} aria-label="Break minutes" />
                <Button size="sm" variant="primary" disabled={pending} onClick={() => {
                  const finishDate = add.finish <= add.start ? addDaysISO(add.date, 1) : add.date;
                  run(() => addEntry({ crewId: s.id, start: `${add.date}T${add.start}`, finish: `${finishDate}T${add.finish}`, breakMinutes: add.brk, shiftId: null, note: null }));
                  setAdding(false);
                }}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </>
            )}
            <span className="ml-auto" />
            {s.xero && s.unsent > 0 && earningsReady && <Button size="sm" disabled={pending} onClick={() => run(() => sendToXero([s.id], from, to))}><Send className="h-3.5 w-3.5" />Send {s.name.split(" ")[0]}&rsquo;s to Xero</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

function EntryRow({ e, pending, run, fence }: { e: PersonSheet["entries"][number]; pending: boolean; run: (fn: () => Promise<Res>) => void; fence: Fence }) {
  const [edit, setEdit] = useState(false);
  const [where, setWhere] = useState(false);
  const away = (p: LatLng | null) => (p && fence ? metresBetween(p, fence) : null);
  const inAway = away(e.inAt), outAway = away(e.outAt);
  const [v, setV] = useState({ start: e.paidStart.slice(11, 16), finish: (e.paidFinish ?? e.paidStart).slice(11, 16), brk: e.breakMinutes });
  const hours = r2(len(e.paidStart, e.paidFinish, e.breakMinutes));
  const save = () => {
    const sd = e.paidStart.slice(0, 10);
    const fd = v.finish <= v.start ? addDaysISO(sd, 1) : sd;
    run(() => updateEntry(e.id, { start: `${sd}T${v.start}`, finish: `${fd}T${v.finish}`, breakMinutes: v.brk, note: e.note }));
    setEdit(false);
  };
  return (
    <li className="px-5 py-2.5 text-[0.8125rem]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-28 text-ink-muted">{fmtDate(e.date, "weekday")}</span>
        <span className="min-w-[220px] flex-1">
          {!e.clockOut ? <span className="font-medium text-emerald-700">On now — since {hm(e.clockIn)}</span> : edit ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Input type="time" className="h-8 w-28" value={v.start} onChange={(x) => setV({ ...v, start: x.target.value })} />–
              <Input type="time" className="h-8 w-28" value={v.finish} onChange={(x) => setV({ ...v, finish: x.target.value })} />
              <Input type="number" className="h-8 w-20" min={0} step={5} value={v.brk} onChange={(x) => setV({ ...v, brk: Number(x.target.value) })} aria-label="Break minutes" />m break
              <Button size="sm" variant="primary" disabled={pending} onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
            </span>
          ) : (
            <button onClick={() => setEdit(true)} className="text-left hover:text-brand-700">
              <b className="text-ink">{hm(e.paidStart)}–{hm(e.paidFinish)}</b>{e.breakMinutes ? ` · ${e.breakMinutes}m break` : ""} · <b className="text-ink">{hours} h</b>
              <span className="block text-[0.7188rem] text-ink-faint">
                {e.source === "office" ? "Added by the office" : `Clocked ${hm(e.clockIn)}–${hm(e.clockOut)}${e.source === "kiosk" ? " on the iPad" : ""}`}{e.rostered ? ` · rostered ${e.rostered}` : " · not rostered"}{e.note ? ` · ${e.note}` : ""}
              </span>
            </button>
          )}
          {e.event && <span className="mt-0.5 block text-[0.7188rem] font-medium text-violet-700">Event shift: {e.event} — paid from the job, not this timesheet</span>}
          {(e.inAt || e.outAt || e.inPhoto || e.outPhoto) && (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.7188rem] text-ink-muted">
              {e.inPhoto && <a href={e.inPhoto} target="_blank" rel="noreferrer" title="Photo at clock-on"><img src={e.inPhoto} alt="At clock-on" className="h-10 w-10 rounded object-cover ring-1 ring-line" /></a>}
              {e.outPhoto && <a href={e.outPhoto} target="_blank" rel="noreferrer" title="Photo at clock-off"><img src={e.outPhoto} alt="At clock-off" className="h-10 w-10 rounded object-cover ring-1 ring-line" /></a>}
              {(e.inPhoto || e.outPhoto) && <Camera className="h-3.5 w-3.5" />}
              {(e.inAt || e.outAt) && <button onClick={() => setWhere(!where)} className={cn("inline-flex items-center gap-1 font-medium", (inAway ?? 0) > (fence?.metres ?? Infinity) || (outAway ?? 0) > (fence?.metres ?? Infinity) ? "text-rose-700" : "text-brand-600")}>
                <MapPin className="h-3.5 w-3.5" />{where ? "Hide map" : "Map"}{inAway != null ? ` · on ${inAway} m away` : ""}{outAway != null ? ` · off ${outAway} m away` : ""}
              </button>}
            </span>
          )}
        </span>
        {e.clockOut && e.status === "pending" && !e.event && <>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setEntriesStatus([e.id], "rejected"))}>Don&rsquo;t pay</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => setEntriesStatus([e.id], "approved"))}><Check className="h-3.5 w-3.5" />Approve</Button>
        </>}
        {e.status === "approved" && <span className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-emerald-800">{e.sent ? "Approved · in Xero" : "Approved"}</span>
          <button className="text-[0.7188rem] text-ink-faint hover:text-ink" disabled={pending} onClick={() => run(() => setEntriesStatus([e.id], "pending"))}>Undo</button></span>}
        {e.status === "rejected" && <span className="flex items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-ink-muted">Not paid</span>
          <button className="text-[0.7188rem] text-ink-faint hover:text-ink" disabled={pending} onClick={() => run(() => setEntriesStatus([e.id], "pending"))}>Undo</button></span>}
        {e.source === "office" && e.status !== "approved" && <button className="text-[0.7188rem] text-ink-faint hover:text-rose-700" disabled={pending} onClick={() => run(() => deleteEntry(e.id))}>Delete</button>}
      </div>
      {where && <div className="mt-2"><LeafletMap pins={[...(e.inAt ? [{ ...e.inAt, label: `Clocked on ${hm(e.clockIn)}`, colour: "#059669" }] : []), ...(e.outAt ? [{ ...e.outAt, label: `Clocked off ${hm(e.clockOut)}`, colour: "#e11d48" }] : [])]} circle={fence} /></div>}
    </li>
  );
}
