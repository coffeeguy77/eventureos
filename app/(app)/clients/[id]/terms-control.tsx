"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { setCustomerTerms } from "./actions";

/** "Payment terms: Business default (7 days) / Due on receipt / 7 / 14 / 21 / 30 days / other" for one client. */
export function PaymentTermsControl({ customerId, days, orgDefault, canEdit }: { customerId: string; days: number | null; orgDefault: number; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(days == null ? "" : String(days));
  const [err, setErr] = useState<string | null>(null);
  const presets = [0, 7, 14, 21, 30];
  const custom = val !== "" && !presets.includes(Number(val));
  const save = (v: string) => start(async () => {
    setErr(null); setVal(v);
    const r = await setCustomerTerms(customerId, v === "" ? null : Number(v)).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) setErr(r.error); else router.refresh();
  });
  const label = (d: number) => (d === 0 ? "Due on receipt" : `${d} days`);
  return (
    <div className="px-5 pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Payment terms" disabled={!canEdit || pending} value={custom ? "other" : val} onChange={(e) => e.target.value === "other" ? setVal(String(orgDefault || 45)) : save(e.target.value)} className={cn(inputClass, "h-10 w-auto sm:h-9")}>
          <option value="">Business default ({label(orgDefault)})</option>
          {presets.map((d) => <option key={d} value={d}>{label(d)}</option>)}
          <option value="other">Other…</option>
        </select>
        {custom && (
          <>
            <input type="number" min={0} max={120} value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => save(val)} aria-label="Days" className={cn(inputClass, "h-10 w-20 sm:h-9")} />
            <span className="text-[0.8125rem] text-ink-muted">days</span>
          </>
        )}
      </div>
      <p className="mt-1.5 text-[0.75rem] text-ink-muted">Used for the invoice raised when they accept a quote{val !== "" ? "" : " — change it for clients who pay on their own terms (schools, government)"}.</p>
      {err && <p className="mt-1 text-[0.75rem] text-rose-700">{err}</p>}
    </div>
  );
}
