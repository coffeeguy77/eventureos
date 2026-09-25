"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { EntryChip, FALLBACK_COLOUR, tint } from "./entry-chip";
import { itemsForDay, type DayItem } from "./month-view";
import { GRID_END_HOUR, GRID_START_HOUR, calendarHref, minutesLabel, type Entry, type Resource } from "./model";

const HOUR_PX = 52;
const MIN_START = GRID_START_HOUR * 60;
const MIN_END = GRID_END_HOUR * 60;
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

type Placed = DayItem & { col: number; cols: number; top: number; height: number; clippedTop: boolean; clippedBottom: boolean };

/** Lay out overlapping timed entries side by side (greedy columns within each overlap cluster). */
function layoutDay(items: DayItem[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.seg.startMin - b.seg.startMin || b.seg.endMin - a.seg.endMin);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    for (const p of cluster) p.cols = cols;
    cluster = [];
  };
  for (const it of sorted) {
    if (it.seg.startMin >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((p) => p.seg.endMin > it.seg.startMin).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    const s = Math.min(Math.max(it.seg.startMin, MIN_START), MIN_END - 15);
    const e = Math.max(Math.min(it.seg.endMin, MIN_END), s + 15);
    const p: Placed = {
      ...it, col, cols: 1,
      top: ((s - MIN_START) / 60) * HOUR_PX,
      height: Math.max(22, ((e - s) / 60) * HOUR_PX - 2),
      clippedTop: it.seg.startMin < MIN_START, clippedBottom: it.seg.endMin > MIN_END,
    };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, it.seg.endMin);
  }
  if (cluster.length) flush();
  return placed;
}

export function TimeGrid({ days, today, nowMin, entries, resources, hide, onOpen }: {
  days: string[]; today: string; nowMin: number; entries: Entry[]; resources: Map<string, Resource>; hide: string[]; onOpen: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const perDay = days.map((d) => {
    const items = itemsForDay(entries, d);
    return { d, allDay: items.filter((i) => i.entry.lane === "allday"), timed: layoutDay(items.filter((i) => i.entry.lane === "timed")) };
  });
  const hasAllDay = perDay.some((p) => p.allDay.length);
  const single = days.length === 1;

  // Start scrolled to the first booking (or 8am) so the useful part is in view.
  useEffect(() => {
    const first = Math.min(...perDay.flatMap((p) => p.timed.map((t) => t.seg.startMin)), 8 * 60);
    if (scroller.current) scroller.current.scrollTop = Math.max(0, ((Math.max(first, MIN_START) - MIN_START) / 60) * HOUR_PX - 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols = single ? "grid-cols-[56px_minmax(0,1fr)]" : "grid-cols-[56px_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-x-auto">
      <div className={cn(!single && "min-w-[760px]")}>
        {/* Day headers */}
        <div className={cn("grid border-b border-line", cols)}>
          <div />
          {days.map((d) => (
            <Link key={d} href={calendarHref({ view: "day", date: d, hide, today })}
              className={cn("border-l border-line px-2 py-2 text-center hover:bg-zinc-50", d === today && "bg-brand-50/50")}>
              <span className={cn("block text-[11px] font-semibold uppercase tracking-wide", d === today ? "text-brand-700" : "text-ink-faint")}>
                {fmtDate(d, "weekday").split(" ")[0]}
              </span>
              <span className={cn("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-semibold tabular",
                d === today ? "bg-brand-500 text-white" : "text-ink")}>{Number(d.slice(8))}</span>
            </Link>
          ))}
        </div>

        {/* All-day lane */}
        {hasAllDay && (
          <div className={cn("grid border-b border-line bg-zinc-50/40", cols)}>
            <div className="px-1.5 py-1.5 text-right text-[10.5px] font-medium text-ink-faint">All day</div>
            {perDay.map(({ d, allDay }) => (
              <div key={d} className="min-w-0 space-y-0.5 border-l border-line p-1">
                {allDay.map(({ entry }) => (
                  <EntryChip key={entry.id} entry={entry} resource={resources.get(entry.resourceId)} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Timed grid */}
        <div ref={scroller} className="max-h-[640px] overflow-y-auto">
          <div className={cn("relative grid", cols)} style={{ height: HOURS.length * HOUR_PX }}>
            <div className="relative">
              {HOURS.map((h, i) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-ink-faint tabular" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? "" : minutesLabel(h * 60)}
                </span>
              ))}
            </div>
            {perDay.map(({ d, timed }) => (
              <div key={d} className={cn("relative border-l border-line", d === today && "bg-brand-50/25")}>
                {HOURS.map((h, i) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
                ))}
                {timed.map((p) => {
                  const res = resources.get(p.entry.resourceId);
                  const colour = res?.colour ?? FALLBACK_COLOUR;
                  const conflict = p.entry.conflictsWith.length > 0;
                  const compact = p.height < 40;
                  return (
                    <button key={p.entry.id} type="button" onClick={() => onOpen(p.entry.id)}
                      title={`${p.entry.title} · ${p.entry.timeLabel} · ${res?.name ?? ""}${conflict ? " · CONFLICT" : ""}`}
                      className={cn("absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11.5px] leading-tight shadow-sm transition hover:z-10 hover:shadow-pop",
                        conflict ? "bg-rose-50 text-rose-900 ring-2 ring-rose-500" : "text-ink ring-1 ring-white")}
                      style={{
                        top: p.top + 1, height: p.height,
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`,
                        ...(conflict ? {} : { backgroundColor: tint(colour, "24"), boxShadow: `inset 3px 0 0 ${colour}` }),
                      }}>
                      <span className="flex items-center gap-1 font-semibold">
                        {conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" />}
                        <span className="truncate">{p.entry.title}</span>
                      </span>
                      {!compact && (
                        <span className="block truncate text-ink-muted">
                          {p.clippedTop ? "↑ " : ""}{minutesLabel(p.seg.startMin)}–{p.seg.endMin >= 1440 ? "midnight" : minutesLabel(p.seg.endMin)}{p.clippedBottom ? " ↓" : ""}
                        </span>
                      )}
                      {!compact && p.height > 60 && <span className="block truncate text-ink-muted">{res?.name}</span>}
                      {conflict && !compact && <span className="block font-semibold text-rose-700">Conflict</span>}
                    </button>
                  );
                })}
                {d === today && nowMin >= MIN_START && nowMin <= MIN_END && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: ((nowMin - MIN_START) / 60) * HOUR_PX }}>
                    <div className="relative h-0.5 bg-rose-500"><span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-rose-500" /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
