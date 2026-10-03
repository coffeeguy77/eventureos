"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { addEventCrew, removeEventCrew, setCrewNeeds, setCrewStatus } from "../crew-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface CrewRow { id: string; crew_member_id: string; name: string; email: string | null; role: string | null; status: "interested" | "offered" | "confirmed"; calendar: string | null; onBoard: boolean }
export interface CrewNeeds { ready: boolean; needed: number | null; notes: string | null }
export interface CrewOption { id: string; name: string; email: string | null; role: string | null; always_invite: boolean }

/** Staff-list people (no login) working this job. They — and "always invite" people — get the calendar invite. */
export function CrewCard({ eventId, rows: all, options, canEdit, needs, confirmed }: { eventId: string; rows: CrewRow[]; options: CrewOption[]; canEdit: boolean; needs?: CrewNeeds; confirmed?: boolean }) {
  const rows = all.filter((r) => r.status !== "interested");
  const hands = all.filter((r) => r.status === "interested");
  const [needed, setNeeded] = useState(needs?.needed == null ? "" : String(needs.needed));
  const [notes, setNotes] = useState(needs?.notes ?? "");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const always = options.filter((o) => o.always_invite);
  const available = options.filter((o) => !o.always_invite && !rows.some((r) => r.crew_member_id === o.id));
  const want = needs?.needed ?? 1;
  const accepted = rows.filter((r) => r.status === "confirmed" && r.calendar !== "declined").length;
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
                {needs?.ready && (
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {r.calendar === "declined" ? <Badge tone="red">Declined the calendar invite</Badge>
                      : r.status === "confirmed" ? <Badge tone="green">Accepted</Badge>
                      : <Badge tone="amber">Hasn&apos;t accepted yet</Badge>}
                    {r.onBoard && <Badge tone="amber">On the job board — looking for cover</Badge>}
                  </p>
                )}
              </div>
              {canEdit && needs?.ready && r.status === "offered" && (
                <button type="button" onClick={() => run(() => setCrewStatus(r.id, "confirmed"))} disabled={pending} className="rounded-md px-2 py-1 text-[0.7188rem] font-medium text-brand-700 hover:bg-brand-50" title="They've confirmed another way (text, call)">Mark accepted</button>
              )}
              {canEdit && (
                <button type="button" onClick={() => run(() => removeEventCrew(r.id))} disabled={pending} aria-label={`Take ${r.name} off this job`}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {needs?.ready && hands.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-inset ring-amber-200">
          <p className="text-[0.7188rem] font-semibold uppercase tracking-wide text-amber-800">Hands up while TBC <span className="font-normal normal-case">— best-ranked free people get it automatically when the job is confirmed</span></p>
          <ul className="mt-1 space-y-1">
            {hands.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-[0.8125rem]">
                <span className="text-ink">{h.name}</span>
                {canEdit && <button type="button" disabled={pending} onClick={() => run(() => setCrewStatus(h.id, confirmed ? "confirmed" : "offered"))} className="rounded-md px-2 py-0.5 text-[0.7188rem] font-medium text-brand-700 hover:bg-brand-50">Give them the shift</button>}
              </li>
            ))}
          </ul>
        </div>
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
      {needs?.ready && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-muted">
            <span>Staff needed</span>
            <input value={needed} disabled={!canEdit || pending} inputMode="numeric" placeholder="1" onChange={(e) => setNeeded(e.target.value.replace(/\D/g, ""))}
              onBlur={() => { const n = needed === "" ? null : Number(needed); if (n !== needs.needed) run(() => setCrewNeeds(eventId, n, notes)); }}
              className="h-8 w-14 rounded-md border border-line bg-surface px-2 text-right tabular text-ink" aria-label="Staff needed" />
            <span className={accepted >= want ? "text-emerald-700" : "text-amber-700"}>{accepted} of {want} accepted</span>
          </div>
          <textarea value={notes} disabled={!canEdit || pending} rows={2} maxLength={4000} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if ((notes || null) !== (needs.notes || null)) run(() => setCrewNeeds(eventId, needed === "" ? null : Number(needed), notes)); }}
            placeholder="Notes for staff — shown in the staff app, never to the client (parking, access, who to ask for…)"
            className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint" />
        </div>
      )}
      {error && <div className="mt-2"><FormError message={error} /></div>}
    </div>
  );
}
