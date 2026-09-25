"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { assignEnquiry, convertToEvent, setEnquiryStatus, updateEnquiryDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, inputClass } from "@/components/ui/form";
import { ENQUIRY_STATUS, ENQUIRY_STATUS_ORDER, EVENT_TYPES } from "@/lib/status";
import type { EnquiryStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { DateTimeField } from "@/components/ui/datetime-field";

export function StatusSelect({ id, status }: { id: string; status: EnquiryStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      disabled={pending}
      value={status}
      onChange={(e) => start(() => setEnquiryStatus(id, e.target.value as EnquiryStatus))}
      className={cn(inputClass, "h-9 w-auto py-0 pr-8 text-[13px] font-medium")}
    >
      {ENQUIRY_STATUS_ORDER.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS[s].label}</option>)}
    </select>
  );
}

export function AssignSelect({ id, assignee, members }: { id: string; assignee: string | null; members: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Assigned to"
      disabled={pending}
      value={assignee ?? ""}
      onChange={(e) => start(() => assignEnquiry(id, e.target.value || null))}
      className={cn(inputClass, "h-9 w-auto py-0 pr-8 text-[13px]")}
    >
      <option value="">Unassigned</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

export function ConvertToEvent({ id, defaultName }: { id: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}>Convert to event</Button>;
  return (
    <form
      action={(fd) => start(() => convertToEvent(id, fd))}
      className="flex flex-wrap items-center gap-2"
    >
      <input name="event_name" defaultValue={defaultName} aria-label="Event name" className={cn(inputClass, "h-9 w-64 py-0")} autoFocus />
      <Button variant="primary" disabled={pending}>{pending ? "Converting…" : "Create event"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}

export interface DetailsValues {
  title: string; event_type: string | null; event_date: string | null; guest_count: number | null;
  budget: number | null; venue: string | null; next_action: string | null; next_action_due: string | null; contact_phone: string | null;
}

export function DetailsEditor({ id, values, view }: { id: string; values: DetailsValues; view: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: { error?: string } | undefined, fd: FormData) => {
      const res = await updateEnquiryDetails(id, prev, fd);
      if (!res?.error) setEditing(false);
      return res;
    },
    undefined
  );
  if (!editing) {
    return (
      <div className="relative">
        <button onClick={() => setEditing(true)} className="absolute -top-10 right-5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {view}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor="title">Title</Label><Input id="title" name="title" defaultValue={values.title} required /></div>
      <div>
        <Label htmlFor="event_type">Event type</Label>
        <Select id="event_type" name="event_type" defaultValue={values.event_type ?? ""}>
          <option value="">—</option>
          {[...new Set([...(values.event_type ? [values.event_type] : []), ...EVENT_TYPES])].map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="event_date">Event date</Label><Input id="event_date" name="event_date" type="date" defaultValue={values.event_date ?? ""} /></div>
      <div><Label htmlFor="guest_count">Guests</Label><Input id="guest_count" name="guest_count" inputMode="numeric" defaultValue={values.guest_count ?? ""} /></div>
      <div><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" inputMode="decimal" defaultValue={values.budget ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="venue">Venue</Label><Input id="venue" name="venue" defaultValue={values.venue ?? ""} /></div>
      <div><Label htmlFor="contact_phone">Phone</Label><Input id="contact_phone" name="contact_phone" defaultValue={values.contact_phone ?? ""} /></div>
      <div />
      <div><Label htmlFor="next_action">Next action</Label><Input id="next_action" name="next_action" defaultValue={values.next_action ?? ""} /></div>
      <div><Label htmlFor="next_action_due">Due</Label><DateTimeField id="next_action_due" name="next_action_due" defaultISO={values.next_action_due} /></div>
      <div className="sm:col-span-2"><FormError message={state?.error} /></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
