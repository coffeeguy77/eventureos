"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarRange, Copy, Pencil, Plus, X } from "lucide-react";
import { setEventStatus, updateEventDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea, inputClass } from "@/components/ui/form";
import { DateTimeField } from "@/components/ui/datetime-field";
import { EVENT_STATUS, EVENT_STATUS_ORDER, EVENT_TYPES } from "@/lib/status";
import type { EventRecord, EventStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { addDays, dateRange, MAX_DAYS, type EventDay } from "@/lib/events/days";

export function EventStatusSelect({ id, status }: { id: string; status: EventStatus }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label="Event status" disabled={pending} value={status}
      onChange={(e) => start(() => setEventStatus(id, e.target.value as EventStatus))}
      className={cn(inputClass, "h-10 w-full py-0 pr-8 text-[0.8125rem] font-medium sm:h-9 sm:w-auto")}>
      {EVENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{EVENT_STATUS[s].label}</option>)}
    </select>
  );
}

export function EventDetailsEditor({ event, members, view, startDays = [], daysSaved = false }: {
  event: EventRecord; members: { id: string; name: string }[]; view: React.ReactNode;
  /** The job's own days (2+), or days suggested from the website booking / the quote's barista hours */
  startDays?: EventDay[];
  /** The database has the days column (0058 update) */
  daysSaved?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: { error?: string } | undefined, fd: FormData) => {
      const res = await updateEventDetails(event.id, prev, fd);
      if (!res?.error) setEditing(false);
      return res;
    },
    undefined
  );
  if (!editing) {
    return (
      <div className="relative">
        <button onClick={() => setEditing(true)} className="absolute -top-11 right-3 inline-flex h-10 items-center gap-1 px-2 text-[0.7812rem] sm:-top-10 sm:right-5 sm:h-auto sm:px-0 font-medium text-brand-600 hover:text-brand-700">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {view}
      </div>
    );
  }
  const types = [...new Set([...(event.event_type ? [event.event_type] : []), ...EVENT_TYPES])];
  return (
    <form action={action} className="grid gap-4 px-5 pb-5 sm:grid-cols-6">
      <div className="sm:col-span-4"><Label htmlFor="name">Event name</Label><Input id="name" name="name" defaultValue={event.name} required /></div>
      <div className="sm:col-span-2">
        <Label htmlFor="event_type">Type</Label>
        <Select id="event_type" name="event_type" defaultValue={event.event_type ?? ""}><option value="">—</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>
      </div>
      <DatesField event={event} startDays={startDays} daysSaved={daysSaved} />
      <div className="sm:col-span-2"><Label htmlFor="serves" hint="e.g. coffees">Serves</Label><Input id="serves" name="serves" inputMode="numeric" defaultValue={event.serves ?? ""} /></div>
      <div className="sm:col-span-3"><Label htmlFor="venue">Venue</Label><Input id="venue" name="venue" defaultValue={event.venue ?? ""} /></div>
      <div className="sm:col-span-3"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={event.address ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="guest_count">Guests</Label><Input id="guest_count" name="guest_count" inputMode="numeric" defaultValue={event.guest_count ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" inputMode="decimal" defaultValue={event.budget ?? ""} /></div>
      <div className="sm:col-span-2">
        <Label htmlFor="assigned_to">Lead</Label>
        <Select id="assigned_to" name="assigned_to" defaultValue={event.assigned_to ?? ""}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      </div>
      <div className="sm:col-span-3"><Label htmlFor="services" hint="Comma or line separated">Services</Label><Textarea id="services" name="services" rows={2} defaultValue={event.services.join(", ")} /></div>
      <div className="sm:col-span-3"><Label htmlFor="equipment" hint="Comma or line separated">Equipment</Label><Textarea id="equipment" name="equipment" rows={2} defaultValue={event.equipment.join(", ")} /></div>
      <div className="sm:col-span-6"><Label htmlFor="requirements">Requirements</Label><Textarea id="requirements" name="requirements" rows={3} defaultValue={event.requirements ?? ""} /></div>
      <div className="sm:col-span-3"><Label htmlFor="customer_notes" hint="From the customer">Customer notes</Label><Textarea id="customer_notes" name="customer_notes" rows={3} defaultValue={event.customer_notes ?? ""} /></div>
      <div className="sm:col-span-3"><Label htmlFor="internal_notes" hint="Team only">Internal notes</Label><Textarea id="internal_notes" name="internal_notes" rows={3} defaultValue={event.internal_notes ?? ""} /></div>
      <div className="sm:col-span-4"><Label htmlFor="next_action">Next action</Label><Input id="next_action" name="next_action" defaultValue={event.next_action ?? ""} placeholder="Leave blank to let EventureOS suggest one" /></div>
      <div className="sm:col-span-2"><Label htmlFor="next_action_due">Due</Label><DateTimeField id="next_action_due" name="next_action_due" defaultISO={event.next_action_due} /></div>
      <div className="sm:col-span-6"><FormError message={state?.error} /></div>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

const t5 = (v: string | null | undefined) => (v ? v.slice(0, 5) : "");
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Date and hours: one day (date, setup, start, finish) or several days — a date range, then setup / start / finish for each day.
 * Each day goes on the calendar as its own entry.
 */
function DatesField({ event, startDays }: { event: EventRecord; startDays: EventDay[]; daysSaved: boolean }) {
  const own = (event as unknown as { days?: unknown }).days;
  const isOwn = Array.isArray(own) && own.length > 1;
  const [multi, setMulti] = useState(isOwn);
  const first: EventDay = { date: event.event_date ?? "", setup: t5(event.setup_time) || null, start: t5(event.start_time) || null, finish: t5(event.finish_time) || null };
  const [days, setDays] = useState<EventDay[]>(() => (isOwn ? startDays : first.date ? [first, { ...first, date: addDays(first.date, 1) }] : []));
  const suggestion = !isOwn && startDays.length > 1 ? startDays : null;
  const sorted = [...days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted[0]?.date ?? "", to = sorted[sorted.length - 1]?.date ?? "";

  const setRange = (a: string, b: string) => {
    const dates = dateRange(a, b || a);
    if (!dates.length) { if (a && b && b < a) setRange(a, a); return; }
    setDays((cur) => {
      const by = new Map(cur.map((d) => [d.date, d]));
      let last: EventDay = cur[0] ?? first;
      return dates.map((date) => { const d = by.get(date) ?? { ...last, date }; last = d; return d; });
    });
  };
  const patch = (date: string, k: keyof EventDay, v: string) => setDays((cur) => cur.map((d) => (d.date === date ? { ...d, [k]: v || null } : d)));
  const copyFirst = () => setDays((cur) => { const f = [...cur].sort((a, b) => a.date.localeCompare(b.date))[0]; return f ? cur.map((d) => ({ ...d, setup: f.setup, start: f.start, finish: f.finish })) : cur; });

  if (!multi) {
    return (
      <>
        <div className="sm:col-span-6 -mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[0.7812rem] font-medium text-ink">When</span>
          <span className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium">
            <span className="rounded-md bg-surface px-2.5 py-1 text-ink shadow-sm">One day</span>
            <button type="button" className="rounded-md px-2.5 py-1 text-ink-muted hover:text-ink" onClick={() => { if (suggestion) setDays(suggestion); setMulti(true); }}>Several days</button>
          </span>
          {suggestion && (
            <button type="button" onClick={() => { setDays(suggestion); setMulti(true); }}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[0.7188rem] font-medium text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-100">
              <CalendarRange className="h-3.5 w-3.5" />Use the {suggestion.length} days from the quote ({dayName(suggestion[0].date)} – {dayName(suggestion[suggestion.length - 1].date)})
            </button>
          )}
        </div>
        <div className="sm:col-span-2"><Label htmlFor="event_date">Date</Label><Input id="event_date" name="event_date" type="date" defaultValue={event.event_date ?? ""} /></div>
        <div className="sm:col-span-2"><Label htmlFor="setup_time" hint="team arrives">Setup</Label><Input id="setup_time" name="setup_time" type="time" defaultValue={t5(event.setup_time)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="start_time" hint="service starts">Start</Label><Input id="start_time" name="start_time" type="time" defaultValue={t5(event.start_time)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="finish_time" hint="service ends">Finish</Label><Input id="finish_time" name="finish_time" type="time" defaultValue={t5(event.finish_time)} /></div>
        {isOwn && <input type="hidden" name="days" value="[]" />}
      </>
    );
  }

  return (
    <div className="sm:col-span-6 rounded-xl border border-line bg-zinc-50/60 p-3 sm:p-4">
      <input type="hidden" name="days" value={JSON.stringify(sorted)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.7812rem] font-medium text-ink">When</span>
        <span className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium">
          <button type="button" className="rounded-md px-2.5 py-1 text-ink-muted hover:text-ink" onClick={() => setMulti(false)}>One day</button>
          <span className="rounded-md bg-surface px-2.5 py-1 text-ink shadow-sm">Several days</span>
        </span>
        <span className="text-[0.7188rem] text-ink-faint">Each day goes on the calendar with its own hours.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div><Label htmlFor="days_from">From</Label><Input id="days_from" type="date" value={from} onChange={(e) => setRange(e.target.value, to && to >= e.target.value ? to : e.target.value)} /></div>
        <div><Label htmlFor="days_to">To</Label><Input id="days_to" type="date" value={to} min={from || undefined} onChange={(e) => setRange(from || e.target.value, e.target.value)} /></div>
      </div>
      {sorted.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[0.8125rem]">
            <thead>
              <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                <th className="py-1.5 pr-2 font-medium">Day</th><th className="px-1 font-medium">Setup</th><th className="px-1 font-medium">Start</th><th className="px-1 font-medium">Finish</th><th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-ink">{dayName(d.date)} <span className="font-normal text-ink-faint">· day {i + 1}</span></td>
                  <td className="px-1 py-1"><Input aria-label={`Setup ${dayName(d.date)}`} type="time" value={d.setup ?? ""} onChange={(e) => patch(d.date, "setup", e.target.value)} className="h-9" /></td>
                  <td className="px-1 py-1"><Input aria-label={`Start ${dayName(d.date)}`} type="time" value={d.start ?? ""} onChange={(e) => patch(d.date, "start", e.target.value)} className="h-9" /></td>
                  <td className="px-1 py-1"><Input aria-label={`Finish ${dayName(d.date)}`} type="time" value={d.finish ?? ""} onChange={(e) => patch(d.date, "finish", e.target.value)} className="h-9" /></td>
                  <td className="py-1 pl-1 text-right">
                    {sorted.length > 2 && (
                      <button type="button" aria-label={`Take ${dayName(d.date)} off`} title="Take this day off (e.g. a day in the middle they don't need)"
                        onClick={() => setDays((cur) => cur.filter((x) => x.date !== d.date))} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-faint hover:bg-zinc-100 hover:text-rose-600">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {sorted.length > 0 && sorted.length < MAX_DAYS && (
          <Button type="button" size="sm" variant="ghost" className="h-9 sm:h-8" onClick={() => setDays((cur) => [...cur, { ...sorted[sorted.length - 1], date: addDays(sorted[sorted.length - 1].date, 1) }])}>
            <Plus className="h-3.5 w-3.5" />Add a day
          </Button>
        )}
        {sorted.length > 1 && (
          <Button type="button" size="sm" variant="ghost" className="h-9 sm:h-8" onClick={copyFirst}><Copy className="h-3.5 w-3.5" />Same hours every day</Button>
        )}
      </div>
      {sorted.length < 2 && <p className="mt-2 text-[0.75rem] text-amber-700">Choose at least two days, or switch back to one day.</p>}
    </div>
  );
}
