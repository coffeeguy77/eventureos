"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { decideIssue } from "@/app/(app)/accounts/actions";

const CHOICES = [
  { key: "investigating", label: "Investigate", tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  { key: "keep_chasing", label: "Keep chasing", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  { key: "write_off", label: "Write off", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
  { key: "resolved", label: "Resolved", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
] as const;

/** Decide a flagged invoice: investigate, keep chasing, write off (with a reason) or resolved. */
export function Decide({ id, current }: { id: string; current: string }) {
  const router = useRouter();
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    if (!pick) return;
    setErr(null);
    const r = await decideIssue(id, pick, note);
    if (!r.ok) { setErr(r.error); return; }
    setPick(null); setNote(""); router.refresh();
  });
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {CHOICES.filter((c) => c.key !== current).map((c) => (
          <button key={c.key} type="button" onClick={() => { setPick(c.key); setErr(null); }} aria-pressed={pick === c.key}
            className={`rounded-full px-3 py-1 text-[0.75rem] font-semibold ring-1 ring-inset ${c.tone} ${pick === c.key ? "outline outline-2 outline-offset-1 outline-brand-400" : ""}`}>{c.label}</button>
        ))}
      </div>
      {pick && (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note"
            placeholder={pick === "write_off" ? "Why it's being written off (kept on the account)" : pick === "investigating" ? "What needs checking, and who's doing it" : "Note (optional)"} />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={pending} onClick={go}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save decision</Button>
            <Button variant="ghost" size="sm" onClick={() => setPick(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-[0.75rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}
