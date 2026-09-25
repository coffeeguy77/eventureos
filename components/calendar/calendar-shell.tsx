"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fmtDate, relativeDay } from "@/lib/format";
import { AgendaView } from "./agenda-view";
import { AddEntryPanel } from "./add-entry-panel";
import { EntryPanel } from "./entry-panel";
import { FALLBACK_COLOUR } from "./entry-chip";
import { MonthView } from "./month-view";
import { TimeGrid } from "./time-grid";
import { VIEWS, calendarHref, stepDate, viewTitle, type CalView, type Entry, type Resource } from "./model";

export interface EventOption {
  id: string; number: number; name: string; date: string; dateLabel: string; start: string | null; finish: string | null;
  venue: string | null; customerName: string | null; status: string; onCalendar: boolean;
}
export interface GoogleStatus { connected: boolean; status: string; account: string | null; lastSync: string | null; error: string | null }

export function CalendarShell({ view, date, today, nowMin, days, resources, entries, eventOptions, google, canManage, initialAddEventId }: {
  view: CalView; date: string; today: string; nowMin: number; days: string[]; resources: Resource[]; entries: Entry[];
  eventOptions: EventOption[]; google: GoogleStatus; canManage: boolean; initialAddEventId: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ eventId: string | null } | null>(initialAddEventId ? { eventId: initialAddEventId } : null);
  const closeAdd = useCallback(() => setAdding(null), []);
  const closeEntry = useCallback(() => setOpenId(null), []);

  const hide = resources.filter((r) => r.hidden).map((r) => r.id);
  const resMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const visible = entries.filter((e) => !resMap.get(e.resourceId)?.hidden);
  const href = (p: Partial<{ view: CalView; date: string; hide: string[] }>) =>
    calendarHref({ view: p.view ?? view, date: p.date ?? date, hide: p.hide ?? hide, today });

  // Conflict pairs across every resource (hidden ones included — a clash matters even if filtered out)
  const pairs = useMemo(() => {
    const out: { a: Entry; b: Entry }[] = [];
    for (const a of entries) for (const id of a.conflictsWith) {
      const b = byId.get(id);
      if (b && a.id < b.id) out.push(a.startsAt <= b.startsAt ? { a, b } : { a: b, b: a });
    }
    return out.sort((x, y) => x.a.startsAt.localeCompare(y.a.startsAt));
  }, [entries, byId]);
  const hiddenConflicts = pairs.filter((p) => resMap.get(p.a.resourceId)?.hidden).length;
  const conflictResources = [...new Set(pairs.map((p) => resMap.get(p.a.resourceId)?.name).filter(Boolean))];

  const unscheduled = eventOptions.filter((e) => !e.onCalendar && e.date >= today).slice(0, 8);
  const open = openId ? byId.get(openId) : undefined;
  const defaultAddDate = view === "day" ? date : days.includes(today) ? today : days[0];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Calendar</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">Every booking, hold and setup across every resource.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding({ eventId: null })} disabled={!resources.length}>
          <Plus className="h-4 w-4" /> Add entry
        </Button>
      </div>

      {pairs.length > 0 && (
        <a href="#conflicts" className="mb-4 flex items-center gap-3 rounded-xl bg-rose-600 px-4 py-3 text-white shadow-card hover:bg-rose-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 text-[13.5px]">
            <span className="font-semibold">{pairs.length} scheduling conflict{pairs.length > 1 ? "s" : ""} in this view</span>
            <span className="text-white/85"> — {conflictResources.join(", ")} double-booked{hiddenConflicts ? ` (${hiddenConflicts} on hidden resources)` : ""}</span>
          </span>
          <span className="hidden shrink-0 text-[12.5px] font-medium underline-offset-2 hover:underline sm:inline">Review conflicts</span>
        </a>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <ButtonLink href={href({ date: today })} size="sm" aria-current={days.includes(today) ? "date" : undefined}>Today</ButtonLink>
              <div className="flex">
                <Link href={href({ date: stepDate(view, date, -1) })} aria-label="Previous" className={buttonClass("ghost", "sm", "px-2")}><ChevronLeft className="h-4 w-4" /></Link>
                <Link href={href({ date: stepDate(view, date, 1) })} aria-label="Next" className={buttonClass("ghost", "sm", "px-2")}><ChevronRight className="h-4 w-4" /></Link>
              </div>
              <h2 className="text-[15px] font-semibold text-ink">{viewTitle(view, date)}</h2>
              {view === "day" && <span className="text-[12.5px] text-ink-faint">{relativeDay(date, today)}</span>}
            </div>
            <nav className="flex rounded-lg bg-zinc-100 p-0.5" aria-label="Calendar view">
              {VIEWS.map((v) => (
                <Link key={v.key} href={href({ view: v.key })} aria-current={view === v.key ? "page" : undefined}
                  className={cn("rounded-md px-3 py-1 text-[12.5px] font-medium", view === v.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
                  {v.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Resource filter */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
            {resources.map((r) => {
              const next = r.hidden ? hide.filter((id) => id !== r.id) : [...hide, r.id];
              const count = entries.filter((e) => e.resourceId === r.id).length;
              return (
                <Link key={r.id} href={href({ hide: next })} scroll={false} aria-pressed={!r.hidden}
                  title={r.hidden ? `Show ${r.name}` : `Hide ${r.name}`}
                  className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors",
                    r.hidden ? "bg-white text-ink-faint ring-line line-through" : "bg-white text-ink ring-line-strong hover:bg-zinc-50")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", r.hidden && "opacity-30")} style={{ backgroundColor: r.colour || FALLBACK_COLOUR }} />
                  {r.name}
                  <span className="tabular text-ink-faint">{count}</span>
                  {r.provider === "google" && <span className="rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">{r.syncEnabled ? "G" : "G off"}</span>}
                </Link>
              );
            })}
            {hide.length > 0 && <Link href={href({ hide: [] })} scroll={false} className="px-1 text-[12px] font-medium text-brand-600 hover:text-brand-700">Show all</Link>}
            <span className={cn("ml-auto text-[11.5px]", google.error ? "font-medium text-rose-700" : google.connected ? "text-emerald-700" : "text-ink-faint")}>
              {google.error ? `Google Calendar sync error: ${google.error}`
                : google.connected ? `Google Calendar connected${google.account ? ` (${google.account})` : ""}${google.lastSync ? ` · last sync ${google.lastSync}` : ""}`
                  : "Google Calendar not connected · entries stay in EventureOS"}
            </span>
          </div>

          {resources.length === 0 ? (
            <div className="px-6 py-12 text-center text-[13px] text-ink-muted">No calendar resources yet. Resources such as “Main Events” or “Coffee Cart 1” are set up in Settings.</div>
          ) : view === "month" ? (
            <MonthView days={days} month={date.slice(0, 7)} today={today} entries={visible} resources={resMap} hide={hide} onOpen={setOpenId} />
          ) : view === "agenda" ? (
            <AgendaView days={days} today={today} entries={visible} resources={resMap} onOpen={setOpenId} />
          ) : (
            <TimeGrid days={days} today={today} nowMin={nowMin} entries={visible} resources={resMap} hide={hide} onOpen={setOpenId} />
          )}
        </Card>

        <div className="space-y-6">
          <Card id="conflicts" className={cn(pairs.length > 0 && "border-rose-200")}>
            <CardHeader title={<span className="flex items-center gap-2">Conflicts {pairs.length > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">{pairs.length}</span>}</span>}
              subtitle={pairs.length ? "Overlapping entries on the same resource" : "No double-bookings in this view"} />
            {pairs.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {pairs.map(({ a, b }) => {
                  const r = resMap.get(a.resourceId);
                  return (
                    <li key={a.id + b.id} className="px-4 py-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-rose-700">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r?.colour ?? FALLBACK_COLOUR }} />
                        {r?.name} · {a.dateLabel}
                      </p>
                      {[a, b].map((e) => (
                        <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className="block w-full rounded-md px-1.5 py-1 text-left hover:bg-rose-50">
                          <span className="block truncate text-[13px] font-medium text-ink">{e.title}</span>
                          <span className="block text-[12px] text-ink-muted">{e.timeLabel}</span>
                        </button>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Not on the calendar" subtitle={unscheduled.length ? "Upcoming events without a booking entry" : "Every upcoming event is on a calendar"} />
            {unscheduled.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {unscheduled.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/events/${e.id}`} className="block truncate text-[13px] font-medium text-ink hover:text-brand-700">{e.name}</Link>
                      <p className="truncate text-[12px] text-ink-muted">{fmtDate(e.date, "weekday")}{e.customerName ? ` · ${e.customerName}` : ""}</p>
                    </div>
                    <Button size="sm" onClick={() => setAdding({ eventId: e.id })}>Add</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-[12.5px] font-medium text-ink">Legend</p>
            <ul className="mt-2 space-y-1.5 text-[12px] text-ink-muted">
              {resources.map((r) => (
                <li key={r.id} className="flex items-center gap-2" title={r.externalCalendarId ? `Google calendar ID: ${r.externalCalendarId}` : "Not linked to an external calendar"}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.colour || FALLBACK_COLOUR }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-ink-faint">{r.provider === "google" ? (r.syncEnabled ? "Google · sync on" : "Google · sync off") : "Local"}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 pt-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-50 ring-2 ring-rose-500" /> Conflict</li>
            </ul>
          </Card>
        </div>
      </div>

      {open && (
        <EntryPanel key={open.id} entry={open} entries={byId} resources={resources} google={google} canManage={canManage}
          onClose={closeEntry} onOpen={setOpenId} />
      )}
      {adding && (
        <AddEntryPanel key={adding.eventId ?? "new"} resources={resources} events={eventOptions} google={google}
          defaultDate={defaultAddDate} initialEventId={adding.eventId} onClose={closeAdd} />
      )}
    </div>
  );
}
