"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { EntryChip, FALLBACK_COLOUR } from "./entry-chip";
import { calendarHref, minutesLabel, type Entry, type Resource, type Segment } from "./model";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PER_CELL = 3;

export type DayItem = { entry: Entry; seg: Segment };

/** Entries touching a day, all-day first, then by start time. */
export function itemsForDay(entries: Entry[], date: string): DayItem[] {
  const out: DayItem[] = [];
  for (const e of entries) {
    const seg = e.segments.find((s) => s.date === date);
    if (seg) out.push({ entry: e, seg });
  }
  return out.sort((a, b) =>
    (a.entry.lane === "allday" ? 0 : 1) - (b.entry.lane === "allday" ? 0 : 1) || a.seg.startMin - b.seg.startMin || a.entry.title.localeCompare(b.entry.title));
}

export function MonthView({ days, month, today, entries, resources, hide, onOpen }: {
  days: string[]; month: string; today: string; entries: Entry[]; resources: Map<string, Resource>; hide: string[]; onOpen: (id: string) => void;
}) {
  const dayHref = (d: string) => calendarHref({ view: "day", date: d, hide, today });
  const inMonth = (d: string) => d.slice(0, 7) === month;

  return (
    <>
      {/* Desktop / tablet grid */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-line">
          {days.map((d) => {
            const items = itemsForDay(entries, d);
            const conflicts = items.filter((i) => i.entry.conflictsWith.length).length;
            const extra = items.length - MAX_PER_CELL;
            const isToday = d === today;
            return (
              <div key={d} className={cn("min-h-[118px] min-w-0 p-1.5", inMonth(d) ? "bg-white" : "bg-zinc-50/80", isToday && "bg-brand-50/50")}>
                <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                  <Link href={dayHref(d)}
                    className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-medium tabular",
                      isToday ? "bg-brand-500 text-white" : inMonth(d) ? "text-ink hover:bg-zinc-100" : "text-ink-faint hover:bg-zinc-100")}
                    aria-label={fmtDate(d, "long")}>
                    {Number(d.slice(8))}
                  </Link>
                  {conflicts > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{conflicts} clash</span>}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, extra > 0 ? MAX_PER_CELL - 1 : MAX_PER_CELL).map(({ entry, seg }) => (
                    <EntryChip key={entry.id} entry={entry} resource={resources.get(entry.resourceId)} onOpen={onOpen}
                      timeText={seg.fromPrev ? "…" : minutesLabel(seg.startMin)} />
                  ))}
                  {extra > 0 && (
                    <Link href={dayHref(d)} className="block px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted hover:text-brand-700">
                      +{extra + 1} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone: compact month grid (dots per booking) + the selected day's entries below */}
      <PhoneMonth days={days} today={today} entries={entries} resources={resources} inMonth={inMonth} dayHref={dayHref} onOpen={onOpen} />
    </>
  );
}

const MAX_DOTS = 3;

/** Phone (< sm) month view: a 7-column grid that fits a 360px screen, with the tapped day's bookings listed underneath. */
function PhoneMonth({ days, today, entries, resources, inMonth, dayHref, onOpen }: {
  days: string[]; today: string; entries: Entry[]; resources: Map<string, Resource>;
  inMonth: (d: string) => boolean; dayHref: (d: string) => string; onOpen: (id: string) => void;
}) {
  const monthDays = days.filter(inMonth);
  const [selected, setSelected] = useState(() =>
    monthDays.includes(today) ? today : monthDays.find((d) => itemsForDay(entries, d).length) ?? monthDays[0] ?? days[0]);
  const selItems = itemsForDay(entries, selected);

  return (
    <div className="sm:hidden">
      <div className="grid grid-cols-7 border-b border-line text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
        {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w.slice(0, 1)}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px border-b border-line bg-line">
        {days.map((d) => {
          const items = itemsForDay(entries, d);
          const conflict = items.some((i) => i.entry.conflictsWith.length);
          const isSel = d === selected;
          const isToday = d === today;
          return (
            <button key={d} type="button" onClick={() => setSelected(d)} aria-pressed={isSel}
              aria-label={`${fmtDate(d, "long")}${items.length ? ` · ${items.length} booking${items.length > 1 ? "s" : ""}` : ""}${conflict ? " · conflict" : ""}`}
              className={cn("flex min-h-[52px] min-w-0 flex-col items-center gap-1 pb-1.5 pt-1", inMonth(d) ? "bg-white" : "bg-zinc-50/80", isSel && "bg-brand-50")}>
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium tabular",
                isToday ? "bg-brand-500 text-white" : isSel ? "ring-2 ring-inset ring-brand-400 text-ink" : inMonth(d) ? "text-ink" : "text-ink-faint",
                conflict && !isToday && "text-rose-700")}>
                {Number(d.slice(8))}
              </span>
              {items.length > 0 && (
                <span className="flex h-1.5 items-center gap-0.5">
                  {items.slice(0, MAX_DOTS).map(({ entry }) => (
                    <span key={entry.id} className={cn("h-1.5 w-1.5 rounded-full", entry.conflictsWith.length > 0 && "ring-1 ring-rose-500 ring-offset-1")}
                      style={{ backgroundColor: entry.conflictsWith.length ? "#e11d48" : resources.get(entry.resourceId)?.colour || FALLBACK_COLOUR }} />
                  ))}
                  {items.length > MAX_DOTS && <span className="text-[9px] font-semibold leading-none text-ink-faint">+{items.length - MAX_DOTS}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-ink">{fmtDate(selected, "weekday")}</p>
          <Link href={dayHref(selected)} className="-mr-2 inline-flex h-9 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-brand-600 hover:bg-brand-50">
            Day view <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {selItems.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-3 text-center text-[12.5px] text-ink-muted">Nothing booked.</p>
        ) : (
          <div className="space-y-1.5 [&>button]:min-h-10 [&>button]:py-2 [&>button]:text-[13px]">
            {selItems.map(({ entry, seg }) => (
              <EntryChip key={entry.id} entry={entry} resource={resources.get(entry.resourceId)} onOpen={onOpen}
                timeText={seg.fromPrev ? "…" : minutesLabel(seg.startMin)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
