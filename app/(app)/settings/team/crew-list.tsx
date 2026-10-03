"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Send, Smartphone } from "lucide-react";
import { inviteCrewToApp, moveCrewRank, saveCrewMember, setDefaultStaffRate, setStaffRate, type CrewInput } from "@/app/(app)/events/crew-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export interface CrewMember {
  id: string; name: string; email: string | null; phone: string | null; role: string | null; always_invite: boolean; active: boolean;
  hourly_rate?: number | null; rank?: number; extra_emails?: string[]; app_invited_at?: string | null; app_last_seen_at?: string | null; user_id?: string | null;
}
type AppInfo = { ready: boolean; slug: string; rate: number };

/** People who work jobs but don't log in to EventureOS — they receive the calendar invites. */
export function CrewList({ rows, canEdit, canAdmin = false, app }: { rows: CrewMember[]; canEdit: boolean; canAdmin?: boolean; app?: AppInfo }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setNote(r.ok ? (ok ? { text: ok, ok: true } : null) : { text: r.error ?? "Something went wrong.", ok: false });
    router.refresh();
  });
  const active = rows.filter((r) => r.active), inactive = rows.filter((r) => !r.active);
  const appUrl = app?.slug ? `${typeof window === "undefined" ? "" : window.location.origin}/crew/${app.slug}` : "";
  return (
    <div className="px-4 pb-5 sm:px-5">
      {app?.ready && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-[0.7812rem] text-ink-muted ring-1 ring-inset ring-line">
          <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-ink-faint" />Staff app: <code className="rounded bg-surface px-1.5 py-0.5 text-ink">/crew/{app.slug}</code>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(appUrl); setNote({ text: "Link copied.", ok: true }); }} className="text-brand-700 hover:underline" aria-label="Copy staff app link"><Copy className="h-3.5 w-3.5" /></button></span>
          <span className="inline-flex items-center gap-1.5">Default pay rate
            <RateInput value={app.rate} disabled={!canAdmin || pending} onSave={(v) => run(() => setDefaultStaffRate(v ?? 30), "Default rate saved.")} required /> /hr
          </span>
        </div>
      )}
      {note && <p className={`mb-2 text-[0.75rem] ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</p>}
      {rows.length === 0 && editing !== "new" && <p className="text-[0.8125rem] text-ink-muted">Nobody yet. Add your casual staff here — no login needed.</p>}
      <ul className="divide-y divide-line">
        {[...active, ...inactive].map((r) => editing === r.id
          ? <li key={r.id} className="py-3"><CrewForm initial={r} onDone={() => setEditing(null)} /></li>
          : (
            <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${r.active ? "" : "opacity-60"}`}>
              {canEdit && app?.ready && r.active && (
                <span className="flex flex-col">
                  <button type="button" disabled={pending || active[0]?.id === r.id} onClick={() => run(() => moveCrewRank(r.id, -1))} aria-label={`Move ${r.name} up`} className="rounded p-0.5 text-ink-faint hover:bg-zinc-100 hover:text-ink disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={pending || active[active.length - 1]?.id === r.id} onClick={() => run(() => moveCrewRank(r.id, 1))} aria-label={`Move ${r.name} down`} className="rounded p-0.5 text-ink-faint hover:bg-zinc-100 hover:text-ink disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </span>
              )}
              {app?.ready && r.active && <span className="w-5 text-center text-[0.75rem] font-semibold tabular text-ink-faint">{active.findIndex((a) => a.id === r.id) + 1}</span>}
              <Avatar name={r.name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink">{r.name}
                  {r.role && <span className="font-normal text-ink-muted">· {r.role}</span>}
                  {r.always_invite && <Badge tone="brand">On every job&apos;s invite</Badge>}
                  {!r.active && <Badge tone="slate">Inactive</Badge>}
                </p>
                <p className="truncate text-[0.75rem] text-ink-faint">{[r.email ?? "No email", ...(r.extra_emails ?? []), r.phone].filter(Boolean).join(" · ")}</p>
                {app?.ready && r.active && (
                  <p className="text-[0.7188rem] text-ink-faint">{r.app_last_seen_at ? <span className="text-emerald-700">Using the staff app</span> : r.app_invited_at ? "Invited to the staff app" : "Not invited to the staff app yet"}</p>
                )}
              </div>
              {app?.ready && r.active && (
                <span className="flex items-center gap-1 text-[0.75rem] text-ink-muted">
                  <RateInput value={r.hourly_rate ?? null} placeholder={String(app.rate)} disabled={!canEdit || pending} onSave={(v) => run(() => setStaffRate(r.id, v), "Rate saved.")} />/hr
                </span>
              )}
              {canEdit && app?.ready && r.active && r.email && (
                <button type="button" disabled={pending} onClick={() => run(() => inviteCrewToApp(r.id), `Staff app link emailed to ${r.email}.`)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50" title="Email them the staff app link">
                  <Send className="h-3.5 w-3.5" />{r.app_invited_at ? "Resend app" : "Invite to app"}
                </button>
              )}
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
  const [extras, setExtras] = useState((initial?.extra_emails ?? []).join(", "));
  const set = (k: keyof CrewInput, val: string | boolean) => setV((x) => ({ ...x, [k]: val }));
  const save = () => start(async () => {
    setError(null);
    const r = await saveCrewMember(initial?.id ?? null, { ...v, extra_emails: extras.split(/[,\s;]+/).filter(Boolean) }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
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
        <div className="sm:col-span-2"><Label htmlFor="cr-extra" hint="they can sign in to the staff app with any of these">Other emails they use</Label>
          <Input id="cr-extra" value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="e.g. jim.smith@gmail.com, jim@bigpond.com" /></div>
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


/** A small $/hr box that saves on blur. Empty = use the default rate (unless required). */
function RateInput({ value, placeholder, disabled, onSave, required }: { value: number | null; placeholder?: string; disabled?: boolean; onSave: (v: number | null) => void; required?: boolean }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface px-1.5">
      <span className="text-ink-faint">$</span>
      <input value={v} disabled={disabled} inputMode="decimal" placeholder={placeholder} aria-label="Hourly rate"
        onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => { const n = v.trim() === "" ? null : Number(v); if (n === value || (n == null && required)) return; if (n != null && !Number.isFinite(n)) return; onSave(n); }}
        className="h-7 w-14 bg-transparent px-1 text-right tabular text-[0.75rem] text-ink outline-none" />
    </span>
  );
}
