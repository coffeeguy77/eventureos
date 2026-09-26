"use client";

import { useActionState, useState } from "react";
import { createInvoice, type InvoiceFormState } from "../actions";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { addDaysISO, money } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface QuoteOption { id: string; label: string; customerId: string; eventId: string | null; total: number; invoiced: number }
type Kind = "deposit" | "final" | "full" | "other";
const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "deposit", label: "Deposit", hint: "Secures the booking" },
  { key: "final", label: "Final", hint: "The balance after the deposit" },
  { key: "full", label: "Full", hint: "The whole amount in one invoice" },
  { key: "other", label: "Other", hint: "Extras, variations, hire" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function NewInvoiceForm({ customers, events, quotes, depositPct, terms, today, defaultDue, currency, initial }: {
  customers: { id: string; name: string }[]; events: { id: string; label: string; customerId: string }[]; quotes: QuoteOption[];
  depositPct: number; terms: number; today: string; defaultDue: string; currency: string;
  initial: { customer?: string; event?: string; quote?: string };
}) {
  const initQuote = quotes.find((q) => q.id === initial.quote) ?? null;
  const initEvent = events.find((e) => e.id === initial.event) ?? null;
  const [customerId, setCustomerId] = useState(initQuote?.customerId ?? initEvent?.customerId ?? initial.customer ?? "");
  const [eventId, setEventId] = useState(initQuote?.eventId ?? initEvent?.id ?? "");
  const [quoteId, setQuoteId] = useState(initQuote?.id ?? "");
  const [kind, setKind] = useState<Kind>(initQuote && initQuote.invoiced > 0 ? "final" : "deposit");
  const [amount, setAmount] = useState(initQuote ? suggest(initQuote, initQuote.invoiced > 0 ? "final" : "deposit") : "");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [state, action, pending] = useActionState<InvoiceFormState, FormData>(createInvoice, undefined);

  function suggest(q: QuoteOption | null, k: Kind) {
    if (!q) return "";
    if (k === "deposit") return round2((q.total * depositPct) / 100).toFixed(2);
    if (k === "final") return round2(Math.max(0, q.total - q.invoiced)).toFixed(2);
    if (k === "full") return q.total.toFixed(2);
    return "";
  }

  const custEvents = events.filter((e) => !customerId || e.customerId === customerId);
  const custQuotes = quotes.filter((q) => (!customerId || q.customerId === customerId) && (!eventId || !q.eventId || q.eventId === eventId));
  const quote = quotes.find((q) => q.id === quoteId) ?? null;

  function chooseCustomer(id: string) {
    setCustomerId(id);
    if (eventId && events.find((e) => e.id === eventId)?.customerId !== id) setEventId("");
    if (quoteId && quotes.find((q) => q.id === quoteId)?.customerId !== id) setQuoteId("");
  }
  function chooseQuote(id: string) {
    setQuoteId(id);
    const q = quotes.find((x) => x.id === id) ?? null;
    if (q?.eventId) setEventId(q.eventId);
    const k = q && q.invoiced > 0 && kind === "deposit" ? "final" : kind;
    setKind(k);
    if (q) setAmount(suggest(q, k));
  }
  function chooseKind(k: Kind) {
    setKind(k);
    if (quote) setAmount(suggest(quote, k));
  }

  const n = Number(amount.replace(/[$,\s]/g, ""));
  return (
    <form action={action}>
      <Card className="p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="customer_id">Customer</Label>
            <Select id="customer_id" name="customer_id" value={customerId} onChange={(e) => chooseCustomer(e.target.value)} required>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="event_id" hint="Optional">Event</Label>
            <Select id="event_id" name="event_id" value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!customerId}>
              <option value="">No event</option>
              {custEvents.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="quote_id" hint="Accepted quotes only">Quote</Label>
            <Select id="quote_id" name="quote_id" value={quoteId} onChange={(e) => chooseQuote(e.target.value)} disabled={!customerId}>
              <option value="">No quote</option>
              {custQuotes.map((q) => <option key={q.id} value={q.id}>{q.label} · {money(q.total, currency)}</option>)}
            </Select>
            {quote && (
              <p className="mt-1 text-[12px] text-ink-muted">
                Quote total {money(quote.total, currency)}{quote.invoiced > 0 ? ` · ${money(quote.invoiced, currency)} already invoiced` : " · nothing invoiced yet"}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
              {KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => chooseKind(k.key)}
                  className={cn("rounded-lg px-3 py-2 text-left ring-1 ring-inset transition-colors",
                    kind === k.key ? "bg-brand-50 ring-brand-300" : "bg-white ring-line-strong hover:bg-zinc-50")}>
                  <span className="block text-[13px] font-medium text-ink">{k.label}</span>
                  <span className="block text-[11.5px] text-ink-muted">{k.key === "deposit" ? `${depositPct}% · ${k.hint.toLowerCase()}` : k.hint}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>

          <div>
            <Label htmlFor="amount" hint="Including GST">Amount</Label>
            <Input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
            {Number.isFinite(n) && n > 0 && <p className="mt-1 text-[12px] text-ink-muted">{money(n, currency)} · GST {money(n - Math.round((n * 100) / 1.1) / 100, currency)}</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
            <div><Label htmlFor="issue_date">Date</Label><Input id="issue_date" name="issue_date" type="date" value={issueDate} required
              onChange={(e) => { setIssueDate(e.target.value); if (e.target.value) setDueDate(addDaysISO(e.target.value, terms)); }} /></div>
            <div><Label htmlFor="due_date" hint={`${terms}-day terms`}>Due</Label><Input id="due_date" name="due_date" type="date" value={dueDate} min={issueDate} required onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
        </div>
        <p className="mt-5 text-[12px] text-ink-muted">The invoice number is assigned automatically.</p>
        <div className="mt-4"><FormError message={state?.error} /></div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <ButtonLink href="/invoices" variant="ghost" className="h-10 w-full sm:h-9 sm:w-auto">Cancel</ButtonLink>
          <Button name="intent" value="draft" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending}>Save as draft</Button>
          <Button name="intent" value="send" variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending}>{pending ? "Creating…" : "Create · awaiting payment"}</Button>
        </div>
      </Card>
    </form>
  );
}
