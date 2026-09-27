"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addEventStaff, removeEventStaff, updateEventStaff } from "../staff-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface StaffRow { id: string; user_id: string; name: string; team_role: string; role: string | null; sees_details: boolean | null; default_details: boolean; auto_added: boolean }

/** Who is working this event. Changes are pushed to the calendar invite on the next sync. */
export function StaffCard({ eventId, rows, team, canEdit }: {
  eventId: string; rows: StaffRow[]; team: { id: string; name: string; role: string }[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("");
  const available = team.filter((t) => !rows.some((r) => r.user_id === t.id));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    router.refresh();
  });

  return (
    <div className="px-5 pb-5">
      {rows.length === 0 ? <p className="text-[0.7812rem] text-ink-muted">Nobody rostered yet.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const effective = r.sees_details ?? r.default_details;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <Avatar name={r.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium text-ink">{r.name} {r.auto_added && <Badge tone="slate">every event</Badge>}</p>
                  {canEdit ? (
                    <input defaultValue={r.role ?? ""} placeholder="Role, e.g. Barista" maxLength={60} aria-label={`Role for ${r.name}`}
                      onBlur={(e) => { if ((e.target.value || null) !== r.role) run(() => updateEventStaff(r.id, { role: e.target.value })); }}
                      className="mt-0.5 w-full rounded border-0 bg-transparent p-0 text-[0.75rem] text-ink-muted placeholder:text-ink-faint focus:ring-0" />
                  ) : <p className="text-[0.75rem] text-ink-muted">{r.role ?? r.team_role}</p>}
                </div>
                {r.team_role === "staff" && (
                  <select disabled={!canEdit || pending} value={r.sees_details === null ? "default" : r.sees_details ? "yes" : "no"}
                    onChange={(e) => run(() => updateEventStaff(r.id, { sees_details: e.target.value === "default" ? null : e.target.value === "yes" }))}
                    aria-label={`Can ${r.name} see what's included`}
                    className={cn("rounded-md border-line-strong py-1 pl-2 pr-7 text-[0.75rem]", effective ? "text-emerald-800" : "text-ink-muted")}>
                    <option value="default">Inclusions: {r.default_details ? "shown" : "hidden"} (their default)</option>
                    <option value="yes">Inclusions: shown on this job</option>
                    <option value="no">Inclusions: hidden on this job</option>
                  </select>
                )}
                {canEdit && (
                  <button type="button" onClick={() => run(() => removeEventStaff(r.id))} disabled={pending} aria-label={`Take ${r.name} off this event`}
                    className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={cn(inputClass, "w-auto min-w-[10rem] flex-1 py-1.5")} aria-label="Team member">
            <option value="">Add someone…</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" maxLength={60} className={cn(inputClass, "w-36 py-1.5")} />
          <Button size="sm" className="h-9" disabled={!pick || pending} onClick={() => run(async () => { const r = await addEventStaff(eventId, pick, role || null); if (r.ok) { setPick(""); setRole(""); } return r; })}>Add</Button>
        </div>
      )}
      {error && <div className="mt-2"><FormError message={error} /></div>}
      <p className="mt-3 text-[0.7188rem] text-ink-faint">Rostered staff see this job in My jobs — never prices. They're added to the calendar invite.</p>
    </div>
  );
}
