"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, relativeDay } from "@/lib/format";
import { FALLBACK_COLOUR } from "./entry-chip";
import { itemsForDay } from "./month-view";
import { KIND_LABEL, minutesLabel, type Entry, type Resource } from "./model";

export function AgendaView({ days, today, entries, resources, onOpen }: {
  days: string[]; today: string; entries: Entry[]; resources: Map<string, Resource>; onOpen: (id: string) => void;
}) {
  const groups = days.map((d) => ({ d, items: itemsForDay(entries, d) })).filter((g) => g.items.length);
  if (!groups.length) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[13px] font-medium text-ink">Nothing booked in the next {days.length} days</p>
        <p className="mt-1 text-[12.5px] text-ink-muted">Add an event, hold, site visit or setup with “Add entry”.</p>
      </div>
    );
  }
  return (
    <div>
      {groups.map(({ d, items }) => (
        <section key={d}>
          <h3 className={cn("sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 border-b border-line bg-zinc-50/95 px-4 py-2 sm:px-5 text-[12px] font-semibold backdrop-blur",
            d === today ? "text-brand-700" : "text-ink")}>
            {fmtDate(d, "long")}
            <span className="font-normal text-ink-faint">{relativeDay(d, today)}</span>
          </h3>
          <ul className="divide-y divide-line">
            {items.map(({ entry, seg }) => {
              const res = resources.get(entry.resourceId);
              const conflict = entry.conflictsWith.length > 0;
              return (
                <li key={entry.id}>
                  <button type="button" onClick={() => onOpen(entry.id)}
                    className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-zinc-50/80 sm:gap-3 sm:px-5 sm:py-2.5", conflict && "bg-rose-50/70 hover:bg-rose-50")}>
                    <span className="tabular w-[76px] shrink-0 pt-0.5 text-[12px] text-ink-muted sm:w-[92px] sm:text-[12.5px]">
                      {entry.lane === "allday" ? "All day" : `${seg.fromPrev ? "…" : minutesLabel(seg.startMin)} – ${seg.toNext ? "…" : minutesLabel(seg.endMin)}`}
                    </span>
                    <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: res?.colour ?? FALLBACK_COLOUR }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink">{entry.title}</span>
                        {entry.kind !== "event" && <span className="shrink-0 rounded bg-zinc-100 px-1.5 text-[10.5px] font-medium text-ink-muted">{KIND_LABEL[entry.kind]}</span>}
                      </span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {[res?.name, entry.customerName, entry.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {conflict && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white sm:px-2" aria-label="Conflict">
                        <AlertTriangle className="h-3 w-3" /><span className="hidden sm:inline"> Conflict</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
