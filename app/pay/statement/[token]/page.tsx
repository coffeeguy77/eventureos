import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadStatement, readStatement } from "@/lib/accounts/statement";
import { daysBetween } from "@/lib/accounts/core";
import { fmtDate, money, todayISO } from "@/lib/format";
import { StatementBeacon, StatementPay } from "./pay-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account statement", robots: { index: false, follow: false } };

/** A customer's account statement: every invoice owing (pay all or some), any payment plan, and their account history. */
export default async function StatementPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  const justPaid = (await searchParams).paid === "1";
  const s = readStatement(token);
  if (!s) notFound();
  const d = await loadStatement(createServiceClient(), s.orgId, s.customerId);
  if (!d) notFound();
  const cur = d.org.currency;
  const today = todayISO(d.org.timezone);
  const brand = d.org.brand_colour && /^#[0-9a-f]{6}$/i.test(d.org.brand_colour) ? d.org.brand_colour : "#6028EC";
  const total = d.owing.reduce((a, i) => a + i.balance, 0);
  const overdue = d.owing.filter((i) => i.due_date && i.due_date < today).reduce((a, i) => a + i.balance, 0);
  const rows = d.owing.map((i) => ({
    id: i.id, number: i.number, balance: i.balance, href: i.pay_token ? `/pay/${i.pay_token}` : null, overdue: !!(i.due_date && i.due_date < today),
    due: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue (due ${fmtDate(i.due_date, "short")})` : `Due ${fmtDate(i.due_date, "short")}`) : `Issued ${fmtDate(i.issue_date, "short")}`,
  }));
  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:py-14">
      {!justPaid && <StatementBeacon token={token} />}
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-center">
          {d.org.logo_url && /^https:\/\//.test(d.org.logo_url) ? <img src={d.org.logo_url} alt={d.org.name} className="h-12 max-w-[220px] object-contain" /> : <p className="text-[1.25rem] font-semibold text-ink">{d.org.name}</p>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="p-6 sm:p-8">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Account statement · {fmtDate(today, "long")}</p>
            <h1 className="mt-1 text-[1.375rem] font-semibold text-ink">{d.customer.name}</h1>
            {justPaid && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-[0.875rem] font-medium text-emerald-900 ring-1 ring-inset ring-emerald-100">Thank you — your payment went through. It can take a minute to show below; your receipts are on each invoice.</p>}
            {s.expired ? <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-[0.875rem] text-amber-900">This statement link is more than 90 days old. Please contact {d.org.name} for an up-to-date one.</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-inset ring-line"><p className="text-[0.75rem] font-medium text-ink-muted">Owing</p><p className="mt-0.5 text-[1.5rem] font-semibold tabular-nums text-ink">{money(total, cur)}</p></div>
              <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-inset ring-line"><p className="text-[0.75rem] font-medium text-ink-muted">Overdue</p><p className={`mt-0.5 text-[1.5rem] font-semibold tabular-nums ${overdue ? "text-rose-700" : "text-ink"}`}>{money(overdue, cur)}</p></div>
            </div>
            <h2 className="mt-7 text-[0.9375rem] font-semibold text-ink">Invoices to pay</h2>
            {rows.length ? <StatementPay token={token} rows={rows} currency={cur} canPay={d.stripe && !s.expired} brand={brand} />
              : <p className="mt-2 text-[0.875rem] text-emerald-700">Nothing owing — thank you!</p>}
            {d.plan && (
              <>
                <h2 className="mt-8 text-[0.9375rem] font-semibold text-ink">Your payment plan ({d.plan.frequency})</h2>
                <p className="mt-1 text-[0.8125rem] text-ink-muted">Charged automatically to your card on file.</p>
                <ul className="mt-2 divide-y divide-line text-[0.875rem]">
                  {d.plan.instalments.map((x) => <li key={x.n} className="flex justify-between py-2"><span>{fmtDate(x.due_date, "short")}</span><span className={x.status === "paid" ? "text-emerald-700" : x.status === "failed" ? "text-rose-700" : "text-ink"}>{money(x.amount, cur)} · {x.status === "scheduled" ? "to come" : x.status}</span></li>)}
                </ul>
              </>
            )}
            {(d.payments.length > 0 || d.paid.length > 0) && (
              <>
                <h2 className="mt-8 text-[0.9375rem] font-semibold text-ink">Account history</h2>
                <ul className="mt-2 divide-y divide-line text-[0.875rem]">
                  {d.payments.map((p, i) => <li key={`p${i}`} className="flex justify-between py-2"><span className="text-ink-muted">{fmtDate(p.paid_at.slice(0, 10), "short")} · Payment{p.number ? ` on ${p.number}` : ""}</span><span className="font-medium tabular-nums text-emerald-700">{money(p.amount, cur)}</span></li>)}
                  {d.paid.map((p, i) => <li key={`i${i}`} className="flex justify-between py-2"><span className="text-ink-muted">{fmtDate(p.issue_date, "short")} · {p.pay_token ? <a href={`/pay/${p.pay_token}`} className="underline hover:text-ink">Invoice {p.number}</a> : `Invoice ${p.number}`}</span><span className="tabular-nums">{money(p.total, cur)} · paid</span></li>)}
                </ul>
              </>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-[0.75rem] text-ink-faint">Questions about your account? Contact {d.org.name}{d.org.contact_email ? ` · ${d.org.contact_email}` : ""}{d.org.contact_phone ? ` · ${d.org.contact_phone}` : ""}</p>
      </div>
    </main>
  );
}
