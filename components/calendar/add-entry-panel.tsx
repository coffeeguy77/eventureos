"use client";

import { useActionState, useEffect, useState } from "react";
import { createCalendarEntry, type CalFormState } from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { Drawer } from "./drawer";
import { KIND_LABEL, type EntryKind, type Resource } from "./model";
import type { EventOption, GoogleStatus } from "./calendar-shell";

const KIND_ORDER: EntryKind[] = ["event", "hold", "site_visit", "setup", "other"];
const KIND_HINT: Record<EntryKind, string> = {
  event: "The booking itself — times come from the event.",
  hold: "Reserve a resource before the booking is confirmed.",
  site_visit: "Visit the venue with the customer or planner.",
  setup: "Bump-in, delivery or pack-down time.",
  other: "Anything else that ties up a resource.",
};

const addHours = (hhmm: string, h: number) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  const t = Math.min(hh * 60 + mm + h * 60, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export function AddEntryPanel({ resources, events, google, defaultDate, initialEventId, onClose }: {
  resources: Resource[]; events: EventOption[]; google: GoogleStatus; defaultDate: string; initialEventId: string | null; onClose: () => void;
}) {
  const initialEvent = events.find((e) => e.id === initialEventId) ?? null;
  const defaultRes = resources.find((r) => r.isDefault) ?? resources[0];

  const [kind, setKind] = useState<EntryKind>(initialEvent && !initialEvent.onCalendar ? "event" : initialEvent ? "setup" : "hold");
  const [eventId, setEventId] = useState(initialEvent?.id ?? "");
  const [resourceId, setResourceId] = useState(defaultRes?.id ?? "");
  const [date, setDate] = useState(initialEvent?.date ?? defaultDate);
  const [endDate, setEndDate] = useState(initialEvent?.date ?? defaultDate);
  const [allDay, setAllDay] = useState(initialEvent ? !initialEvent.start : false);
  const [start, setStart] = useState(initialEvent?.start ?? "09:00");
  const [end, setEnd] = useState(initialEvent?.finish ?? (initialEvent?.start ? addHours(initialEvent.start, 2) : "10:00"));
  const [state, action, pending] = useActionState<CalFormState, FormData>(createCalendarEntry, undefined);

  const ev = events.find((e) => e.id === eventId) ?? null;
  const res = resources.find((r) => r.id === resourceId);

  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);

  function pickEvent(id: string) {
    setEventId(id);
    const e = events.find((x) => x.id === id);
    if (!e) return;
    setDate(e.date); setEndDate(e.date);
    if (kind === "event") {
      setAllDay(!e.start);
      if (e.start) { setStart(e.start); setEnd(e.finish ?? addHours(e.start, 2)); }
    }
  }

  const titlePlaceholder = ev ? (kind === "event" ? ev.name : `${KIND_LABEL[kind]} · ${ev.name}`) : kind === "hold" ? "e.g. Hold for Smith wedding" : "Title";
  const syncNote = !res ? "" : res.provider === "google" && res.syncEnabled
    ? google.connected ? `Will sync to ${res.name}’s Google calendar.` : `${res.name} is set to sync, but Google Calendar isn’t connected — it will be saved in EventureOS and marked “not synced”.`
    : `${res.name} is a local calendar — this stays in EventureOS.`;

  return (
    <Drawer onClose={onClose} title={<h2 className="text-[16px] font-semibold text-ink">Add to calendar</h2>}>
      <form action={action} className="space-y-4 px-4 pt-4 sm:px-5 sm:py-4">
        <div>
          <Label>Type</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cn("rounded-full px-3 py-2 text-[12.5px] font-medium ring-1 ring-inset sm:py-1.5",
                  kind === k ? "bg-ink text-white ring-ink" : "bg-white text-ink-muted ring-line-strong hover:text-ink")}>
                {k === "event" ? "Event booking" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input type="hidden" name="kind" value={kind} />
          <p className="mt-1.5 text-[12px] text-ink-muted">{KIND_HINT[kind]}</p>
        </div>

        <div>
          <Label htmlFor="cal_event" hint={kind === "event" ? "Required" : "Optional"}>Event</Label>
          <Select id="cal_event" name="event_id" value={eventId} onChange={(e) => pickEvent(e.target.value)} required={kind === "event"}>
            <option value="">{kind === "event" ? "Choose an event…" : "Not linked to an event"}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.dateLabel} · {e.name}{e.customerName ? ` (${e.customerName})` : ""}{e.onCalendar ? " · on calendar" : ""}
              </option>
            ))}
          </Select>
          {kind === "event" && ev?.onCalendar && <p className="mt-1 text-[12px] text-amber-800">Already has a booking entry — adding another on the same resource is blocked to avoid duplicates.</p>}
        </div>

        <div>
          <Label htmlFor="cal_res">Resource</Label>
          <Select id="cal_res" name="calendar_connection_id" value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          {syncNote && <p className="mt-1 text-[12px] text-ink-muted">{syncNote}</p>}
        </div>

        <div>
          <Label htmlFor="cal_title" hint={ev ? "Leave blank to use the event name" : undefined}>Title</Label>
          <Input id="cal_title" name="title" placeholder={titlePlaceholder} required={!ev} maxLength={200} />
        </div>

        <label className="flex min-h-10 items-center gap-2 text-[13px] text-ink sm:min-h-0">
          <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-500" />
          All day
        </label>

        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
          <div>
            <Label htmlFor="cal_date">Starts</Label>
            <Input id="cal_date" type="date" name="date" value={date} required
              onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
          </div>
          <div>
            <Label htmlFor="cal_start">&nbsp;</Label>
            <Input id="cal_start" type="time" name="start_time" value={start} onChange={(e) => setStart(e.target.value)} disabled={allDay} aria-label="Start time" />
          </div>
          <div>
            <Label htmlFor="cal_end_date">Ends</Label>
            <Input id="cal_end_date" type="date" name="end_date" value={endDate} min={date} required onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cal_end">&nbsp;</Label>
            <Input id="cal_end" type="time" name="end_time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={allDay} aria-label="End time" />
          </div>
        </div>

        <div>
          <Label htmlFor="cal_loc" hint="Optional">Location</Label>
          <Input id="cal_loc" name="location" placeholder={ev?.venue ?? ""} />
        </div>

        <FormError message={state?.error} />
        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:pt-4">
          <Button type="button" variant="ghost" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="h-10 flex-1 sm:h-9 sm:flex-none" disabled={pending || !resources.length}>{pending ? "Adding…" : "Add to calendar"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
