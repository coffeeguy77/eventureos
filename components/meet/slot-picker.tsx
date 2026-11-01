"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DaySlots } from "@/lib/appointments/core";

const t12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const dayParts = (d: string) => { const dt = new Date(`${d}T00:00:00Z`); return { dow: dt.toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short" }), day: dt.getUTCDate(), month: dt.toLocaleDateString("en-AU", { timeZone: "UTC", month: "short" }), long: dt.toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }) }; };

/** Pick a day (a strip of the next weeks, free days marked) and then a time — morning / afternoon / evening. */
export function SlotPicker({ days, value, onChange, accent }: { days: DaySlots[]; value: { date: string; time: string } | null; onChange: (v: { date: string; time: string }) => void; accent: string }) {
  const firstFree = days.find((d) => d.times.length)?.date ?? days[0]?.date ?? "";
  const [date, setDate] = useState(value?.date ?? firstFree);
  const [page, setPage] = useState(0);
  const per = 7, pages = Math.max(1, Math.ceil(days.length / per));
  const shown = days.slice(page * per, page * per + per);
  const cur = days.find((d) => d.date === date);
  const groups = useMemo(() => {
    const t = cur?.times ?? [];
    return [["Morning", t.filter((x) => x < "12:00")], ["Afternoon", t.filter((x) => x >= "12:00" && x < "17:00")], ["Evening", t.filter((x) => x >= "17:00")]] as const;
  }, [cur]);
  if (!days.some((d) => d.times.length)) return <p className="rounded-2xl bg-canvas px-4 py-6 text-center text-[0.9375rem] text-ink-muted ring-1 ring-line">No times are free in the next few weeks — please get in touch and we&apos;ll find one.</p>;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-line disabled:opacity-30" aria-label="Earlier"><ChevronLeft className="h-5 w-5" /></button>
        <div className="grid flex-1 grid-cols-7 gap-1.5">
          {shown.map((d) => {
            const p = dayParts(d.date), free = d.times.length > 0, on = d.date === date;
            return (
              <button key={d.date} type="button" disabled={!free} onClick={() => setDate(d.date)}
                className={cn("flex flex-col items-center rounded-2xl py-2.5 transition", on ? "text-white shadow-lg" : free ? "bg-canvas text-ink ring-1 ring-line hover:ring-2" : "text-ink-faint opacity-50")}
                style={on ? { background: accent } : undefined}>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide opacity-80">{p.dow}</span>
                <span className="text-[1.25rem] font-bold leading-tight">{p.day}</span>
                <span className="text-[0.6875rem] opacity-80">{p.month}</span>
                <span className={cn("mt-1 h-1.5 w-1.5 rounded-full", free ? (on ? "bg-white" : "") : "bg-transparent")} style={free && !on ? { background: accent } : undefined} />
              </button>
            );
          })}
        </div>
        <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-line disabled:opacity-30" aria-label="Later"><ChevronRight className="h-5 w-5" /></button>
      </div>
      {cur && (
        <div>
          <p className="mb-3 text-[1rem] font-semibold text-ink">{dayParts(cur.date).long}</p>
          {cur.times.length === 0 ? <p className="text-ink-muted">No times free this day.</p> : (
            <div className="space-y-4">
              {groups.filter(([, list]) => list.length).map(([label, list]) => (
                <div key={label}>
                  <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {list.map((t) => {
                      const on = value?.date === cur.date && value.time === t;
                      return <button key={t} type="button" onClick={() => onChange({ date: cur.date, time: t })} className={cn("h-11 rounded-xl text-[0.9375rem] font-semibold transition", on ? "text-white shadow-md" : "bg-canvas text-ink ring-1 ring-line hover:ring-2")} style={on ? { background: accent } : undefined}>{t12(t)}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export { t12, dayParts };
