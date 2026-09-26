"use client";

import { useActionState } from "react";
import { createEnquiry } from "../actions";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ENQUIRY_SOURCE, EVENT_TYPES } from "@/lib/status";

export function NewEnquiryForm({ members, me }: { members: { id: string; name: string }[]; me: string }) {
  const [state, action, pending] = useActionState(createEnquiry, undefined);
  return (
    <form action={action}>
      <Card className="p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">What are they after?</Label>
            <Input id="title" name="title" placeholder="e.g. Coffee cart for engagement party" required autoFocus />
          </div>
          <div><Label htmlFor="contact_name">Contact name</Label><Input id="contact_name" name="contact_name" autoComplete="off" /></div>
          <div><Label htmlFor="company" hint="Optional">Company</Label><Input id="company" name="company" /></div>
          <div><Label htmlFor="contact_email">Email</Label><Input id="contact_email" name="contact_email" type="email" /></div>
          <div><Label htmlFor="contact_phone">Phone</Label><Input id="contact_phone" name="contact_phone" type="tel" /></div>
        </div>
        <div className="my-6 border-t border-line" />
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="event_type">Event type</Label>
            <Select id="event_type" name="event_type" defaultValue=""><option value="">—</option>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          </div>
          <div><Label htmlFor="event_date">Event date</Label><Input id="event_date" name="event_date" type="date" /></div>
          <div><Label htmlFor="guest_count">Guests</Label><Input id="guest_count" name="guest_count" inputMode="numeric" /></div>
          <div><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" inputMode="decimal" placeholder="$" /></div>
          <div className="sm:col-span-2"><Label htmlFor="venue">Venue / location</Label><Input id="venue" name="venue" /></div>
          <div className="sm:col-span-3"><Label htmlFor="message">Notes from the enquiry</Label><Textarea id="message" name="message" rows={4} /></div>
          <div>
            <Label htmlFor="source">Source</Label>
            <Select id="source" name="source" defaultValue="phone">
              {Object.entries(ENQUIRY_SOURCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="assigned_to">Assign to</Label>
            <Select id="assigned_to" name="assigned_to" defaultValue={me}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="mt-6"><FormError message={state?.error} /></div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink href="/enquiries" className="h-10 w-full sm:h-9 sm:w-auto">Cancel</ButtonLink>
          <Button variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending}>{pending ? "Saving…" : "Create enquiry"}</Button>
        </div>
      </Card>
    </form>
  );
}
