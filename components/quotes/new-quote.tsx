"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { createQuoteForEvent } from "@/app/(app)/quotes/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDate, relativeDay } from "@/lib/format";
import { EVENT_STATUS, QUOTE_STATUS } from "@/lib/status";
import type { EventStatus, QuoteStatus } from "@/lib/types";

export interface PickerEvent {
  id: string; number: number; name: string; event_date: string | null; status: EventStatus; customer: string;
  quotes: { id: string; number: number; status: QuoteStatus }[];
}

const run = async (eventId: string) =>
  createQuoteForEvent(eventId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));

/** Pick the event a new quote belongs to. */
export function EventPicker({ events, today }: { events: PickerEvent[]; today: string }) {
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtered = t
      ? events.filter((e) => [e.name, e.customer, `ev-${e.number}`, e.event_date ?? ""].some((f) => f.toLowerCase().includes(t)))
      : events;
    return filtered.slice(0, 100);
  }, [q, events]);

  function create(id: string) {
    setError(null);
    setPendingId(id);
    start(async () => {
      const r = await run(id);
      if (r && !r.ok) { setError(r.error); setPendingId(null); }
    });
  }

  return (
    <Card>
      <div className="border-b border-line p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events or customers…"
            aria-label="Search events" className={cn(inputClass, "h-10 pl-9")} />
        </div>
        {error && <div className="mt-3"><FormError message={error} /></div>}
      </div>
      {list.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-ink-muted">
          No matching events. <Link href="/events/new" className="font-medium text-brand-700 hover:underline">Create an event</Link> first — every quote belongs to one.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((e) => {
            const s = EVENT_STATUS[e.status];
            const busy = pendingId === e.id;
            return (
              <li key={e.id}>
                <button type="button" disabled={!!pendingId} onClick={() => create(e.id)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left sm:gap-4 sm:px-5 hover:bg-zinc-50 focus:bg-brand-50/50 focus:outline-none disabled:cursor-wait">
                  <div className="w-[5.5rem] shrink-0 sm:w-24">
                    <p className="whitespace-nowrap text-[13px] text-ink">{e.event_date ? fmtDate(e.event_date) : "No date"}</p>
                    {e.event_date && <p className="text-[11.5px] text-ink-faint">{relativeDay(e.event_date, today)}</p>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{e.name}</p>
                    <p className="truncate text-[12px] text-ink-muted">{e.customer} · EV-{e.number}</p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    {e.quotes.map((qq) => <Badge key={qq.id} tone={QUOTE_STATUS[qq.status].tone}>Q-{qq.number} {QUOTE_STATUS[qq.status].label}</Badge>)}
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" /> : <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint group-hover:text-brand-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** /quotes/new?event=… — creates the quote straight away (guarded so it only ever runs once). */
export function AutoCreate({ eventId, eventName }: { eventId: string; eventName: string }) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const go = () => {
    setError(null);
    start(async () => {
      const r = await run(eventId);
      if (r && !r.ok) setError(r.error);
    });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="mx-auto max-w-md px-5 py-10 text-center sm:px-6">
      {error ? (
        <>
          <p className="text-[14px] font-semibold text-ink">Couldn’t create the quote</p>
          <div className="mt-3 text-left"><FormError message={error} /></div>
          <div className="mt-4 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Button variant="primary" onClick={go} className="h-10 sm:h-9">Try again</Button>
            <ButtonLink href={`/events/${eventId}?tab=quote`} className="h-10 sm:h-9">Back to event</ButtonLink>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-600" />
          <p className="mt-3 text-[14px] font-semibold text-ink">Creating a quote for {eventName}…</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">You’ll be taken to the quote builder in a moment.</p>
        </>
      )}
    </Card>
  );
}

/** The event already has quotes: open one, or deliberately start another. */
export function ExistingQuotes({ eventId, eventName, quotes }: { eventId: string; eventName: string; quotes: { id: string; number: number; title: string; status: QuoteStatus }[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <Card className="mx-auto max-w-lg">
      <div className="px-5 pb-3 pt-5">
        <p className="text-[14px] font-semibold text-ink">{eventName} already has {quotes.length === 1 ? "a quote" : `${quotes.length} quotes`}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">Open the existing quote to keep editing, or start a separate one (for example, an alternative package).</p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {quotes.map((qq) => (
          <li key={qq.id}>
            <Link href={`/quotes/${qq.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50">
              <span className="tabular text-[13px] font-medium text-ink">Q-{qq.number}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{qq.title}</span>
              <Badge tone={QUOTE_STATUS[qq.status].tone} dot>{QUOTE_STATUS[qq.status].label}</Badge>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ButtonLink href={`/events/${eventId}?tab=quote`} variant="ghost" className="h-10 sm:h-9">Back to event</ButtonLink>
        <Button variant="primary" disabled={pending} className="h-10 sm:h-9" onClick={() => {
          setPending(true); setError(null);
          start(async () => { const r = await run(eventId); if (r && !r.ok) { setError(r.error); setPending(false); } });
        }}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Create another quote</Button>
      </div>
      {error && <div className="px-5 pb-5"><FormError message={error} /></div>}
    </Card>
  );
}
