"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPlanOptions } from "@/app/(app)/nerd-herd/actions";

/** Per-plan switches: open a maintenance job each time, wait for payment first, and which website it's for. */
export function PlanOptions({ id, createsTicket, workAfterPayment, websiteId, sites }: {
  id: string; createsTicket: boolean; workAfterPayment: boolean; websiteId: string | null; sites: { id: string; domain: string }[];
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (o: Parameters<typeof setPlanOptions>[1]) => start(async () => {
    setErr(null);
    const r = await setPlanOptions(id, o);
    if (!r.ok) setErr(r.error); else router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-3 text-[0.75rem]">
      <select aria-label="Website" className="h-8 max-w-[11rem] rounded-lg border border-line bg-surface px-2 text-[0.75rem]" defaultValue={websiteId ?? ""} disabled={pending} onChange={(e) => save({ website_id: e.target.value || null })}>
        <option value="">No website</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" className="h-4 w-4" defaultChecked={createsTicket} disabled={pending} onChange={(e) => save({ creates_ticket: e.target.checked })} />Opens a maintenance job</label>
      {createsTicket && <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" className="h-4 w-4" defaultChecked={workAfterPayment} disabled={pending} onChange={(e) => save({ work_after_payment: e.target.checked })} />Work after payment</label>}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
      {err && <span className="text-rose-700">{err}</span>}
    </div>
  );
}
