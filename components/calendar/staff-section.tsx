"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Users, X } from "lucide-react";
import { addEntryStaff, loadEntryStaff, removeEntryStaff, type EntryStaff } from "@/app/(app)/calendar/staff-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  offered: { label: "Waiting to accept", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  interested: { label: "Hand up", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  shift: { label: "On shift", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

/** Who's working this — add or remove staff right from the calendar. `refKey` is a calendar entry id or `job:<eventId>`. */
export function StaffSection({ refKey }: { refKey: string }) {
  const router = useRouter();
  const [data, setData] = useState<EntryStaff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await loadEntryStaff(refKey).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (r.ok) { setData(r.data); setErr(null); } else setErr(r.error);
  }, [refKey]);
  useEffect(() => { setData(null); setMsg(null); void load(); }, [load]);

  const add = () => pick && start(async () => {
    setErr(null); setMsg(null);
    const r = await addEntryStaff(refKey, pick).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    setMsg(r.data); setPick(""); await load(); router.refresh();
  });
  const remove = (key: string) => start(async () => {
    setErr(null); setMsg(null);
    const r = await removeEntryStaff(key).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    await load(); router.refresh();
  });

  if (!data) return (
    <div className="rounded-lg border border-line p-3 text-[0.8125rem] text-ink-muted">
      {err ? <span className="text-rose-700">{err}</span> : <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading staff…</span>}
    </div>
  );
  if (data.kind === "none") return data.note ? <p className="rounded-lg border border-line p-3 text-[0.78rem] text-ink-muted">{data.note}</p> : null;

  const onIt = new Set(data.people.filter((p) => p.status !== "interested").map((p) => p.crewId));
  const choices = data.options.filter((o) => !onIt.has(o.id));
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="flex items-center gap-1.5 text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint"><Users className="h-3.5 w-3.5" />Staff</p>
      {data.people.length === 0 ? <p className="mt-1.5 text-[0.8125rem] text-amber-700">Nobody on this yet.</p> : (
        <ul className="mt-1.5 space-y-1">
          {data.people.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-[0.8125rem]">
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset", p.paid ? "bg-zinc-100 text-ink-muted ring-line" : STATUS[p.status]?.cls)}>{p.paid ? "Paid" : STATUS[p.status]?.label}</span>
              {!p.paid && <button type="button" disabled={pending} onClick={() => remove(p.key)} aria-label={`Take ${p.name} off`} className="shrink-0 rounded p-1 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
      {choices.length > 0 ? (
        <div className="mt-2.5 flex gap-2">
          <Select aria-label="Add staff" value={pick} onChange={(e) => setPick(e.target.value)} className="h-10 min-w-0 flex-1 py-0 text-[0.8125rem] sm:h-9">
            <option value="">Add staff…</option>
            {choices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Button size="sm" variant="primary" className="h-10 shrink-0 sm:h-9" disabled={!pick || pending} onClick={add}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Add
          </Button>
        </div>
      ) : data.options.length === 0 ? <p className="mt-2 text-[0.75rem] text-ink-muted">Add staff in Settings → Team first.</p> : null}
      <p className="mt-1.5 text-[0.7rem] text-ink-faint">
        {data.past ? "Already happened — adding someone records that they worked it, so their hours go to Wages."
          : data.kind === "job" ? "They get the shift in the staff app to accept, and an invite in their calendar."
            : "Becomes a shift for them — in the staff app and their calendar."}
      </p>
      {msg && <p className="mt-1.5 text-[0.75rem] text-emerald-700">{msg}</p>}
      {err && <p className="mt-1.5 text-[0.75rem] text-rose-700">{err}</p>}
    </div>
  );
}
