"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { StreamsData } from "@/lib/revenue/load";

const num = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 2 });

/** Revenue (ex GST) and units sold per revenue stream, for a chosen period. */
export function RevenueStreams({ data, currency }: { data: StreamsData; currency: string }) {
  const [key, setKey] = useState(data.periods[0]?.key ?? "all");
  const period = data.periods.find((p) => p.key === key) ?? data.periods[0];
  const rows = period?.rows ?? [];
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const top = Math.max(1, ...rows.map((r) => r.amount));
  const name = (code: string) => data.names[code] ?? `Account ${code}`;

  return (
    <Card>
      <CardHeader title="Revenue by stream" subtitle={`${money(total, currency)} ex GST · ${period?.label ?? ""}`}
        action={<Link href="/settings/integrations/xero/recode" className="text-[0.7188rem] text-ink-faint hover:text-ink">Choose items</Link>} />
      <div className="px-5 pb-5">
        <div role="tablist" aria-label="Period" className="mb-3 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium sm:inline-flex">
          {data.periods.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={p.key === key} onClick={() => setKey(p.key)}
              className={cn("rounded-md px-2.5 py-1.5", p.key === key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{p.label}</button>
          ))}
        </div>
        {rows.length === 0 ? <p className="py-4 text-[0.8125rem] text-ink-muted">No invoices in this period.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.account} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-[0.8125rem] font-medium text-ink" title={`${r.account} – ${name(r.account)}`}>{name(r.account)}</p>
                  <p className="tabular shrink-0 text-[0.8438rem] font-semibold text-ink">{money(r.amount, currency)}</p>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(1, (r.amount / top) * 100)}%` }} />
                </div>
                <p className="tabular mt-1 text-[0.7188rem] text-ink-faint">{num(r.units)} units · {r.invoices} invoice{r.invoices === 1 ? "" : "s"} · account {r.account}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">
          From your Xero invoices (not drafts or voided), ex GST. Each item counts towards the account chosen in Recode by item, even before Xero has been updated.
          {data.lastSync ? ` Last synced ${new Date(data.lastSync).toLocaleDateString("en-AU")}.` : ""}
        </p>
      </div>
    </Card>
  );
}
