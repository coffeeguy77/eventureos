"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { payStatement, statementViewed } from "./actions";

type Row = { id: string; number: string; due: string; overdue: boolean; balance: number; href: string | null };

export function StatementBeacon({ token }: { token: string }) {
  useEffect(() => {
    let done = false;
    const fire = () => { if (done || document.visibilityState !== "visible") return; done = true; void statementViewed(token); };
    const t = setTimeout(fire, 1500);
    return () => clearTimeout(t);
  }, [token]);
  return null;
}

/** Every invoice owing, all ticked: untick any they can't pay today, then pay the rest by card. */
export function StatementPay({ token, rows, currency, canPay, brand }: { token: string; rows: Row[]; currency: string; canPay: boolean; brand: string }) {
  const [pick, setPick] = useState<string[]>(rows.map((r) => r.id));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const total = rows.filter((r) => pick.includes(r.id)).reduce((a, r) => a + r.balance, 0);
  const all = pick.length === rows.length;
  return (
    <div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            {canPay && <input type="checkbox" aria-label={`Pay invoice ${r.number}`} className="h-5 w-5 shrink-0" checked={pick.includes(r.id)} onChange={() => setPick((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />}
            <div className="min-w-0 flex-1">
              {r.href ? <a href={r.href} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">Invoice {r.number}<ExternalLink className="h-3.5 w-3.5 text-ink-faint" /></a> : <p className="font-semibold text-ink">Invoice {r.number}</p>}
              <p className={`text-[0.8125rem] ${r.overdue ? "font-medium text-rose-700" : "text-ink-muted"}`}>{r.due}</p>
            </div>
            <p className="font-semibold tabular-nums">{fmt(r.balance)}</p>
          </li>
        ))}
      </ul>
      {canPay && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center justify-between text-[0.9375rem]">
            <button type="button" onClick={() => setPick(all ? [] : rows.map((r) => r.id))} className="text-[0.8125rem] font-medium text-ink-muted underline hover:text-ink">{all ? "Untick all" : "Tick all"}</button>
            <span className="font-semibold">{all ? "Total owing" : `Paying ${pick.length} of ${rows.length}`}: <span className="tabular-nums">{fmt(total)}</span></span>
          </div>
          <button type="button" disabled={pending || !pick.length} onClick={() => start(async () => { setErr(null); const r = await payStatement(token, pick); if (r?.error) setErr(r.error); })}
            style={{ background: brand }} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[1rem] font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}Pay {fmt(total)} now
          </button>
          <p className="mt-2 text-center text-[0.75rem] text-ink-faint">Can&apos;t pay it all today? Untick the invoices to leave for later. Secure card payment by Stripe.</p>
          {err && <p role="alert" className="mt-2 text-center text-[0.8125rem] font-medium text-rose-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
