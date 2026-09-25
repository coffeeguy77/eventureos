"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { EntryChip } from "./entry-chip";
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

      {/* Phone: a list of the month's busy days */}
      <div className="sm:hidden">
        {(() => {
          const list = days.filter((d) => inMonth(d)).map((d) => ({ d, items: itemsForDay(entries, d) })).filter((x) => x.items.length || x.d === today);
          if (!list.length) return <p className="px-4 py-8 text-center text-[13px] text-ink-muted">Nothing booked this month.</p>;
          return (
            <ul className="divide-y divide-line">
              {list.map(({ d, items }) => (
                <li key={d} className={cn("flex gap-3 px-4 py-3", d === today && "bg-brand-50/40")}>
                  <Link href={dayHref(d)} className="w-11 shrink-0 text-center">
                    <span className="block text-[10.5px] font-semibold uppercase text-ink-faint">{fmtDate(d, "weekday").split(" ")[0]}</span>
                    <span className={cn("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-semibold",
                      d === today ? "bg-brand-500 text-white" : "text-ink")}>{Number(d.slice(8))}</span>
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1">
                    {items.length === 0 ? <p className="pt-1.5 text-[12.5px] text-ink-faint">Nothing booked today</p> : items.map(({ entry, seg }) => (
                      <EntryChip key={entry.id} entry={entry} resource={resources.get(entry.resourceId)} onOpen={onOpen}
                        timeText={seg.fromPrev ? "…" : minutesLabel(seg.startMin)} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          );
        })()}
      </div>
    </>
  );
}
