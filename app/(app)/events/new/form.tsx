"use client";

import { useActionState } from "react";
import { createEvent } from "../actions";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { EVENT_TYPES } from "@/lib/status";

export function NewEventForm({ customers, members, me, defaultCustomer }: {
  customers: { id: string; name: string }[]; members: { id: string; name: string }[]; me: string; defaultCustomer?: string;
}) {
  const [state, action, pending] = useActionState(createEvent, undefined);
  return (
    <form action={action}>
      <Card className="p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="customer_id">Customer</Label>
            <Select id="customer_id" name="customer_id" defaultValue={defaultCustomer ?? ""} required>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="name">Event name</Label><Input id="name" name="name" required placeholder="e.g. Annual staff breakfast" /></div>
          <div>
            <Label htmlFor="event_type">Event type</Label>
            <Select id="event_type" name="event_type" defaultValue=""><option value="">—</option>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          </div>
          <div><Label htmlFor="event_date">Date</Label><Input id="event_date" name="event_date" type="date" /></div>
          <div><Label htmlFor="start_time">Start</Label><Input id="start_time" name="start_time" type="time" /></div>
          <div><Label htmlFor="finish_time">Finish</Label><Input id="finish_time" name="finish_time" type="time" /></div>
          <div className="sm:col-span-2"><Label htmlFor="venue">Venue</Label><Input id="venue" name="venue" /></div>
          <div><Label htmlFor="guest_count">Guests</Label><Input id="guest_count" name="guest_count" inputMode="numeric" /></div>
          <div><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" inputMode="decimal" /></div>
          <div>
            <Label htmlFor="assigned_to">Lead</Label>
            <Select id="assigned_to" name="assigned_to" defaultValue={me}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </div>
        </div>
        <div className="mt-6"><FormError message={state?.error} /></div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink href="/events" className="h-10 w-full sm:h-9 sm:w-auto">Cancel</ButtonLink>
          <Button variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending}>{pending ? "Creating…" : "Create event"}</Button>
        </div>
      </Card>
    </form>
  );
}
