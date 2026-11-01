"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { saveEnquiryCta } from "@/app/(app)/settings/actions";

/** Settings → what the main button on an enquiry does. */
export function EnquiryCtaSetting({ cta, usesEvents, canTicket, canEdit }: { cta: "event" | "ticket" | null; usesEvents: boolean; canTicket: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ cta, usesEvents });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (next: { cta: "event" | "ticket" | null; usesEvents: boolean }) => {
    setV(next);
    start(async () => { const r = await saveEnquiryCta(next.cta, next.usesEvents); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); router.refresh(); });
  };
  const opt = (k: "event" | "ticket", label: string, hint: string, disabled: boolean, why: string) => (
    <label className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5 ring-1", v.cta === k ? "bg-canvas ring-brand-500" : "ring-line", disabled && "opacity-50")}>
      <input type="radio" name="cta" className="mt-1" checked={v.cta === k} disabled={disabled || !canEdit || pending} onChange={() => save({ ...v, cta: k })} />
      <span><span className="block text-[0.875rem] font-medium text-ink">{label}</span><span className="block text-[0.8125rem] text-ink-muted">{disabled ? why : hint}</span></span>
    </label>
  );
  return (
    <div className="space-y-3 border-t border-line px-5 py-4">
      <label className="flex items-center gap-2 text-[0.875rem] text-ink">
        <input type="checkbox" checked={v.usesEvents} disabled={!canEdit || pending} onChange={(e) => save({ cta: !e.target.checked && v.cta === "event" ? (canTicket ? "ticket" : null) : v.cta, usesEvents: e.target.checked })} />
        This business runs events / jobs
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {opt("event", "Convert to event", "Turns the enquiry into a job, ready for a quote.", !v.usesEvents, "Not available — this business doesn't run events.")}
        {opt("ticket", "Create a support ticket", "Opens a Nerd Herd ticket from the email — or adds it to an existing one.", !canTicket, "Not available — Nerd Herd isn't switched on for this business.")}
      </div>
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
