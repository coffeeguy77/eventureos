"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { FormError, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { lineAmount, lineTotals, type InvLine } from "@/lib/invoices/lines";
import { saveInvoiceLines } from "@/app/(app)/invoices/actions";

export interface PriceItem { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; unit: string | null; code: string | null; account: string | null; category: string | null }

type Row = { key: string; description: string; quantity: string; unit_amount: string; tax_rate: 0 | 10; item_code: string | null; account_code: string | null; service_id: string | null };
const toRow = (l: InvLine, i: number): Row => ({ key: `r${i}-${Math.random().toString(36).slice(2, 7)}`, description: l.description, quantity: String(l.quantity), unit_amount: l.unit_amount.toFixed(2),
  tax_rate: l.tax_rate, item_code: l.item_code ?? null, account_code: l.account_code ?? null, service_id: l.service_id ?? null });
const num = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

/**
 * The invoice's lines, and "Edit invoice": change quantities, prices or wording, take lines off, add items from the
 * price list or a one-off line. Prices are GST inclusive. In Xero too, if it's been sent there.
 */
export function InvoiceLinesEditor({ invoiceId, lines, currency, canEdit, subtitle, xero, paid, priceList }: {
  invoiceId: string; lines: InvLine[]; currency: string; canEdit: boolean; subtitle?: string; xero: boolean; paid: number; priceList: PriceItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => lines.map(toRow));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");

  const asLines = rows.map((r) => ({ quantity: num(r.quantity), unit_amount: num(r.unit_amount), tax_rate: r.tax_rate }));
  const totals = lineTotals(editing ? asLines : lines);
  const groups = useMemo(() => {
    const m = new Map<string, PriceItem[]>();
    for (const p of priceList) m.set(p.category || "Other", [...(m.get(p.category || "Other") ?? []), p]);
    return [...m.entries()];
  }, [priceList]);

  const set = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addFromList = (id: string) => {
    const p = priceList.find((x) => x.id === id);
    if (!p) return;
    const inc = Math.round(Number(p.unit_price) * (1 + Number(p.tax_rate) / 100) * 100) / 100;
    setRows((all) => [...all, { key: `n${Date.now()}`, description: [p.name, p.description?.trim()].filter(Boolean).join("\n"), quantity: "1", unit_amount: inc.toFixed(2),
      tax_rate: Number(p.tax_rate) > 0 ? 10 : 0, item_code: p.code, account_code: p.account, service_id: p.id }]);
    setPick("");
  };
  const cancel = () => { setRows(lines.map(toRow)); setErr(null); setEditing(false); };
  const save = () => start(async () => {
    setErr(null); setOk(null);
    const r = await saveInvoiceLines(invoiceId, rows.map((x) => ({ description: x.description, quantity: num(x.quantity), unit_amount: num(x.unit_amount), tax_rate: x.tax_rate,
      item_code: x.item_code, account_code: x.account_code, service_id: x.service_id })))
      .catch((): { error?: string; ok?: string } => ({ error: "Couldn't reach the server — try again." }));
    if (r?.error) { setErr(r.error); return; }
    setOk(r?.ok ?? "Saved."); setEditing(false); router.refresh();
  });

  return (
    <>
      <CardHeader title="Invoice lines" subtitle={subtitle ?? "Prices include GST"}
        action={canEdit && !editing ? (
          <button type="button" onClick={() => { setRows(lines.map(toRow)); setOk(null); setEditing(true); }}
            className="inline-flex h-10 items-center gap-1 text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700 sm:h-auto">
            <Pencil className="h-3.5 w-3.5" />Edit invoice
          </button>
        ) : undefined} />
      {!editing ? (
        <div className="px-5 pb-5">
          <ul className="divide-y divide-line">
            {lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[0.8125rem]">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{l.description.split("\n")[0]}</span>
                  {l.description.includes("\n") && <span className="block whitespace-pre-line text-[0.75rem] text-ink-muted">{l.description.split("\n").slice(1).join("\n")}</span>}
                  <span className="text-[0.75rem] text-ink-faint">{Number(l.quantity)} × {money(l.unit_amount, currency, { cents: true })}{l.tax_rate === 0 ? " · no GST" : ""}</span>
                </span>
                <span className="tabular shrink-0 text-ink">{money(lineAmount(l), currency, { cents: true })}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-[0.8125rem]">
            <div className="flex justify-between"><dt className="text-ink-muted">GST included</dt><dd className="tabular text-ink-muted">{money(totals.tax, currency, { cents: true })}</dd></div>
            <div className="flex justify-between font-semibold"><dt className="text-ink">Total</dt><dd className="tabular text-ink">{money(totals.total, currency, { cents: true })}</dd></div>
          </dl>
          {ok && <p className="mt-2 text-[0.75rem] text-emerald-700">{ok}</p>}
        </div>
      ) : (
        <div className="px-3 pb-5 sm:px-5">
          <p className="mb-3 text-[0.75rem] text-ink-muted">
            Prices include GST.{xero ? " Saving changes it in Xero too — Xero won't allow it once a payment is on the invoice." : ""}{paid > 0 ? ` ${money(paid, currency, { cents: true })} is already paid, so the total can't go below that.` : ""}
          </p>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="rounded-xl border border-line p-3">
                <Textarea aria-label="Description" rows={Math.min(5, Math.max(1, r.description.split("\n").length))} value={r.description}
                  onChange={(e) => set(r.key, { description: e.target.value })} placeholder="What it's for" />
                <div className="mt-2 grid grid-cols-[1fr_1.4fr_auto] items-end gap-2 sm:grid-cols-[6rem_8rem_7rem_1fr_auto]">
                  <label className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint">Qty
                    <Input inputMode="decimal" value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })} className="mt-1 h-10 sm:h-9" />
                  </label>
                  <label className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint">Price inc GST
                    <Input inputMode="decimal" value={r.unit_amount} onChange={(e) => set(r.key, { unit_amount: e.target.value })} className="mt-1 h-10 sm:h-9" />
                  </label>
                  <label className="col-span-3 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint sm:col-span-1">GST
                    <Select value={String(r.tax_rate)} onChange={(e) => set(r.key, { tax_rate: e.target.value === "0" ? 0 : 10 })} className="mt-1 h-10 sm:h-9">
                      <option value="10">10%</option><option value="0">No GST</option>
                    </Select>
                  </label>
                  <span className="col-span-2 self-center text-right text-[0.8125rem] font-medium tabular text-ink sm:col-span-1">{money(lineAmount({ quantity: num(r.quantity), unit_amount: num(r.unit_amount) }), currency, { cents: true })}</span>
                  <button type="button" aria-label="Remove this line" onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-600 sm:h-9 sm:w-9">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {priceList.length > 0 && (
              <Select aria-label="Add from the price list" value={pick} onChange={(e) => addFromList(e.target.value)} className="h-10 max-w-full flex-1 sm:h-9 sm:max-w-xs">
                <option value="">Add from the price list…</option>
                {groups.map(([g, items]) => (
                  <optgroup key={g} label={g}>
                    {items.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(Number(p.unit_price) * (1 + Number(p.tax_rate) / 100), currency, { cents: true })}{p.unit ? ` / ${p.unit}` : ""}</option>)}
                  </optgroup>
                ))}
              </Select>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-8"
              onClick={() => setRows((all) => [...all, { key: `n${Date.now()}`, description: "", quantity: "1", unit_amount: "0.00", tax_rate: 10, item_code: null, account_code: null, service_id: null }])}>
              <Plus className="h-3.5 w-3.5" />One-off line
            </Button>
          </div>
          <div className={cn("mt-4 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-[0.875rem] font-semibold", totals.total + 0.001 < paid && "text-rose-700")}>
            <span>New total <span className="font-normal text-ink-muted">· GST {money(totals.tax, currency, { cents: true })}</span></span>
            <span className="tabular">{money(totals.total, currency, { cents: true })}</span>
          </div>
          <FormError message={err} />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={cancel} disabled={pending}>Cancel</Button>
            <Button type="button" size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={save} disabled={pending || !rows.length}>
              {pending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : "Save invoice"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
