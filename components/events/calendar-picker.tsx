"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { monthAvailability } from "@/app/hire/[org]/actions";

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T00:00:00Z");
export const niceDate = (s: string) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parse(s));

/**
 * A date button that opens a month calendar showing which days are already booked out (and, when only a few are left, how many).
 * `free` comes from the business's calendar via monthAvailability; days not listed are fully free.
 */
export function CalendarPicker({ slug, kind, value, onChange, today, total, wanted, leadDays, id }: {
  slug: string; kind: string; value: string; onChange: (d: string) => void; today: string; total: number; wanted: number; leadDays: number; id: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || today).slice(0, 7) + "-01");
  const [free, setFree] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = `${kind}:${month}`;
    if (loaded.has(key)) return;
    monthAvailability(slug, kind, month).then((r) => { setFree((f) => ({ ...f, ...r })); setLoaded((l) => new Set(l).add(key)); }).catch(() => {});
  }, [open, month, kind, slug, loaded]);
  useEffect(() => { setLoaded(new Set()); setFree({}); }, [kind]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const cells = useMemo(() => {
    const first = parse(month);
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))))];
  }, [month]);
  const shift = (n: number) => { const d = parse(month); d.setUTCMonth(d.getUTCMonth() + n); setMonth(iso(d)); };
  const canBack = month > today.slice(0, 7) + "-01";
  const soon = (d: string) => (parse(d).getTime() - parse(today).getTime()) / 864e5 < leadDays;

  return (
    <div className="relative" ref={box}>
      <button type="button" id={id} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`flex h-[52px] w-full items-center gap-3 rounded-[14px] border bg-white px-4 text-left text-[0.9688rem] transition ${open ? "border-[var(--pk)] ring-4 ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]" : "border-[#E6DCD4] hover:border-[#CFC3BA]"}`}>
        <CalendarDays className="h-[18px] w-[18px] text-[var(--pk)]" />
        <span className={value ? "font-medium" : "text-[#A39A93]"}>{value ? niceDate(value) : "Choose a date"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[58px] z-30 w-[320px] rounded-[20px] bg-white p-4 shadow-[0_30px_60px_-24px_rgba(40,20,20,.35)] ring-1 ring-[#EDE3DB]" role="dialog" aria-label="Choose a date">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#F4ECE6] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <p className="font-semibold">{new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(month))}</p>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#F4ECE6]"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-[0.6875rem] font-bold uppercase tracking-wide text-[#8C847D]">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="py-1">{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const past = d < today;
              const left = free[d] ?? total;
              const full = left < Math.max(1, wanted);
              const few = !full && left < total;
              const sel = d === value;
              return (
                <button key={d} type="button" disabled={past || full} onClick={() => { onChange(d); setOpen(false); }}
                  title={full ? "Booked out" : few ? `${left} of ${total} left` : soon(d) ? "Tentative — under the lead time" : "Available"}
                  className={`relative grid h-10 place-items-center rounded-xl text-[0.875rem] transition
                    ${sel ? "bg-[var(--pk)] font-bold text-white" : past ? "text-[#CFC6BF]" : full ? "text-[#C9BFB8] line-through" : "font-medium hover:bg-[#FBE7EA]"}`}>
                  {Number(d.slice(8))}
                  {!sel && !past && few && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#E8A23B]" />}
                  {!sel && !past && !full && !few && soon(d) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#B9AEA6]" />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-[#5E5853]">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#E8A23B]" />Only a few left</span>
            <span className="inline-flex items-center gap-1.5"><span className="line-through">12</span>Booked out</span>
            {leadDays > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#B9AEA6]" />Tentative (under {leadDays} days)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
