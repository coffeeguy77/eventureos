"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, X } from "lucide-react";
import { removeCustomerPrice, saveCustomerPrice } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface CustomerPriceRow { id: string; service_id: string; kind: "percent" | "price"; value: number; note: string | null }
interface Svc { id: string; name: string; category: string | null; unit: string | null; unit_price: number }

/** Special terms for a repeat client on chosen items — applied to every new quote line for them. */
export function CustomerPricingCard({ customerId, rows, services, currency, canEdit, ready }: {
  customerId: string; rows: CustomerPriceRow[]; services: Svc[]; currency: string; canEdit: boolean; ready: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [svc, setSvc] = useState("");
  const [kind, setKind] = useState<"percent" | "price">("percent");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const byId = new Map(services.map((s) => [s.id, s]));
  const available = services.filter((s) => !rows.some((r) => r.service_id === s.id));
  const groups = [...available.reduce((m, s) => m.set(s.category || "Other", [...(m.get(s.category || "Other") ?? []), s]), new Map<string, Svc[]>())];
  const chosen = byId.get(svc);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    after?.(); router.refresh();
  });

  if (!ready) return <p className="px-5 pb-5 text-[0.7812rem] text-ink-muted">Customer pricing needs a quick database update before it can be used.</p>;
  return (
    <div className="px-5 pb-5">
      {rows.length === 0
        ? <p className="text-[0.7812rem] text-ink-muted">Normal prices. Add special terms on items like coffees or barista hours — they apply automatically to new quote lines for this client.</p>
        : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const s = byId.get(r.service_id);
              return (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <BadgePercent className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{s?.name ?? "Removed item"}</p>
                    <p className="text-[0.75rem] text-emerald-700">
                      {r.kind === "percent" ? `${r.value}% off` : `${money(r.value, currency)}${s?.unit ? ` / ${s.unit}` : ""}`}
                      {s ? <span className="text-ink-faint"> · usually {money(s.unit_price, currency)}</span> : null}
                      {r.note ? <span className="text-ink-faint"> · “{r.note}”</span> : null}
                    </p>
                  </div>
                  {canEdit && <button type="button" onClick={() => run(() => removeCustomerPrice(customerId, r.id))} disabled={pending} aria-label={`Remove special pricing on ${s?.name ?? "item"}`}
                    className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>}
                </li>
              );
            })}
          </ul>
        )}
      {canEdit && available.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line">
          <select value={svc} onChange={(e) => setSvc(e.target.value)} className={cn(inputClass, "py-1.5")} aria-label="Item">
            <option value="">Choose an item…</option>
            {groups.map(([cat, list]) => <optgroup key={cat} label={cat}>{list.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.unit_price, currency)}{s.unit ? ` / ${s.unit}` : ""}</option>)}</optgroup>)}
          </select>
          {svc && (<>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Kind of discount" className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium">
                {([["percent", "% off"], ["price", "Special price"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                    className={cn("h-8 rounded-md px-3", kind === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{l}</button>
                ))}
              </div>
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-faint">{kind === "price" ? "$" : "%"}</span>
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label={kind === "price" ? "Their price (ex GST)" : "Percent off"}
                  className={cn(inputClass, "py-1.5 pl-6 text-right")} placeholder={kind === "price" ? (chosen ? String(chosen.unit_price) : "") : "10"} />
              </div>
              {kind === "price" && chosen && Number(value) > 0 && Number(value) < chosen.unit_price && (
                <span className="text-[0.75rem] text-emerald-700">saves {money(chosen.unit_price - Number(value), currency)} each</span>
              )}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={kind === "price" ? "Shown on the line, e.g. Loyal customer price" : "Optional note"}
              className={cn(inputClass, "py-1.5")} aria-label="Note shown on the quote line" />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" disabled={pending || !value.trim()}
                onClick={() => run(() => saveCustomerPrice(customerId, { serviceId: svc, kind, value: Number(value), note: note || null }), () => { setSvc(""); setValue(""); setNote(""); })}>
                {pending ? "Saving…" : "Add special pricing"}
              </Button>
            </div>
          </>)}
        </div>
      )}
      {error && <div className="mt-2"><FormError message={error} /></div>}
      {rows.length > 0 && <p className="mt-3 text-[0.7188rem] text-ink-faint">Applied to new quote lines at the normal price. Lines you&apos;ve priced by hand are left alone.</p>}
    </div>
  );
}
