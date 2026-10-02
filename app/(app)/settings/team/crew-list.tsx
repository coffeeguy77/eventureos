"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveCrewMember, type CrewInput } from "@/app/(app)/events/crew-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export interface CrewMember { id: string; name: string; email: string | null; phone: string | null; role: string | null; always_invite: boolean; active: boolean }

/** People who work jobs but don't log in to EventureOS — they receive the calendar invites. */
export function CrewList({ rows, canEdit }: { rows: CrewMember[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const active = rows.filter((r) => r.active), inactive = rows.filter((r) => !r.active);
  return (
    <div className="px-4 pb-5 sm:px-5">
      {rows.length === 0 && editing !== "new" && <p className="text-[0.8125rem] text-ink-muted">Nobody yet. Add your casual staff here — no login needed.</p>}
      <ul className="divide-y divide-line">
        {[...active, ...inactive].map((r) => editing === r.id
          ? <li key={r.id} className="py-3"><CrewForm initial={r} onDone={() => setEditing(null)} /></li>
          : (
            <li key={r.id} className={`flex items-center gap-3 py-2.5 ${r.active ? "" : "opacity-60"}`}>
              <Avatar name={r.name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink">{r.name}
                  {r.role && <span className="font-normal text-ink-muted">· {r.role}</span>}
                  {r.always_invite && <Badge tone="brand">On every job&apos;s invite</Badge>}
                  {!r.active && <Badge tone="slate">Inactive</Badge>}
                </p>
                <p className="truncate text-[0.75rem] text-ink-faint">{[r.email ?? "No email", r.phone].filter(Boolean).join(" · ")}</p>
              </div>
              {canEdit && <button type="button" onClick={() => setEditing(r.id)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label={`Edit ${r.name}`}><Pencil className="h-4 w-4" /></button>}
            </li>
          ))}
      </ul>
      {editing === "new" && <div className="mt-3 rounded-xl p-3 ring-1 ring-inset ring-line"><CrewForm onDone={() => setEditing(null)} /></div>}
      {canEdit && editing === null && <Button size="sm" className="mt-3" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add to staff list</Button>}
    </div>
  );
}

function CrewForm({ initial, onDone }: { initial?: CrewMember; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<CrewInput>({
    name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "", role: initial?.role ?? "",
    always_invite: initial?.always_invite ?? false, active: initial?.active ?? true,
  });
  const set = (k: keyof CrewInput, val: string | boolean) => setV((x) => ({ ...x, [k]: val }));
  const save = () => start(async () => {
    setError(null);
    const r = await saveCrewMember(initial?.id ?? null, v).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cr-name">Name</Label><Input id="cr-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus /></div>
        <div><Label htmlFor="cr-role" hint="e.g. Barista, Rosters">Role</Label><Input id="cr-role" value={v.role ?? ""} onChange={(e) => set("role", e.target.value)} maxLength={60} /></div>
        <div><Label htmlFor="cr-email" hint="for calendar invites">Email</Label><Input id="cr-email" type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div><Label htmlFor="cr-phone">Phone</Label><Input id="cr-phone" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} maxLength={40} /></div>
      </div>
      <label className="flex items-start gap-2 text-[0.8125rem] text-ink">
        <input type="checkbox" checked={v.always_invite} onChange={(e) => set("always_invite", e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
        <span>Invite to every job <span className="text-ink-faint">(e.g. whoever does the rosters)</span></span>
      </label>
      {initial && (
        <label className="flex items-start gap-2 text-[0.8125rem] text-ink">
          <input type="checkbox" checked={v.active !== false} onChange={(e) => set("active", e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>Active <span className="text-ink-faint">(untick when someone leaves — they stay on past jobs)</span></span>
        </label>
      )}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={save} disabled={pending || !v.name.trim()}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
