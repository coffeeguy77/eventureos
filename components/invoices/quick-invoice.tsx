"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronDown, Copy, ExternalLink, Loader2, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { addDaysISO, fmtDate, money } from "@/lib/format";
import { incLineFromEx, lineTotals, type InvLine } from "@/lib/invoices/lines";
import { priceOrder, readRates } from "@/lib/club/core";
import { clubRatesFor, createJobInvoice, customerFromInvite, pastInvoices, type PastInvoice } from "@/app/(app)/invoices/quick/actions";

interface Svc { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; unit?: string | null; code: string | null; xero_account_code: string | null; category: string | null }
export interface Invitee { email: string; name: string | null; match: { id: string; name: string } | null }
export interface CalDetails {
  title: string; when: string; start: string | null; finish: string | null; location: string | null; notes: string; link: string | null;
  phones: string[]; coffees: number | null; setup: string | null; serviceStart: string | null; serviceFinish: string | null;
}
const hoursBetween = (a: string | null, b: string | null) => { if (!a || !b) return 0; const m = (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5))); return m > 0 ? Math.round((m / 60) * 100) / 100 : 0; };
type Row = { key: string; description: string; quantity: string; unit: string; gst: boolean; item_code: string | null; account_code: string | null; service_id: string | null };
const num = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const key = () => `r${Math.random().toString(36).slice(2, 9)}`;
const fromLine = (l: InvLine): Row => ({ key: key(), description: l.description, quantity: String(l.quantity), unit: l.unit_amount.toFixed(2), gst: l.tax_rate === 10, item_code: l.item_code ?? null, account_code: l.account_code ?? null, service_id: l.service_id ?? null });

