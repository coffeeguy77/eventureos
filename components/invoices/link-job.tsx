"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { linkInvoiceToJob } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

/** One-tap "Link to this job" for an unlinked invoice (on the job's Invoices tab). */
export function LinkInvoiceButton({ invoiceId, eventId }: { invoiceId: string; eventId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" disabled={pending} onClick={() => start(async () => {
        const r = await linkInvoiceToJob(invoiceId, eventId).catch(() => ({ error: "Couldn't reach the server." }));
        if (r?.error) setErr(r.error); else router.refresh();
      })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Link to this job</Button>
      {err && <span className="text-[0.72rem] text-rose-700">{err}</span>}
    </span>
  );
}

/** Choose which of the client's jobs an invoice is for (on the invoice page). */
export function InvoiceJobPicker({ invoiceId, current, jobs }: { invoiceId: string; current: string | null; jobs: { id: string; label: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="px-5 pb-5">
      <label className="mb-1 block text-[0.75rem] font-medium text-ink">Job this invoice is for</label>
      <Select value={current ?? ""} disabled={pending} className="h-10 w-full py-0 text-[0.8125rem] sm:h-9"
        onChange={(e) => start(async () => {
          setMsg(null);
          const r: { error?: string; ok?: string } | undefined = await linkInvoiceToJob(invoiceId, e.target.value || null).catch(() => ({ error: "Couldn't reach the server." }));
          setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.ok ?? "Saved." });
          router.refresh();
        })}>
        <option value="">Not linked to a job</option>
        {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
      </Select>
      {msg && <p className={msg.ok ? "mt-1.5 text-[0.75rem] text-emerald-700" : "mt-1.5 text-[0.75rem] text-rose-700"}>{msg.text}</p>}
    </div>
  );
}
