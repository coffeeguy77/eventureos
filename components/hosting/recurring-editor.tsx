"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { advance, describeSchedule, dueDate, linesTotal, type Line } from "@/lib/recurring/core";
import { saveRecurring, type RecurringInput } from "@/app/(app)/hosting/recurring-actions";

const blank: Line = { description: "", quantity: 1, unit_amount: 0, tax_rate: 10, item_code: null, account_code: null, inc: true };
const money = (n: number) => `$${n.toFixed(2)}`;

export function RecurringEditor({ id, initial, clients, hosting, today }: { id: string | null; initial: RecurringInput & { customer_name?: string | null }; clients: { id: string; name: string }[]; hosting: { id: string; domain: string }[]; today: string }) {
  const router = useRouter();
  const [f, setF] = useState<RecurringInput>({ ...initial, line_items: initial.line_items?.length ? initial.line_items : [blank] });
  const [client, setClient] = useState(initial.customer_name ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<RecurringInput>) => setF((o) => ({ ...o, ...p }));
  const lines = f.line_items;
  const setLine = (k: number, p: Partial<Line>) => set({ line_items: lines.map((l, j) => (j === k ? { ...l, ...p } : l)) });
  const total = useMemo(() => linesTotal(lines.filter((l) => l.description)), [lines]);
  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.next_date)) return [];
    const out: { issue: string; due: string }[] = []; let d = f.next_date;
    for (let k = 0; k < 3; k++) { if (f.end_date && d > f.end_date) break; out.push({ issue: d, due: dueDate(d, f.due_type, f.due_days) }); d = advance(d, f.every, f.unit, f.unit === "month" ? Number(f.next_date.slice(8, 10)) : null); }
    return out;
  }, [f.next_date, f.every, f.unit, f.due_type, f.due_days, f.end_date]);
  const save = () => start(async () => {
    setMsg(null);
    const c = clients.find((x) => x.name.toLowerCase() === client.trim().toLowerCase());
    if (!c) { setMsg({ ok: false, text: "Choose the client from the list." }); return; }
    const r = await saveRecurring(id, { ...f, customer_id: c.id, line_items: lines.filter((l) => l.description.trim()) });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (!id) { router.push(`/hosting/recurring/${r.data}`); return; }
    setMsg({ ok: true, text: "Saved." }); router.refresh();
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="What's invoiced" />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="ri-c">Client</Label><Input id="ri-c" list="ri-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Start typing" /><datalist id="ri-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist></div>
              <div><Label htmlFor="ri-n">Name</Label><Input id="ri-n" value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Hosting — example.com.au" /></div>
              <div><Label htmlFor="ri-cat">Type</Label><Input id="ri-cat" list="ri-cats" value={f.category} maxLength={30} onChange={(e) => set({ category: e.target.value })} /><datalist id="ri-cats"><option value="hosting" /><option value="adwords" /><option value="domains" /><option value="other" /></datalist></div>
              <div><Label htmlFor="ri-ref" hint="hosting: HOSTING | domain">Invoice reference</Label><Input id="ri-ref" value={f.reference ?? ""} maxLength={255} onChange={(e) => set({ reference: e.target.value })} /></div>
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_64px_96px_70px_32px] gap-2 text-[0.7188rem] font-medium text-ink-muted sm:grid"><span>Line</span><span>Qty</span><span>Price inc GST</span><span>GST</span><span /></div>
            {lines.map((l, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_64px_96px_70px_32px] items-center gap-2">
                <Input aria-label="Description" value={l.description} onChange={(e) => setLine(k, { description: e.target.value })} />
                <Input aria-label="Quantity" type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLine(k, { quantity: Number(e.target.value) })} />
                <Input aria-label="Price including GST" type="number" step="0.01" value={l.unit_amount || ""} onChange={(e) => setLine(k, { unit_amount: Number(e.target.value) })} />
                <Select aria-label="GST" value={String(l.tax_rate)} onChange={(e) => setLine(k, { tax_rate: e.target.value === "0" ? 0 : 10 })}><option value="10">10%</option><option value="0">None</option></Select>
                <button type="button" aria-label="Remove line" onClick={() => set({ line_items: lines.length > 1 ? lines.filter((_, j) => j !== k) : [blank] })} className="grid h-9 place-items-center text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                {(l.item_code || l.account_code) && <p className="col-span-5 -mt-1 text-[0.6875rem] text-ink-faint">Xero {l.item_code ? `item ${l.item_code}` : ""}{l.item_code && l.account_code ? " · " : ""}{l.account_code ? `account ${l.account_code}` : ""}</p>}
              </div>
            ))}
            <div className="flex items-center justify-between"><button type="button" onClick={() => set({ line_items: [...lines, blank] })} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-4 w-4" />Add a line</button><p className="text-[0.9375rem] font-semibold tabular-nums">{money(total)} <span className="text-[0.75rem] font-normal text-ink-muted">inc GST</span></p></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Notes" />
          <div className="border-t border-line px-5 py-4"><Textarea aria-label="Notes" rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="When" subtitle={describeSchedule(f.every, f.unit)} />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="ri-e">Every</Label><Input id="ri-e" type="number" min={1} max={60} value={f.every} onChange={(e) => set({ every: Number(e.target.value) || 1 })} /></div>
              <div><Label htmlFor="ri-u">&nbsp;</Label><Select id="ri-u" value={f.unit} onChange={(e) => set({ unit: e.target.value === "week" ? "week" : "month" })}><option value="month">month(s)</option><option value="week">week(s)</option></Select></div>
            </div>
            <div><Label htmlFor="ri-nd">Next invoice date</Label><Input id="ri-nd" type="date" value={f.next_date} onChange={(e) => set({ next_date: e.target.value })} />{f.next_date && f.next_date < today && <p className="mt-1 text-[0.7188rem] text-amber-800">This date has passed — set today or later before switching it on.</p>}</div>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
              <div><Label htmlFor="ri-dd">Due</Label><Input id="ri-dd" type="number" min={0} value={f.due_days} onChange={(e) => set({ due_days: Number(e.target.value) })} /></div>
              <div><Label htmlFor="ri-dt">&nbsp;</Label><Select id="ri-dt" value={f.due_type} onChange={(e) => set({ due_type: e.target.value as RecurringInput["due_type"] })}><option value="days_after">days after the invoice date</option><option value="days_after_month_end">days after the end of the month</option><option value="day_of_month">day of the same month</option><option value="day_of_next_month">day of the next month</option></Select></div>
            </div>
            <div><Label htmlFor="ri-end" hint="optional">Stop after</Label><Input id="ri-end" type="date" value={f.end_date ?? ""} onChange={(e) => set({ end_date: e.target.value })} /></div>
            {preview.length > 0 && <ul className="rounded-lg bg-canvas px-3 py-2 text-[0.75rem] text-ink-muted">{preview.map((p) => <li key={p.issue}>{p.issue} · due {p.due}</li>)}</ul>}
          </div>
        </Card>
        <Card>
          <CardHeader title="How" />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div><Label htmlFor="ri-sm">Each invoice is</Label><Select id="ri-sm" value={f.send_mode} onChange={(e) => set({ send_mode: e.target.value as RecurringInput["send_mode"] })}>
              <option value="draft">A draft for you to check</option><option value="authorise">Approved (goes to Xero; not emailed)</option><option value="email">Approved and emailed with a pay link</option></Select></div>
            {hosting.length > 0 && <div><Label htmlFor="ri-h" hint="optional">Hosting account</Label><Select id="ri-h" value={f.hosting_account_id ?? ""} onChange={(e) => set({ hosting_account_id: e.target.value || null })}><option value="">—</option>{hosting.map((h) => <option key={h.id} value={h.id}>{h.domain}</option>)}</Select></div>}
            <div><Label htmlFor="ri-st">Status</Label><Select id="ri-st" value={f.status} onChange={(e) => set({ status: e.target.value as RecurringInput["status"] })}><option value="paused">Paused</option><option value="active">On — raise invoices</option><option value="ended">Ended</option></Select></div>
            <Button variant="primary" className="w-full" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{id ? "Save" : "Create"}</Button>
            {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
