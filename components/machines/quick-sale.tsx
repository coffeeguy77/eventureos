"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { jobTotal, type JobItem, type MachineSettings } from "@/lib/machines/core";
import { quickSaleInvoice } from "@/app/(app)/machines/actions";
import { CustomerChooser, type Cust } from "./customer-chooser";
import { ItemsEditor, type PriceRow } from "./items-editor";

const money = (n: number) => `$${n.toFixed(2)}`;

/** Quick sale: client (existing or new) → items from the price list → draft invoice. */
export function QuickSale({ customers, priceList, settings }: { customers: Cust[]; priceList: PriceRow[]; settings: MachineSettings }) {
  const router = useRouter();
  const [cust, setCust] = useState<Cust | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const good = items.filter((i) => i.description && i.qty);
  const tot = useMemo(() => jobTotal({ kind: "sale", hours: 0, callout: false, items: good }, settings), [good, settings]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="1. Client" />
          <div className="border-t border-line px-5 py-4"><CustomerChooser customers={customers} value={cust?.id ?? null} onChange={setCust} /></div>
        </Card>
        <Card>
          <CardHeader title="2. What they're buying" subtitle="Tap items from your price list, or add a one-off line. Prices include GST." />
          <div className="border-t border-line px-5 py-4"><ItemsEditor items={items} onChange={setItems} priceList={priceList} first={settings.priceCategories} /></div>
        </Card>
      </div>
      <Card className="h-fit lg:sticky lg:top-4">
        <div className="space-y-3 px-5 py-4">
          <div><Label htmlFor="qs-ref">Reference (optional)</Label><Input id="qs-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. PO number" /></div>
          <div className="space-y-1 border-t border-line pt-3 text-[0.8125rem]">
            <div className="flex justify-between text-ink-muted"><span>Ex GST</span><span className="tabular-nums">{money(tot.exGst)}</span></div>
            <div className="flex justify-between text-ink-muted"><span>GST</span><span className="tabular-nums">{money(tot.gst)}</span></div>
            <div className="flex justify-between text-[1.0625rem] font-semibold text-ink"><span>Total</span><span className="tabular-nums">{money(tot.total)}</span></div>
          </div>
          <Button variant="primary" className="w-full" disabled={pending || !cust || !(tot.total > 0)} onClick={() => start(async () => {
            setErr(null);
            const r = await quickSaleInvoice({ customer_id: cust!.id, items: good, reference: ref });
            if (!r.ok) { setErr(r.error); return; }
            router.push(`/invoices/${r.data}`);
          })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}Create invoice</Button>
          <p className="text-[0.75rem] text-ink-muted">Opens as a draft so you can check it, then send it (and it goes to Xero on the next sync).</p>
          {err && <p className="text-[0.8125rem] text-rose-600">{err}</p>}
        </div>
      </Card>
    </div>
  );
}
