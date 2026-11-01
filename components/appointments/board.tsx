"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, Copy, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, Plus, Settings, Video, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/calendar/drawer";
import { cn } from "@/lib/cn";
import type { ApptKind, DaySlots } from "@/lib/appointments/core";
import { apptFreeTimes, apptMove, apptRespond, type OfficeAction } from "@/app/(app)/calendar/appointment-actions";
import { SlotPicker } from "@/components/meet/slot-picker";
import { BookMeeting, type Prefill } from "./book-meeting";

export interface ApptRow {
  id: string; title: string; kind: ApptKind; startsAt: string; endsAt: string; status: string; location: string | null; meetingUrl: string | null;
  clientName: string | null; clientEmail: string | null; clientPhone: string | null; clientCompany: string | null; clientNote: string | null; notes: string | null;
  proposedStart: string | null; proposedEnd: string | null; source: string; assignedTo: string | null; customerId: string | null;
}
const ICON: Record<ApptKind, typeof Video> = { video: Video, phone: Phone, in_person: MapPin };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  reschedule_requested: { label: "New time asked", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  declined: { label: "Declined", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  cancelled: { label: "Cancelled", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  completed: { label: "Done", cls: "bg-ink/10 text-ink-muted" },
};
const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function AppointmentsBoard({ accent, rows, tz, me, people, needsMigration, enabled, bookingUrl, durations, kinds, defaults, openId, startBooking, prefill }: {
  accent: string; rows: ApptRow[]; tz: string; me: string; people: { id: string; name: string }[]; needsMigration: boolean; enabled: boolean; bookingUrl: string;
  durations: number[]; kinds: ApptKind[]; defaults: { location: string; meetingUrl: string }; openId: string | null; startBooking: boolean; prefill?: Prefill | null;
}) {
  const [tab, setTab] = useState<"action" | "upcoming" | "past">("upcoming");
  const [open, setOpen] = useState<string | null>(openId);
  const [booking, setBooking] = useState(startBooking);
  const [copied, setCopied] = useState(false);
  const now = Date.now();
  const fmt = useMemo(() => ({
    day: (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }),
    dow: (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: tz, weekday: "short" }),
    num: (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: tz, day: "numeric" }),
    mon: (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: tz, month: "short" }),
    time: (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
  }), [tz]);
  const action = rows.filter((r) => (r.status === "pending" && r.source === "website") || r.status === "reschedule_requested");
  const upcoming = rows.filter((r) => Date.parse(r.endsAt) >= now && ["pending", "confirmed", "reschedule_requested"].includes(r.status));
  const past = rows.filter((r) => Date.parse(r.endsAt) < now || ["cancelled", "declined", "completed"].includes(r.status)).reverse();
  const list = tab === "action" ? action : tab === "upcoming" ? upcoming : past;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const thisWeek = upcoming.filter((r) => Date.parse(r.startsAt) < now + 7 * 86_400_000).length;
  const next = upcoming.find((r) => r.status === "confirmed");
  const cur = rows.find((r) => r.id === open);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-medium text-ink-faint"><Link href="/calendar" className="hover:text-ink">Calendar</Link> / Appointments</p>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">Appointments</h1>
          <p className="mt-1 text-[0.8438rem] text-ink-muted">Client meetings — booked by you or online. Every new client starts in your CRM with their own portal.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <ButtonLink href="/calendar/appointments/settings" className="h-10 sm:h-9"><Settings className="h-4 w-4" /> Booking settings</ButtonLink>
          <Button variant="primary" className="h-10 sm:h-9" onClick={() => setBooking(true)} disabled={needsMigration}><Plus className="h-4 w-4" /> Book a meeting</Button>
        </div>
      </div>

      {needsMigration && <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-3 text-[0.875rem] font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />Run database update 0091 (appointments) to start booking meetings.</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Needs your OK" value={action.length} tone={action.length ? "text-amber-600" : "text-ink"} onClick={() => setTab("action")} />
        <Stat label="Next 7 days" value={thisWeek} onClick={() => setTab("upcoming")} />
        <Card className="p-4 lg:col-span-2">
          <p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Your booking page</p>
          {enabled ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">{bookingUrl.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(bookingUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[0.75rem] font-semibold ring-1 ring-line hover:bg-canvas">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>
              <a href={bookingUrl} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-line hover:bg-canvas" aria-label="Open"><ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          ) : <p className="mt-1.5 text-[0.875rem] text-ink-muted">Off — <Link href="/calendar/appointments/settings" className="font-semibold text-brand-600">turn on online booking</Link> to let clients pick a time.</p>}
        </Card>
      </div>

      {next && (
        <button type="button" onClick={() => setOpen(next.id)} className="mb-5 flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 p-4 text-left text-white shadow-card sm:p-5">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white/15"><span className="text-[0.625rem] font-semibold uppercase">{fmt.mon(next.startsAt)}</span><span className="text-[1.375rem] font-bold leading-none">{fmt.num(next.startsAt)}</span></span>
          <span className="min-w-0 flex-1"><span className="block text-[0.75rem] font-medium uppercase tracking-wide text-white/75">Up next{new Date(next.startsAt).toLocaleDateString("en-CA", { timeZone: tz }) === today ? " · today" : ""}</span><span className="block truncate text-[1.0625rem] font-semibold">{next.title}{next.clientName ? ` — ${next.clientName}` : ""}</span><span className="block text-[0.8125rem] text-white/80">{fmt.dow(next.startsAt)} {fmt.time(next.startsAt)} – {fmt.time(next.endsAt)}</span></span>
          {next.kind === "video" && next.meetingUrl && <a href={next.meetingUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hidden shrink-0 rounded-xl bg-white px-4 py-2.5 text-[0.8125rem] font-semibold text-brand-700 sm:block">Join call</a>}
        </button>
      )}

      <div className="mb-3 flex gap-1 rounded-xl bg-canvas p-1 ring-1 ring-line sm:inline-flex">
        {([["action", "Needs action", action.length], ["upcoming", "Upcoming", upcoming.length], ["past", "Past & cancelled", past.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex-1 rounded-lg px-3 py-2 text-[0.8125rem] font-medium sm:flex-none", tab === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            {l}{n > 0 && <span className={cn("ml-1.5 rounded-full px-1.5 text-[0.6875rem] font-semibold", k === "action" ? "bg-amber-500 text-white" : "bg-ink/10")}>{n}</span>}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-ink-faint" />
            <p className="mt-3 font-medium text-ink">{tab === "action" ? "Nothing waiting on you" : tab === "upcoming" ? "No meetings coming up" : "Nothing here yet"}</p>
            {tab !== "past" && !needsMigration && <Button variant="primary" className="mt-4" onClick={() => setBooking(true)}><Plus className="h-4 w-4" /> Book a meeting</Button>}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => { const I = ICON[r.kind]; const st = STATUS[r.status] ?? STATUS.pending; return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-canvas sm:gap-4 sm:px-5">
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-canvas ring-1 ring-line"><span className="text-[0.625rem] font-semibold uppercase text-ink-faint">{fmt.dow(r.startsAt)}</span><span className="text-[1.0625rem] font-bold leading-none text-ink">{fmt.num(r.startsAt)}</span></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-[0.9375rem] font-semibold text-ink">{r.clientName || r.title}</span>{r.clientCompany && <span className="hidden truncate text-[0.8125rem] text-ink-muted sm:inline">· {r.clientCompany}</span>}</span>
                    <span className="flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><I className="h-3.5 w-3.5" />{fmt.time(r.startsAt)} – {fmt.time(r.endsAt)} · {r.title}</span>
                    {r.status === "reschedule_requested" && r.proposedStart && <span className="block text-[0.75rem] font-medium text-sky-600">Asked for {fmt.day(r.proposedStart)} {fmt.time(r.proposedStart)}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", st.cls)}>{r.status === "pending" && r.source === "office" ? "Client to confirm" : st.label}</span>
                    {r.source === "website" && <span className="text-[0.6875rem] text-ink-faint">Booked online</span>}
                    {r.assignedTo && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/15 text-[0.625rem] font-bold text-brand-700" title={people.find((p) => p.id === r.assignedTo)?.name}>{r.assignedTo === me ? "Me" : initials(people.find((p) => p.id === r.assignedTo)?.name ?? null)}</span>}
                  </span>
                </button>
              </li>
            ); })}
          </ul>
        )}
      </Card>

      {cur && <ApptDetail key={cur.id} a={cur} tz={tz} people={people} accent={accent} onClose={() => setOpen(null)} />}
      {booking && <BookMeeting prefill={prefill ?? null} accent={accent} tz={tz} me={me} people={people} durations={durations} kinds={kinds} defaults={defaults} onClose={() => setBooking(false)} onBooked={(id) => { setBooking(false); setTab("upcoming"); setOpen(id); }} />}
    </div>
  );
}

function Stat({ label, value, tone = "text-ink", onClick }: { label: string; value: number; tone?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl bg-surface p-4 text-left shadow-card ring-1 ring-line hover:ring-2"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{label}</p><p className={cn("mt-1 text-[1.75rem] font-bold leading-none", tone)}>{value}</p></button>;
}

function ApptDetail({ a, tz, people, accent, onClose }: { a: ApptRow; tz: string; people: { id: string; name: string }[]; accent: string; onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState(false);
  const [moving, setMoving] = useState(false);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const I = ICON[a.kind];
  const t = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const done = (r: { ok: true; emailed: string | null } | { ok: false; error: string }, ok: string) => { if (r.ok) { setMsg({ ok: r.emailed ? `${ok} (email not sent: ${r.emailed})` : ok }); setMoving(false); setCancelling(false); router.refresh(); } else setMsg({ error: r.error }); };
  const act = (w: OfficeAction, ok: string) => start(async () => done(await apptRespond(a.id, w, { email }), ok));
  const live = ["pending", "confirmed", "reschedule_requested"].includes(a.status);
  const st = STATUS[a.status] ?? STATUS.pending;
  return (
    <Drawer onClose={onClose} accent={accent} title={<><span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", st.cls)}>{a.status === "pending" && a.source === "office" ? "Client to confirm" : st.label}</span><h2 className="mt-1.5 text-[1.0625rem] font-semibold text-ink">{a.title}</h2></>}>
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="rounded-xl bg-canvas p-4 ring-1 ring-line">
          <p className="flex items-start gap-2.5 text-[0.9375rem] font-semibold text-ink"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{t(a.startsAt)} – {time(a.endsAt)}</p>
          <p className="mt-2 flex items-start gap-2.5 text-[0.875rem] text-ink-muted"><I className="mt-0.5 h-4 w-4 shrink-0" />{a.kind === "in_person" ? a.location || "In person" : a.kind === "phone" ? `Phone — call ${a.clientPhone ?? "the client"}` : a.meetingUrl ? <a href={a.meetingUrl} target="_blank" rel="noreferrer" className="break-all font-medium text-brand-600">{a.meetingUrl}</a> : "Video call — add the link when you send it"}</p>
          {a.assignedTo && <p className="mt-2 text-[0.8125rem] text-ink-muted">With {people.find((p) => p.id === a.assignedTo)?.name ?? "staff"}</p>}
        </div>

        {a.status === "reschedule_requested" && a.proposedStart && (
          <div className="rounded-xl bg-sky-500/10 p-4 ring-1 ring-sky-500/30">
            <p className="text-[0.8125rem] font-semibold text-sky-700 dark:text-sky-300">{a.clientName ?? "The client"} asked to move it to</p>
            <p className="mt-0.5 text-[1rem] font-semibold text-ink">{t(a.proposedStart)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" disabled={pending} onClick={() => act("approve_move", "Moved — it's on the calendar.")}>Approve</Button>
              <Button disabled={pending} onClick={() => act("decline_move", "Kept the original time.")}>Keep original</Button>
            </div>
          </div>
        )}
        {a.status === "pending" && a.source === "website" && (
          <div className="rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
            <p className="text-[0.8125rem] font-semibold text-amber-700 dark:text-amber-300">Booked online — waiting for your OK</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" disabled={pending} onClick={() => act("approve", "Confirmed.")}>Confirm</Button>
              <Button disabled={pending} onClick={() => act("decline", "Declined.")}>Decline</Button>
            </div>
          </div>
        )}

        <section>
          <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Client</p>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[0.875rem] font-bold text-brand-700">{initials(a.clientName)}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{a.clientName ?? "—"}</p>{a.clientCompany && <p className="truncate text-[0.8125rem] text-ink-muted">{a.clientCompany}</p>}</div>
            {a.customerId && <ButtonLink href={`/clients/${a.customerId}`} size="sm">Client file</ButtonLink>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {a.clientEmail && <a href={`mailto:${a.clientEmail}`} className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium ring-1 ring-line hover:bg-canvas"><Mail className="h-4 w-4" />Email</a>}
            {a.clientPhone && <a href={`tel:${a.clientPhone}`} className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium ring-1 ring-line hover:bg-canvas"><Phone className="h-4 w-4" />Call</a>}
          </div>
          {a.clientNote && <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas p-3 text-[0.875rem] text-ink ring-1 ring-line"><span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">They said</span>{a.clientNote}</p>}
          {a.notes && <p className="mt-2 whitespace-pre-line text-[0.8125rem] text-ink-muted">Notes: {a.notes}</p>}
        </section>

        {msg && <p className={cn("rounded-xl px-3 py-2.5 text-[0.875rem] font-medium", msg.error ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>{msg.error ?? msg.ok}</p>}

        {live && (
          <section className="space-y-3">
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4" />Email {a.clientName?.split(" ")[0] ?? "the client"} about changes</label>
            {moving ? (
              <div className="space-y-3 rounded-xl p-3 ring-1 ring-line">
                <div className="flex items-center justify-between"><p className="font-semibold text-ink">Move to…</p><button type="button" onClick={() => setMoving(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-canvas"><X className="h-4 w-4" /></button></div>
                {!days ? <p className="flex items-center gap-2 text-[0.875rem] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />Finding free times…</p> : <SlotPicker days={days} value={slot} onChange={setSlot} accent={accent} />}
                <Button variant="primary" className="w-full" disabled={!slot || pending} onClick={() => slot && start(async () => done(await apptMove(a.id, slot.date, slot.time, { email }), "Moved."))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Move it</Button>
              </div>
            ) : cancelling ? (
              <div className="rounded-xl p-3 ring-1 ring-rose-500/40">
                <p className="font-semibold text-ink">Cancel this meeting?</p>
                <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => setCancelling(false)}>Keep it</Button><Button variant="danger" disabled={pending} onClick={() => act("cancel", "Cancelled.")}>Yes, cancel</Button></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => { setMoving(true); if (!days) start(async () => { const r = await apptFreeTimes(Math.round((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60_000), a.id); if (r.ok) setDays(r.days); else setMsg({ error: r.error }); }); }}>Move</Button>
                {a.status === "pending" && a.source === "office" ? <Button disabled={pending} onClick={() => act("approve", "Marked as confirmed.")}>Mark confirmed</Button> : <Button disabled={pending || Date.parse(a.startsAt) > Date.now()} onClick={() => act("complete", "Marked done.")}>Mark done</Button>}
                <Button className="col-span-2 text-rose-600" onClick={() => setCancelling(true)}>Cancel meeting</Button>
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}
