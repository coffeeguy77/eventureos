"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { ACCESS_PRESETS, SECTIONS } from "@/lib/access";
import { setMemberAccess } from "@/app/(app)/settings/actions";

/** Limit someone to chosen parts of the back end (or give them everything their role allows). */
export function AccessEditor({ kind, id, initial, disabled }: { kind: "member" | "invite"; id: string; initial: string[] | null; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  const label = !initial?.length ? "All sections" : ACCESS_PRESETS.find((p) => p.sections.length === initial.length && p.sections.every((x) => initial.includes(x)))?.label ?? `${initial.length} section${initial.length === 1 ? "" : "s"}`;
  const save = async (list: string[] | null) => {
    setBusy(true); setErr(null);
    const r = await setMemberAccess(kind, id, list);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOpen(false); router.refresh();
  };
  if (disabled) return <span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-muted"><KeyRound className="h-3.5 w-3.5" />{label}</span>;
  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(!open); setPick(initial ?? []); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand-700 ring-1 ring-line hover:bg-zinc-50">
        <KeyRound className="h-3.5 w-3.5" />{label}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[min(92vw,420px)] rounded-xl bg-surface p-4 text-left shadow-xl ring-1 ring-line">
          <p className="text-[0.8125rem] font-semibold text-ink">What can they open?</p>
          <p className="text-[0.75rem] text-ink-muted">Ticked sections only (plus the dashboard). Leave everything unticked for all sections.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ACCESS_PRESETS.map((p) => <button key={p.key} type="button" onClick={() => setPick(p.sections)} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[0.75rem] font-medium text-ink hover:bg-zinc-200">{p.label}</button>)}
            <button type="button" onClick={() => setPick([])} className="rounded-full px-2.5 py-1 text-[0.75rem] font-medium text-ink-muted ring-1 ring-line">Clear</button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{g}</p>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {SECTIONS.filter((s) => s.group === g).map((s) => (
                    <label key={s.key} className="flex items-center gap-2 text-[0.8125rem] text-ink">
                      <input type="checkbox" className="h-4 w-4" checked={pick.includes(s.key)} onChange={(e) => setPick(e.target.checked ? [...pick, s.key] : pick.filter((x) => x !== s.key))} />{s.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {err && <p className="mt-2 text-[0.75rem] text-rose-600">{err}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-[0.8125rem] text-ink-muted">Cancel</button>
            <button type="button" disabled={busy} onClick={() => save(pick.length ? pick : null)} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[0.8125rem] font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{pick.length ? `Save ${pick.length} section${pick.length === 1 ? "" : "s"}` : "Save — all sections"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
