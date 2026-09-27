"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { approveBooking } from "../approval-actions";
import { Button } from "@/components/ui/button";

/** Shown on an event whose booking is waiting for an owner/admin to approve (short-notice or "every booking" rule). */
export function ApprovalBanner({ eventId, when, requestedAt, canApprove, invoiceNote }: {
  eventId: string; when: string; requestedAt: string | null; canApprove: boolean; invoiceNote: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="mb-5 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200 sm:p-5" role="alert">
      <div className="flex flex-wrap items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[0.9375rem] font-semibold text-amber-900">Booking waiting for approval — event is {when}</p>
          <p className="mt-1 text-[0.8125rem] text-amber-800">
            The customer accepted the quote{requestedAt ? ` ${requestedAt}` : ""}, but it is <strong>not confirmed</strong>: it isn’t on the calendar, no invoice has been raised,
            and their portal says we still need to confirm. Check you have the staff and equipment, then approve.
          </p>
          <p className="mt-1 text-[0.75rem] text-amber-800">Approving confirms the event, adds it to the calendar with the rostered staff and {invoiceNote}. Can’t do it? Call the customer, then set the status to Cancelled.</p>
          {error && <p className="mt-2 text-[0.8125rem] font-medium text-danger">{error}</p>}
        </div>
        {canApprove ? (
          <Button variant="primary" disabled={pending} className="w-full sm:w-auto"
            onClick={() => start(async () => {
              setError(null);
              const r = await approveBooking(eventId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
              if (!r.ok) setError(r.error); else router.refresh();
            })}>
            {pending ? "Approving…" : "Approve booking"}
          </Button>
        ) : (
          <p className="text-[0.75rem] font-medium text-amber-900">An owner or admin needs to approve this.</p>
        )}
      </div>
    </div>
  );
}
