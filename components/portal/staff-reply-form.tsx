"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyToPortalMessage, type StaffActionState } from "@/app/(app)/portal/actions";
import { Button } from "@/components/ui/button";
import { FormError, Textarea } from "@/components/ui/form";

export function StaffReplyForm({ eventId, customerId }: { eventId: string; customerId: string }) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(replyToPortalMessage, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <Textarea name="body" required maxLength={5000} placeholder="Reply to the customer — they'll see this in their portal" />
      <FormError message={state?.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-[11.5px] text-ink-faint">{state?.ok ? "Reply posted to the portal." : "Visible to the customer in their portal."}</p>
        <Button variant="primary" size="sm" className="h-10 w-full sm:h-8 sm:w-auto" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
      </div>
    </form>
  );
}
