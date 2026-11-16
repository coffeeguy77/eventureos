"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { autoSlash, resolveDate, showDMY } from "@/lib/dates/smart";

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * A date box you can type into the quick way — "30/11" fills in the year (next year when the month has already
 * passed, so "30/1" in November is January next year). A year you type always wins. The calendar button opens the picker.
 */
export function SmartDateInput({ value, onChange, today, className, inputClassName, ariaLabel, placeholder = "dd/mm", disabled }: {
  value: string | null; onChange: (iso: string | null) => void; today?: string; className?: string; inputClassName?: string;
  ariaLabel: string; placeholder?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(showDMY(value));
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setText(showDMY(value)); setBad(false); } }, [value]);
  const commit = () => {
    const t = text.trim();
    if (!t) { setBad(false); if (value) onChange(null); return; }
    const iso = resolveDate(t, today ?? localToday());
    if (!iso) { setBad(true); return; }
    setBad(false); setText(showDMY(iso));
    if (iso !== value) onChange(iso);
  };
  const openPicker = () => {
    const el = picker.current; if (!el) return;
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { el.focus(); el.click(); }
  };
  return (
    <span className={cn("relative flex items-center", className)}>
      <input type="text" inputMode="numeric" autoComplete="off" value={text} placeholder={placeholder} disabled={disabled} aria-label={ariaLabel} aria-invalid={bad || undefined}
        title={bad ? "Type a date like 30/11 or 30/11/2026" : "Type 30/11 — the year fills in for you"}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => { setText(autoSlash(e.target.value, text)); if (bad) setBad(false); }}
        onBlur={() => { focused.current = false; commit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className={cn("w-full pr-8 tabular", inputClassName, bad && "border-rose-400 text-rose-700 focus:border-rose-400 focus:ring-rose-100")} />
      <button type="button" onClick={openPicker} disabled={disabled} aria-label={`${ariaLabel} — open calendar`}
        className="absolute right-1 grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-canvas hover:text-ink disabled:opacity-50">
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
      <input ref={picker} type="date" tabIndex={-1} aria-hidden value={value ?? ""} onChange={(e) => { const v = e.target.value || null; setText(showDMY(v)); setBad(false); onChange(v); }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" />
    </span>
  );
}
