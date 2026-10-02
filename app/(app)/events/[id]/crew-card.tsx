"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { addEventCrew, removeEventCrew } from "../crew-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface CrewRow { id: string; crew_member_id: string; name: string; email: string | null; role: string | null }
export interface CrewOption { id: string; name: string; email: string | null; role: string | null; always_invite: boolean }

/** Staff-list people (no login) working this job. They — and "always invite" people — get the calendar invite. */
export function CrewCard({ eventId, rows, options, canEdit }: { eventId: string; rows: CrewRow[]; options: CrewOption[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const always = options.filter((o) => o.always_invite);
  const available = options.filter((o) => !o.always_invite && !rows.some((r) => r.crew_member_id === o.id));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    router.refresh();
  });
  return (
    <div className="border-t border-line px-5 py-4">
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Staff list</p>
      {rows.length === 0 ? <p className="mt-1.5 text-[0.7812rem] text-ink-muted">Nobody from the staff list yet.</p> : (
        <ul className="mt-1 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <Avatar name={r.name} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium text-ink">{r.name}{r.role ? <span className="font-normal text-ink-muted"> · {r.role}</span> : null}</p>
                <p className="truncate text-[0.75rem] text-ink-faint">{r.email ?? "No email — won't get the invite"}</p>
              </div>
              {canEdit && (
                <button type="button" onClick={() => run(() => removeEventCrew(r.id))} disabled={pending} aria-label={`Take ${r.name} off this job`}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={cn(inputClass, "w-auto min-w-[10rem] flex-1 py-1.5")} aria-label="Staff list person">
            <option value="">Add from the staff list…</option>
            {available.map((o) => <option key={o.id} value={o.id}>{o.name}{o.role ? ` (${o.role})` : ""}</option>)}
          </select>
          <Button size="sm" className="h-9" disabled={!pick || pending} onClick={() => run(async () => { const r = await addEventCrew(eventId, pick, null); if (r.ok) setPick(""); return r; })}>Add</Button>
        </div>
      )}
      {always.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.7188rem] text-ink-faint">
          Always invited: {always.map((a) => <Badge key={a.id} tone="slate">{a.name}</Badge>)}
        </p>
      )}
      {options.length === 0 && canEdit && (
        <p className="mt-2 text-[0.75rem] text-ink-muted">No staff list yet. <Link href="/settings/team" className="font-medium text-brand-700 hover:underline">Add people</Link> without giving them a login.</p>
      )}
      {error && <div className="mt-2"><FormError message={error} /></div>}
    </div>
  );
}
