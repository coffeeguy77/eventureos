import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDate, fmtDateTime, money } from "@/lib/format";

export interface HistInvoice {
  id: string; number: string; issue_date: string | null; due_date: string | null; total: number; amount_paid: number; balance: number; status: string; origin: string | null; reference: string | null;
  payments: { amount: number; paid_at: string; method: string | null; reference: string | null }[];
}

const how = (p: { method: string | null; reference: string | null }) =>
  /^(ch|pi|py)_/.test(p.reference ?? "") ? "card (Stripe)" : p.method === "Xero" || !p.method ? "in Xero" : p.method;

/**
 * Every invoice and every payment for this customer, newest first — what you'd see on their contact in Xero.
 * For "I've paid that": find the invoice and the date the money was received.
 */
export function PaymentHistory({ invoices, currency, tz, today, all, href }: { invoices: HistInvoice[]; currency: string; tz: string; today: string; all: boolean; href: string }) {
  const pays = invoices.flatMap((i) => i.payments.map((p) => ({ ...p, number: i.number }))).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const last = pays[0] ?? null;
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const paidYear = pays.filter((p) => p.paid_at >= yearAgo).reduce((t, p) => t + Number(p.amount), 0);
  const shown = all ? invoices : invoices.slice(0, 15);
  return (
    <Card>
      <CardHeader title="Invoice & payment history" subtitle="Every invoice and payment from Xero and EventureOS — check here when they say they've paid" />
      <div className="grid grid-cols-1 gap-3 border-t border-line px-4 py-3 text-[0.8125rem] sm:grid-cols-3 sm:px-5">
        <div><p className="text-[0.75rem] text-ink-muted">Last payment</p><p className="font-semibold text-ink">{last ? `${money(Number(last.amount), currency, { cents: true })} · ${fmtDateTime(last.paid_at, tz, "date")}` : "None on record"}</p>{last && <p className="text-[0.75rem] text-ink-muted">on {last.number}, {how(last)}</p>}</div>
        <div><p className="text-[0.75rem] text-ink-muted">Paid in the last 12 months</p><p className="font-semibold tabular-nums text-ink">{money(paidYear, currency, { cents: true })}</p></div>
        <div><p className="text-[0.75rem] text-ink-muted">Invoices</p><p className="font-semibold text-ink">{invoices.length}{invoices.length >= 500 ? "+" : ""} · {invoices.filter((i) => i.balance > 0 && i.status !== "void").length} unpaid</p></div>
      </div>
      {invoices.length === 0 ? <p className="border-t border-line px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No invoices yet.</p> : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map((i) => {
            const credited = Math.max(0, Number(i.amount_paid) - i.payments.reduce((t, p) => t + Number(p.amount), 0));
            const unpaid = i.balance > 0 && i.status !== "void" && i.status !== "draft";
            const late = unpaid && i.due_date && i.due_date < today;
            return (
              <li key={i.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <Link href={`/invoices/${i.id}`} className="text-[0.875rem] font-semibold text-ink hover:text-brand-700 hover:underline">{i.number}</Link>
                  <span className="text-[0.75rem] text-ink-muted">{i.issue_date ? fmtDate(i.issue_date, "medium") : "—"}{i.reference ? ` · ${i.reference}` : ""}{i.origin === "xero" ? " · Xero" : ""}</span>
                  <span className="ml-auto text-[0.875rem] font-semibold tabular-nums text-ink">{money(Number(i.total), currency, { cents: true })}</span>
                </div>
                <div className="mt-1 space-y-0.5 text-[0.75rem]">
                  {i.payments.map((p, k) => <p key={k} className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Paid {money(Number(p.amount), currency, { cents: true })} on {fmtDateTime(p.paid_at, tz, "date")} · {how(p)}{p.reference && !/^(ch|pi|py)_/.test(p.reference) ? ` · ref ${p.reference}` : ""}</p>)}
                  {credited > 0.009 && <p className="text-ink-muted">Credited {money(credited, currency, { cents: true })} (credit note or overpayment in Xero)</p>}
                  {i.status === "void" ? <p className="text-ink-faint">Voided</p>
                    : unpaid ? <p className={late ? "font-medium text-rose-700" : "text-amber-700"}>{money(i.balance, currency, { cents: true })} still owing{i.due_date ? ` · ${late ? "was due" : "due"} ${fmtDate(i.due_date, "short")}` : ""}</p>
                    : !i.payments.length && credited <= 0.009 && i.status !== "draft" ? <p className="text-ink-muted">Marked paid</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!all && invoices.length > shown.length && <Link href={href} className="block border-t border-line px-5 py-3 text-center text-[0.8125rem] font-medium text-brand-700 hover:bg-zinc-50">Show all {invoices.length}{invoices.length >= 500 ? "+" : ""} invoices</Link>}
    </Card>
  );
}
