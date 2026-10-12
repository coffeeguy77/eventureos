"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarPlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { addEventToCalendar } from "@/app/(app)/calendar/actions";

/** One-click "Add to calendar" for an event (no trip to the Calendar page); once it's on, "Send again" updates and re-sends it. */
export function AddToCalendarButton({ eventId, onCalendar, hasDate, size = "sm", className }: {
  eventId: string; onCalendar: boolean; hasDate: boolean; size?: "sm" | "xs"; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const send = () => start(async () => {
    const r = await addEventToCalendar(eventId).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { text: r.message, ok: true } : { text: r.error, ok: false });
    if (r.ok) router.refresh();
  });
  if (onCalendar) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-2 text-[0.75rem]", className)}>
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><CalendarCheck2 className="h-3.5 w-3.5" />On the calendar</span>
        <button type="button" disabled={pending} onClick={send} title="Update the calendar from the job and send it to Google Calendar now"
          className="inline-flex h-9 items-center gap-1 rounded-md px-1.5 font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60 sm:h-auto">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Send again
        </button>
        {msg && <span className={msg.ok ? "text-ink-muted" : "text-rose-700"}>{msg.text}</span>}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Button type="button" size="sm" variant={size === "xs" ? "ghost" : "secondary"} className={size === "xs" ? "h-9 px-2 sm:h-7" : "h-10 sm:h-8"}
        disabled={pending || !hasDate} title={hasDate ? "Add this booking to your calendar" : "Set the event date first"}
        onClick={send}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5 text-brand-600" />}Add to calendar
      </Button>
      {msg && <span className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
    </span>
  );
}
