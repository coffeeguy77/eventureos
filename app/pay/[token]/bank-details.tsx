"use client";

import { useState } from "react";
import { Check, Copy, Landmark } from "lucide-react";

/** Direct deposit details on the pay page, each with a copy button (handy on a phone's banking app). */
export function BankDetails({ bank, reference, amount, alsoCard }: { bank: { name: string; bsb: string; account: string }; reference: string; amount: string; alsoCard: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string, v: string) => {
    try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* no clipboard */ }
  };
  const rows: [string, string, string][] = [["name", "Account name", bank.name], ["bsb", "BSB", bank.bsb], ["account", "Account number", bank.account], ["ref", "Reference", reference], ["amount", "Amount", amount]];
  return (
    <div className={alsoCard ? "mt-5 border-t border-line pt-5" : ""}>
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><Landmark className="h-4 w-4 text-ink-muted" />{alsoCard ? "Or pay by direct deposit" : "Pay by direct deposit"}</p>
      <dl className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface text-[0.875rem]">
        {rows.map(([k, label, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium tabular-nums text-ink">{v}</span>
              <button type="button" onClick={() => copy(k, k === "amount" ? v.replace(/[^0-9.]/g, "") : k === "bsb" ? v.replace(/\D/g, "") : v)} aria-label={`Copy ${label.toLowerCase()}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-canvas hover:text-ink">
                {copied === k ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[0.75rem] text-ink-muted">Please use <b className="font-semibold text-ink">{reference}</b> as the reference so we can match your payment.</p>
    </div>
  );
}
