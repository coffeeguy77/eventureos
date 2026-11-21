"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { conversionsAction, saveConversionGoals } from "@/app/(app)/marketing/actions";
import type { ConversionRow } from "@/lib/marketing/conversions";

/** Which Google Ads conversion actions count (primary) — what the bidding aims for and the Conversions column shows. */
export function ConversionGoals({ id }: { id: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  const [want, setWant] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const load = () => conversionsAction(id).then((r) => { if (!r.ok) setErr(r.error); else { setRows(r.data); setWant(Object.fromEntries(r.data.map((x) => [x.resource, x.primary]))); } });
  useEffect(() => { if (open && !rows) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = rows?.some((r) => want[r.resource] !== r.primary) ?? false;
  const nPrimary = rows ? Object.values(want).filter(Boolean).length : 0;

  if (!open) return <div className="px-5 pb-5"><Button type="button" size="sm" className="h-10 sm:h-8" onClick={() => setOpen(true)}>Show conversion actions</Button></div>;
  return (
    <div className="pb-4">
      {err && <p className="px-5 pb-2 text-[0.8125rem] text-rose-700">{err}</p>}
      {!rows && !err && <p className="px-5 pb-3 text-[0.8125rem] text-ink-muted">Reading Google Ads…</p>}
      {rows && (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {rows.map((r) => (
              <li key={r.resource} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[0.8125rem]">
                <label className="flex min-w-0 flex-1 basis-60 cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={!!want[r.resource]} onChange={(e) => { setWant((w) => ({ ...w, [r.resource]: e.target.checked })); setMsg(null); }} />
                  <span className="min-w-0">
                    <span className="block text-ink">{r.name}</span>
                    <span className="block text-[0.7188rem] text-ink-faint">{[r.category.toLowerCase().replace(/_/g, " "), r.type.toLowerCase().replace(/_/g, " "), r.status === "HIDDEN" ? "hidden" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
                <span className="w-32 text-right text-[0.75rem] tabular-nums text-ink-muted">{r.all30} in 30 days</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 pt-3">
            <span className="text-[0.75rem] text-ink-muted">{nPrimary} counting{nPrimary > 4 ? " — usually 2–4 is right" : ""}</span>
            {msg && <span className="text-[0.75rem] text-ink-muted">{msg}</span>}
            <Button type="button" variant="primary" size="sm" className="h-10 sm:h-8" disabled={!dirty || pending} onClick={() => start(async () => {
              setErr(null);
              const r = await saveConversionGoals(id, want);
              if (!r.ok) setErr(r.error); else { setMsg(r.data); setRows(null); await load(); router.refresh(); }
            })}>{pending ? "Saving in Google Ads…" : "Save which ones count"}</Button>
          </div>
        </>
      )}
    </div>
  );
}
