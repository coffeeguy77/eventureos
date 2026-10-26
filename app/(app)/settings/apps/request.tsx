"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { requestApp } from "./actions";

export function RequestApp({ app, name }: { app: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="text-[0.8125rem] text-emerald-700">Thanks. We&apos;ll be in touch about adding {name}.</p>;
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Ask about adding {name}</Button>;
  return (
    <div className="space-y-2">
      <Textarea aria-label="Anything we should know" rows={2} value={note} maxLength={1500} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know? (optional)" />
      {err && <p className="text-[0.8125rem] text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await requestApp(app, note); if (r.ok) setDone(true); else setErr(r.error); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
