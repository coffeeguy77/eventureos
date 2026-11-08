"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAvailability } from "../approval-actions";

/** A quote accepted late (after expiry or inside 3 days): the client was told to call; confirm once it's sorted. */
export function AvailabilityBanner({ eventId, phone }: { eventId: string; phone: string | null }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="mb-5 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30 sm:p-5" role="alert">
      <div className="flex flex-wrap items-start gap-3">
        <PhoneCall className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[0.9375rem] font-semibold text-amber-900 dark:text-amber-100">Availability to be confirmed — accepted late</p>
          <p className="mt-1 text-[0.8125rem] text-amber-800 dark:text-amber-200">
            The client accepted after the quote expired or less than 3 days before the event. They&apos;ve been told to call to confirm, and the calendar shows it as <b>TBC</b>.
            {phone ? <> Their number: <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-medium underline">{phone}</a>.</> : null}
          </p>
          {err && <p className="mt-2 text-[0.8125rem] font-medium text-danger">{err}</p>}
        </div>
        <Button variant="primary" disabled={busy} className="w-full sm:w-auto" onClick={() => start(async () => { const r = await confirmAvailability(eventId); if (r.ok) router.refresh(); else setErr(r.error); })}>We&apos;re available — confirm</Button>
      </div>
    </div>
  );
}
