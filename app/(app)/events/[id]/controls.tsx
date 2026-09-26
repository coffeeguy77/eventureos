"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { setEventStatus, updateEventDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea, inputClass } from "@/components/ui/form";
import { DateTimeField } from "@/components/ui/datetime-field";
import { EVENT_STATUS, EVENT_STATUS_ORDER, EVENT_TYPES } from "@/lib/status";
import type { EventRecord, EventStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export function EventStatusSelect({ id, status }: { id: string; status: EventStatus }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label="Event status" disabled={pending} value={status}
      onChange={(e) => start(() => setEventStatus(id, e.target.value as EventStatus))}
      className={cn(inputClass, "h-10 w-full py-0 pr-8 text-[13px] font-medium sm:h-9 sm:w-auto")}>
      {EVENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{EVENT_STATUS[s].label}</option>)}
    </select>
  );
}

export function EventDetailsEditor({ event, members, view }: {
  event: EventRecord; members: { id: string; name: string }[]; view: React.ReactNode;
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
        <button onClick={() => setEditing(true)} className="absolute -top-11 right-3 inline-flex h-10 items-center gap-1 px-2 text-[12.5px] sm:-top-10 sm:right-5 sm:h-auto sm:px-0 font-medium text-brand-600 hover:text-brand-700">
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
      <div className="sm:col-span-2"><Label htmlFor="event_date">Date</Label><Input id="event_date" name="event_date" type="date" defaultValue={event.event_date ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="start_time">Start</Label><Input id="start_time" name="start_time" type="time" defaultValue={event.start_time?.slice(0, 5) ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="finish_time">Finish</Label><Input id="finish_time" name="finish_time" type="time" defaultValue={event.finish_time?.slice(0, 5) ?? ""} /></div>
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
