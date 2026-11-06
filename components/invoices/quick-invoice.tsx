"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { addDaysISO, fmtDate, money } from "@/lib/format";
import { lineTotals, type InvLine } from "@/lib/invoices/lines";
import { priceOrder, readRates } from "@/lib/club/core";
import { clubRatesFor, createJobInvoice, pastInvoices, type PastInvoice } from "@/app/(app)/invoices/quick/actions";

interface Svc { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; code: string | null; xero_account_code: string | null; category: string | null }
type Row = { key: string; description: string; quantity: string; unit: string; gst: boolean; item_code: string | null; account_code: string | null; service_id: string | null };
const num = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const key = () => `r${Math.random().toString(36).slice(2, 9)}`;
const fromLine = (l: InvLine): Row => ({ key: key(), description: l.description, quantity: String(l.quantity), unit: l.unit_amount.toFixed(2), gst: l.tax_rate === 10, item_code: l.item_code ?? null, account_code: l.account_code ?? null, service_id: l.service_id ?? null });

export function QuickInvoice({ entryId, eventId, customers, priceList, initial, existing, today, terms, currency }: {
  entryId: string | null; eventId: string | null; customers: { id: string; name: string; terms: number | null }[]; priceList: Svc[];
  initial: { customer: string; name: string; date: string; venue: string }; existing: { id: string; number: string; total: number }[]; today: string; terms: number; currency: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initial.customer);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.date);
  const [venue, setVenue] = useState(initial.venue);
  const [rows, setRows] = useState<Row[]>([]);
  const [issue, setIssue] = useState(today);
  const custTerms = (id: string) => customers.find((c) => c.id === id)?.terms ?? terms;
  const [due, setDue] = useState(addDaysISO(today, custTerms(initial.customer)));
  const [reference, setReference] = useState("");
  const [past, setPast] = useState<PastInvoice[] | null>(null);
  const [club, setClub] = useState<{ rates: Record<string, number>; offers: string[]; codes: Record<string, string> } | null>(null);
  const [cb, setCb] = useState({ carts: 1, baristas: 0, start: "", finish: "", coffees: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    setPast(null); setClub(null);
    if (!customerId) return;
    let live = true;
    void pastInvoices(customerId).then((r) => { if (live) setPast(r.ok ? r.data : []); });
    void clubRatesFor(customerId).then((r) => { if (live && r.ok) setClub(r.data); });
    return () => { live = false; };
  }, [customerId]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? customers.filter((c) => c.name.toLowerCase().includes(f)) : customers;
    const cur = customers.find((c) => c.id === customerId);
    return cur && !list.includes(cur) ? [cur, ...list.slice(0, 199)] : list.slice(0, 200);
  }, [customers, filter, customerId]);

  const lines = rows.map((r) => ({ quantity: num(r.quantity), unit_amount: num(r.unit), tax_rate: (r.gst ? 10 : 0) as 0 | 10 }));
  const totals = lineTotals(lines);
  const set = (k: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const chooseCustomer = (id: string) => { setCustomerId(id); setDue(addDaysISO(issue, custTerms(id))); };

  const copy = (p: PastInvoice) => setRows(p.lines.map(fromLine));
  const addSvc = (id: string) => {
    const p = priceList.find((x) => x.id === id);
    if (!p) return;
    const inc = Math.round(Number(p.unit_price) * (1 + Number(p.tax_rate) / 100) * 100) / 100;
    setRows((all) => [...all, { key: key(), description: [p.name, p.description?.trim()].filter(Boolean).join("\n"), quantity: "1", unit: inc.toFixed(2), gst: Number(p.tax_rate) > 0, item_code: p.code, account_code: p.xero_account_code, service_id: p.id }]);
  };
  const fromClub = () => {
    if (!club) return;
    const r = readRates(club.rates);
    const p = priceOrder({ days: [{ date, start: cb.start || null, finish: cb.finish || null }], carts: club.offers.includes("cart") ? cb.carts : 0, van: 0, baristas: club.offers.includes("baristas") ? cb.baristas : 0, coffees: club.offers.includes("coffees") ? cb.coffees : 0 }, r);
    setRows(p.lines.map((l) => ({ key: key(), description: `${l.label}\n${l.note}`, quantity: String(l.qty), unit: (Math.round(l.unit * 1.1 * 100) / 100).toFixed(2), gst: true, item_code: club.codes[l.key] || null, account_code: null, service_id: null })));
  };

  const submit = (send: boolean) => start(async () => {
    setErr(null);
    const r = await createJobInvoice({
      entryId, eventId, customerId, jobName: name, date, venue, issueDate: issue, dueDate: due, reference, send,
      lines: rows.map((x) => ({ description: x.description, quantity: num(x.quantity), unit_amount: num(x.unit), tax_rate: x.gst ? 10 : 0, item_code: x.item_code, account_code: x.account_code, service_id: x.service_id })),
    });
    if (r.ok) router.push(`/invoices/${r.data.id}`); else setErr(r.error);
  });

  const groups = useMemo(() => { const m = new Map<string, Svc[]>(); for (const p of priceList) m.set(p.category || "Other", [...(m.get(p.category || "Other") ?? []), p]); return [...m.entries()]; }, [priceList]);

  return (
    <div className="space-y-5">
      {existing.length > 0 && (
        <Card className="p-4 text-[0.8125rem] text-ink">
          This job already has {existing.length === 1 ? "an invoice" : "invoices"}: {existing.map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link href={`/invoices/${x.id}`} className="font-medium text-brand-700 hover:underline">{x.number}</Link> ({money(x.total, currency)})</span>)}. You can still raise another (e.g. extras).
        </Card>
      )}

      <Card>
        <CardHeader title="The job" />
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <Label>Customer</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search…" />
              <Select value={customerId} onChange={(e) => chooseCustomer(e.target.value)}>
                <option value="">Choose the customer…</option>
                {shown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </div>
          <div><Label>Job</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast event" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label hint="optional">Venue</Label><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
          </div>
        </div>
      </Card>

      {customerId && (
        <Card>
          <CardHeader title="Start from" subtitle="Pick one, then change anything below" />
          <div className="space-y-4 border-t border-line p-4 sm:p-5">
            <div>
              <Label>Same as a past invoice</Label>
              {past === null ? <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading their invoices…</p>
                : !past.length ? <p className="text-[0.8125rem] text-ink-muted">No past invoices for this customer.</p>
                : (
                  <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                    {past.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[0.8125rem]">
                        <div className="min-w-0 flex-1"><p className="font-medium text-ink">{p.number} · {fmtDate(p.date)} · {money(p.total, currency)}{p.event ? ` · ${p.event}` : ""}</p><p className="truncate text-[0.75rem] text-ink-muted">{p.summary}</p></div>
                        <Button size="sm" onClick={() => copy(p)}><Copy className="h-3.5 w-3.5" />Use this</Button>
                      </li>
                    ))}
                  </ul>
                )}
              {rows.length > 0 && <p className="mt-1.5 text-[0.75rem] text-amber-700">Check dates and times in the descriptions — they're copied as they were.</p>}
            </div>

            {club && (
              <div>
                <Label hint="Cart Club rates">Their rates</Label>
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
                  {club.offers.includes("cart") && <div><span className="text-[0.6875rem] text-ink-faint">Carts</span><Input type="number" min={0} value={cb.carts} onChange={(e) => setCb({ ...cb, carts: Number(e.target.value) || 0 })} /></div>}
                  {club.offers.includes("baristas") && <>
                    <div><span className="text-[0.6875rem] text-ink-faint">Baristas</span><Input type="number" min={0} value={cb.baristas} onChange={(e) => setCb({ ...cb, baristas: Number(e.target.value) || 0 })} /></div>
                    <div><span className="text-[0.6875rem] text-ink-faint">Service from</span><Input type="time" value={cb.start} onChange={(e) => setCb({ ...cb, start: e.target.value })} /></div>
                    <div><span className="text-[0.6875rem] text-ink-faint">To</span><Input type="time" value={cb.finish} onChange={(e) => setCb({ ...cb, finish: e.target.value })} /></div>
                  </>}
                  {club.offers.includes("coffees") && <div><span className="text-[0.6875rem] text-ink-faint">Coffees</span><Input type="number" min={0} step={10} value={cb.coffees} onChange={(e) => setCb({ ...cb, coffees: Number(e.target.value) || 0 })} /></div>}
                  <Button onClick={fromClub}>Price it</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Lines" subtitle="Prices include GST" />
        <div className="space-y-2 border-t border-line p-4 sm:p-5">
          {!rows.length && <p className="text-[0.8125rem] text-ink-muted">No lines yet — copy a past invoice, use their rates, or add items below.</p>}
          {rows.map((r) => (
            <div key={r.key} className="grid gap-2 rounded-lg bg-zinc-50 p-2 ring-1 ring-line sm:grid-cols-[minmax(0,1fr)_80px_110px_auto]">
              <Textarea value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} className="min-h-[60px]" />
              <div><span className="text-[0.6875rem] text-ink-faint">Qty</span><Input inputMode="decimal" value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })} /></div>
              <div><span className="text-[0.6875rem] text-ink-faint">Each (inc GST)</span><Input inputMode="decimal" value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value })} /></div>
              <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={r.gst} onChange={(e) => set(r.key, { gst: e.target.checked })} />GST</label>
                <span className="text-[0.8125rem] font-medium text-ink">{money(num(r.quantity) * num(r.unit), currency, { cents: true })}</span>
                <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {priceList.length > 0 && (
              <Select value="" onChange={(e) => addSvc(e.target.value)} className="h-9 w-auto min-w-[220px]">
                <option value="">Add from price list…</option>
                {groups.map(([g, items]) => <optgroup key={g} label={g}>{items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
              </Select>
            )}
            <Button size="sm" onClick={() => setRows([...rows, { key: key(), description: "", quantity: "1", unit: "", gst: true, item_code: null, account_code: null, service_id: null }])}><Plus className="h-3.5 w-3.5" />Blank line</Button>
          </div>
          {rows.length > 0 && (
            <div className="space-y-0.5 pt-2 text-right text-[0.8125rem] text-ink-muted">
              <p>Subtotal {money(totals.subtotal, currency, { cents: true })} · GST {money(totals.tax, currency, { cents: true })}</p>
              <p className="text-[1.0625rem] font-semibold text-ink">Total {money(totals.total, currency, { cents: true })}</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <div><Label>Invoice date</Label><Input type="date" value={issue} onChange={(e) => { setIssue(e.target.value); if (e.target.value) setDue(addDaysISO(e.target.value, custTerms(customerId))); }} /></div>
          <div><Label>Due</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div><Label hint="optional">Reference / PO</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={name} /></div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end sm:p-5">
          <Button disabled={busy || !customerId || !rows.length} onClick={() => submit(false)}>Create invoice</Button>
          <Button variant="primary" disabled={busy || !customerId || !rows.length} onClick={() => submit(true)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Create &amp; email it</Button>
        </div>
        <div className="px-4 pb-4 sm:px-5"><FormError message={err} /></div>
      </Card>
    </div>
  );
}
