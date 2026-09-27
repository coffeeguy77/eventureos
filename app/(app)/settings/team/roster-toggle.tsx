"use client";

import { useState, useTransition } from "react";
import { setRosterDefault } from "../actions";

/** A checkbox that saves one roster default straight away. */
export function RosterToggle({ kind, id, field, value, label, disabled }: {
  kind: "member" | "invite"; id: string; field: "auto_add_to_events" | "sees_job_details"; value: boolean; label: string; disabled?: boolean;
}) {
  const [on, setOn] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2 text-[0.7812rem] text-ink" title={error ?? undefined}>
      <input type="checkbox" checked={on} disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next); setError(null);
          start(async () => {
            try { await setRosterDefault(kind, id, field, next); }
            catch (err) { setOn(!next); setError(err instanceof Error ? err.message : "Couldn't save"); }
          });
        }}
        className="h-4 w-4 rounded border-line-strong text-brand-600" />
      <span className={error ? "text-rose-700" : undefined}>{error ? `${label} — ${error}` : label}</span>
    </label>
  );
}
