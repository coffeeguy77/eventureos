"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Entry, Resource } from "./model";

/** Resource colour with alpha, tolerant of non-hex values. */
export function tint(hex: string | undefined, alpha: string) {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex + alpha : `rgba(109, 74, 255, 0.12)`;
}

export const FALLBACK_COLOUR = "#6D4AFF";

/** Compact entry used in month cells. */
export function EntryChip({ entry, resource, onOpen, showTime = true, timeText }: {
  entry: Entry; resource: Resource | undefined; onOpen: (id: string) => void; showTime?: boolean; timeText?: string;
}) {
  const colour = resource?.colour ?? FALLBACK_COLOUR;
  const conflict = entry.conflictsWith.length > 0;
  const bar = entry.lane === "allday";
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      title={`${entry.title} · ${entry.timeLabel} · ${resource?.name ?? ""}${conflict ? " · CONFLICT" : ""}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left text-[11.5px] leading-tight transition-colors",
        conflict ? "bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-300 hover:bg-rose-100"
          : bar ? "text-ink hover:brightness-95" : "text-ink hover:bg-zinc-100"
      )}
      style={bar && !conflict ? { backgroundColor: tint(colour, "26"), boxShadow: `inset 3px 0 0 ${colour}` } : undefined}
    >
      {conflict ? <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" />
        : !bar && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />}
      {showTime && !bar && <span className="tabular shrink-0 text-ink-muted">{timeText}</span>}
      <span className="truncate font-medium">{entry.title}</span>
    </button>
  );
}