export function QuickInvoice({ entryId, eventId, customers: allCustomers, priceList, initial, existing, today, terms, currency, cal, invitees }: {
  entryId: string | null; eventId: string | null; customers: { id: string; name: string; terms: number | null }[]; priceList: Svc[];
  initial: { customer: string; name: string; date: string; venue: string }; existing: { id: string; number: string; total: number }[]; today: string; terms: number; currency: string;
  cal: CalDetails | null; invitees: Invitee[];
}) {
  const [customers, setCustomers] = useState(allCustomers);
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
  const svcStart = cal?.serviceStart ?? cal?.start ?? "";
  const svcFinish = cal?.serviceFinish ?? cal?.finish ?? "";
  const [cb, setCb] = useState({ carts: 1, baristas: svcStart && svcFinish ? 1 : 0, start: svcStart, finish: svcFinish, coffees: cal?.coffees ?? 0 });
  const serviceHrs = hoursBetween(svcStart || null, svcFinish || null);
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
    const hourly = /hour|hr/i.test(`${p.unit ?? ""} ${p.name}`) && serviceHrs > 0;
    setRows((all) => [...all, { key: key(), description: [p.name, p.description?.trim(), hourly ? `${svcStart}–${svcFinish}` : ""].filter(Boolean).join("\n"), quantity: hourly ? String(serviceHrs) : "1", unit: inc.toFixed(2), gst: Number(p.tax_rate) > 0, item_code: p.code, account_code: p.xero_account_code, service_id: p.id }]);
  };
  const fromClub = () => {
    if (!club) return;
    const r = readRates(club.rates);
    const p = priceOrder({ days: [{ date, start: cb.start || null, finish: cb.finish || null }], carts: club.offers.includes("cart") ? cb.carts : 0, van: 0, baristas: club.offers.includes("baristas") ? cb.baristas : 0, coffees: club.offers.includes("coffees") ? cb.coffees : 0 }, r);
    setRows(p.lines.map((l) => fromLine(incLineFromEx(`${l.label}\n${l.note}`, l.qty, l.unit, { item_code: club.codes[l.key] || null }))));
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

      {cal && <FromCalendar cal={cal} invitees={invitees} date={initial.date} customerId={customerId} onPick={(id) => chooseCustomer(id)}
        onCreated={(c) => { setCustomers((all) => all.some((x) => x.id === c.id) ? all : [{ id: c.id, name: c.name, terms: null }, ...all]); chooseCustomer(c.id); }} />}

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
              {rows.length > 0 && serviceHrs > 0 && <p className="mt-1.5 text-[0.75rem] text-ink-muted">The calendar says service {svcStart}–{svcFinish} ({serviceHrs} hrs){cal?.setup ? `, setup ${cal.setup}` : ""}{cal?.coffees ? `, ${cal.coffees} coffees` : ""}.</p>}
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

/** What the calendar says about the job — notes, times, phone — and who was invited (use a client, or add one). */
function FromCalendar({ cal, invitees, date, customerId, onPick, onCreated }: {
  cal: CalDetails; invitees: Invitee[]; date: string; customerId: string; onPick: (id: string) => void; onCreated: (c: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [nc, setNc] = useState({ name: "", company: "", email: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const startAdd = (i: Invitee | null) => { setAdding(i?.email ?? "new"); setNc({ name: i?.name ?? "", company: "", email: i?.email ?? "", phone: cal.phones[0] ?? "" }); setErr(null); };
  const create = () => start(async () => {
    const r = await customerFromInvite(nc);
    if (r.ok) { setAdding(null); onCreated({ id: r.data.id, name: r.data.name }); } else setErr(r.error);
  });
  const facts = [cal.setup && `Setup ${cal.setup}`, cal.serviceStart && cal.serviceFinish && `Service ${cal.serviceStart}–${cal.serviceFinish}`, cal.coffees && `${cal.coffees} coffees`, ...cal.phones].filter(Boolean) as string[];
  return (
    <Card>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
        <span className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-ink-faint" /><span className="truncate text-[0.875rem] font-semibold text-ink">From the calendar: {cal.title}</span></span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink">
            <span>{fmtDate(date, "weekday")} · {cal.when}</span>
            {cal.location && <span className="text-ink-muted">{cal.location}</span>}
            {cal.link && <a href={cal.link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-700 hover:underline">Google Calendar<ExternalLink className="h-3 w-3" /></a>}
          </div>
          {facts.length > 0 && <div className="flex flex-wrap gap-1.5">{facts.map((f) => <span key={f} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[0.75rem] font-medium text-brand-800 ring-1 ring-inset ring-brand-200">{f}</span>)}</div>}
          {cal.notes ? <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-sans text-[0.8125rem] leading-relaxed text-ink ring-1 ring-line">{cal.notes}</pre>
            : <p className="text-[0.8125rem] text-ink-muted">No notes on this calendar entry.</p>}

          <div>
            <p className="mb-1.5 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Invited</p>
            {!invitees.length && <p className="text-[0.8125rem] text-ink-muted">Nobody outside your team was invited.</p>}
            <ul className="divide-y divide-line rounded-lg ring-1 ring-line empty:hidden">
              {invitees.map((i) => (
                <li key={i.email} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[0.8125rem]">
                  <div className="min-w-0 flex-1"><p className="font-medium text-ink">{i.name ?? i.email.split("@")[0]}</p><p className="truncate text-[0.75rem] text-ink-muted">{i.email}</p></div>
                  {i.match ? (
                    i.match.id === customerId ? <span className="text-[0.75rem] font-medium text-emerald-700">Billing {i.match.name}</span>
                      : <Button size="sm" onClick={() => onPick(i.match!.id)}>Bill {i.match.name}</Button>
                  ) : <Button size="sm" onClick={() => startAdd(i)}><UserPlus className="h-3.5 w-3.5" />New customer</Button>}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => startAdd(null)} className="mt-2 text-[0.75rem] font-medium text-brand-700 hover:underline">+ Add a new customer by hand</button>
          </div>

          {adding && (
            <div className="space-y-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-line">
              <p className="text-[0.8125rem] font-medium text-ink">New customer</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><Label>Contact name</Label><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></div>
                <div><Label hint="leave blank for a person">Company</Label><Input value={nc.company} onChange={(e) => setNc({ ...nc, company: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} inputMode="tel" /></div>
              </div>
              <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={create}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Add and bill them</Button><Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button></div>
              <FormError message={err} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
