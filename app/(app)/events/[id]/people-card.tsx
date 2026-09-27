"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addJobPerson, makeMainContact, removeJobPerson, sendJobPortalInvite } from "../staff-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface PersonRow { id: string; contact_id: string; name: string; email: string | null; phone: string | null; role: string | null; primary: boolean; invited_at: string | null }

/** The client's people on this job — hand-overs, extra contacts, who gets the calendar invite. */
export function PeopleCard({ eventId, rows, others, canEdit }: {
  eventId: string; rows: PersonRow[]; others: { id: string; name: string; email: string | null }[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "existing" | "new">("none");
  const [pick, setPick] = useState("");
  const [f, setF] = useState({ first: "", last: "", email: "", phone: "", role: "" });
  const [invite, setInvite] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) setError(r.error ?? "Something went wrong."); else after?.();
    router.refresh();
  });
  const available = others.filter((o) => !rows.some((r) => r.contact_id === o.id));

  return (
    <div className="px-5 pb-5">
      {rows.length === 0 ? <p className="text-[12.5px] text-ink-muted">No contacts linked to this job yet.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{r.name} {r.primary && <Badge tone="brand">Main contact</Badge>}</p>
                <p className="break-all text-[12px] text-ink-muted">{[r.role, r.email, r.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                {r.invited_at && <p className="text-[11.5px] text-ink-faint">Portal invite sent {new Date(r.invited_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>}
              </div>
              {canEdit && r.email && (
                <button type="button" disabled={pending} onClick={() => run(() => sendJobPortalInvite(r.id), () => setNote(`Portal invite emailed to ${r.email}.`))}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink">{r.invited_at ? "Invite again" : "Invite to portal"}</button>
              )}
              {canEdit && !r.primary && (
                <>
                  <button type="button" disabled={pending} onClick={() => run(() => makeMainContact(eventId, r.contact_id))} className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-brand-700 hover:bg-brand-50">Make main</button>
                  <button type="button" disabled={pending} onClick={() => run(() => removeJobPerson(r.id))} aria-label={`Remove ${r.name}`} className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && mode === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {available.length > 0 && <Button size="sm" onClick={() => setMode("existing")}>Add a client contact</Button>}
          <Button size="sm" onClick={() => setMode("new")}>Add someone new</Button>
        </div>
      )}
      {canEdit && mode === "existing" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={cn(inputClass, "w-auto min-w-[12rem] flex-1 py-1.5")} aria-label="Contact">
            <option value="">Choose…</option>
            {available.map((o) => <option key={o.id} value={o.id}>{o.name}{o.email ? ` — ${o.email}` : ""}</option>)}
          </select>
          <Button size="sm" className="h-9" disabled={!pick || pending} onClick={() => run(() => addJobPerson(eventId, { contactId: pick }), () => { setPick(""); setMode("none"); })}>Add</Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setMode("none")}>Cancel</Button>
        </div>
      )}
      {canEdit && mode === "new" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(["first", "last", "email", "phone"] as const).map((k) => (
            <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={cn(inputClass, "py-1.5")}
              placeholder={{ first: "First name", last: "Last name", email: "Email", phone: "Mobile" }[k]} type={k === "email" ? "email" : "text"} />
          ))}
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={cn(inputClass, "py-1.5 sm:col-span-2")} placeholder="Role, e.g. On-site contact / Taking over" />
          <label className="flex items-center gap-2 text-[12.5px] text-ink sm:col-span-2">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="h-4 w-4 rounded" />
            Email them a link to the booking in the client portal
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" variant="primary" disabled={!f.first.trim() || pending} onClick={() => run(() => addJobPerson(eventId, { ...f, sendInvite: invite && !!f.email.trim() }), () => { setF({ first: "", last: "", email: "", phone: "", role: "" }); setMode("none"); })}>Add to job</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-2"><FormError message={error} /></div>}
      {note && !error && <p className="mt-2 text-[12.5px] font-medium text-emerald-700">{note}</p>}
    </div>
  );
}
