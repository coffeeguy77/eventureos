"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { saveWageTarget } from "../actions";

export function WageTargetForm({ good, bad }: { good: number; bad: number }) {
  const router = useRouter();
  const [v, setV] = useState({ good, bad });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3 text-[0.8125rem]">
      <div><Label hint="%">Green up to</Label><Input type="number" className="w-24" min={1} max={100} value={v.good} onChange={(e) => setV({ ...v, good: Number(e.target.value) })} /></div>
      <div><Label hint="%">Red from</Label><Input type="number" className="w-24" min={2} max={100} value={v.bad} onChange={(e) => setV({ ...v, bad: Number(e.target.value) })} /></div>
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveWageTarget(v.good, v.bad); setMsg(r.ok ? "Saved." : r.error ?? "Not saved."); router.refresh(); })}>Save range</Button>
      <p className="text-[0.7188rem] text-ink-faint">Set the range you aim for — your accountant can tell you what suits the business.</p>
      {msg && <p className="w-full text-[0.75rem] text-ink-muted">{msg}</p>}
    </div>
  );
}
