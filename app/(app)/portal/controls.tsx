"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { requestDocument, type StaffActionState } from "./actions";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy the portal link:", url);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export function RequestDocumentForm({ events }: { events: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(requestDocument, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  if (events.length === 0) return <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No active events to request documents for.</p>;
  return (
    <form ref={ref} action={action} className="space-y-3 px-5 pb-5">
      <div>
        <Label htmlFor="req-event">Event</Label>
        <Select id="req-event" name="event_id" required defaultValue="">
          <option value="" disabled>Choose an event…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="req-name">Document needed</Label>
        <Input id="req-name" name="name" required maxLength={200} placeholder="e.g. Signed venue contract, Public liability certificate" />
      </div>
      <FormError message={state?.error} />
      {state?.message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100">{state.message}</p>}
      <Button variant="primary" size="sm" disabled={pending}>{pending ? "Requesting…" : "Request document"}</Button>
    </form>
  );
}
