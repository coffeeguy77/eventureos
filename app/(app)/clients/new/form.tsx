"use client";

import Link from "next/link";
import { useActionState, useState, startTransition } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { createClientRecord } from "../actions";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ENQUIRY_SOURCE } from "@/lib/status";
import { cn } from "@/lib/cn";

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClientRecord, undefined);
  const [kind, setKind] = useState<"individual" | "company">("individual");

  // Submit manually so the fields keep their values when we come back with possible duplicates.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  }

  const dupes = state?.duplicates ?? [];
  return (
    <form onSubmit={onSubmit}>
      <Card className="p-5 sm:p-6">
        <div className="mb-5 inline-flex rounded-lg bg-zinc-100 p-0.5" role="radiogroup" aria-label="Client type">
          {(["individual", "company"] as const).map((k) => (
            <label key={k} className={cn("cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-medium", kind === k ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "individual" ? "Individual" : "Company"}
            </label>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">{kind === "company" ? "Company name" : "Full name"}</Label>
            <Input id="name" name="name" required autoFocus placeholder={kind === "company" ? "e.g. Harbour Events Co." : "e.g. Emma Collins"} />
          </div>
          {kind === "individual" && <div className="sm:col-span-2"><Label htmlFor="company" hint="Optional">Company</Label><Input id="company" name="company" /></div>}
          <div><Label htmlFor="email">{kind === "company" ? "Accounts / general email" : "Email"}</Label><Input id="email" name="email" type="email" /></div>
          <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" type="tel" /></div>
          <div className="sm:col-span-2"><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
        </div>

        {kind === "company" && (
          <>
            <div className="my-6 border-t border-line" />
            <p className="mb-3 text-[12.5px] font-semibold text-ink">Main contact</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div><Label htmlFor="contact_first_name">First name</Label><Input id="contact_first_name" name="contact_first_name" /></div>
              <div><Label htmlFor="contact_last_name">Last name</Label><Input id="contact_last_name" name="contact_last_name" /></div>
              <div><Label htmlFor="contact_email">Email</Label><Input id="contact_email" name="contact_email" type="email" /></div>
              <div><Label htmlFor="contact_phone">Phone</Label><Input id="contact_phone" name="contact_phone" type="tel" /></div>
              <div className="sm:col-span-2"><Label htmlFor="contact_position">Position</Label><Input id="contact_position" name="contact_position" placeholder="e.g. Events Manager" /></div>
            </div>
          </>
        )}

        <div className="my-6 border-t border-line" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="source" hint="Optional">How did they find you?</Label>
            <Select id="source" name="source" defaultValue="">
              <option value="">—</option>
              {Object.entries(ENQUIRY_SOURCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="tags" hint="Comma separated">Tags</Label><Input id="tags" name="tags" placeholder="e.g. VIP, Repeat" /></div>
          <div className="sm:col-span-2"><Label htmlFor="notes" hint="Team only">Notes</Label><Textarea id="notes" name="notes" rows={3} /></div>
        </div>

        {dupes.length > 0 && (
          <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />This client may already exist</p>
            <ul className="mt-2 space-y-1.5">
              {dupes.map((d) => (
                <li key={d.id} className="text-[13px] text-ink">
                  Possible duplicate:{" "}
                  <Link href={`/clients/${d.id}`} className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">{d.name}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
                  <span className="text-ink-muted"> — {d.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-ink-muted">Open the existing record to add an event or contact there. Only create a new client if this is genuinely someone different.</p>
          </div>
        )}

        <div className="mt-6"><FormError message={state?.error} /></div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <ButtonLink href="/clients">Cancel</ButtonLink>
          {dupes.length > 0 ? (
            <Button variant="secondary" name="confirm_new" value="1" disabled={pending}>{pending ? "Creating…" : "Create a new client anyway"}</Button>
          ) : (
            <Button variant="primary" disabled={pending}>{pending ? "Checking…" : "Create client"}</Button>
          )}
        </div>
      </Card>
    </form>
  );
}
