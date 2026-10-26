import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { methodLabel } from "@/lib/payments/receipt-pdf";
import { receiptNumber } from "@/lib/payments/receipt";
import { Panel, portalButton } from "../ui";
import { CUSTOMER_INVOICE_STATUS, INVOICE_COLUMNS, isOpenInvoice, requirePortal, type PortalInvoice, type PortalPayment } from "../portal-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices & receipts", robots: { index: false, follow: false } };

/** Every invoice and payment for this customer, with a receipt to download for each payment. */
export default async function PortalPayments({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, org, customerIds } = await requirePortal(slug);
  const { data: invData, error } = await supabase.from("invoices").select(INVOICE_COLUMNS).eq("organisation_id", org.id).in("customer_id", customerIds).neq("status", "draft").order("issue_date", { ascending: false });
  if (error) throw new Error(`Could not load your invoices: ${error.message}`);
  const invoices = (invData ?? []) as unknown as PortalInvoice[];
  const ids = invoices.map((i) => i.id);
  const { data: payData } = ids.length ? await supabase.from("payments").select("id, invoice_id, amount, paid_at, method, reference, created_at").in("invoice_id", ids).order("paid_at", { ascending: true }).order("created_at", { ascending: true }) : { data: [] };
  const payments = (payData ?? []) as (PortalPayment & { created_at: string })[];
  const cur = org.currency;
  const owing = invoices.filter(isOpenInvoice).reduce((t, i) => t + Number(i.balance), 0);
  const paid = payments.reduce((t, p) => t + Number(p.amount), 0);
  // Receipt numbers follow the order of payments on each invoice
  const nth = new Map<string, number>();
  for (const i of invoices) payments.filter((p) => p.invoice_id === i.id).forEach((p, k) => nth.set(p.id, k + 1));
  const newest = [...payments].reverse();

  return (
    <div className="space-y-6">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Your account</Link>
      <div>
        <h1 className="portal-serif text-[2.25rem] font-semibold leading-tight text-ink">Invoices &amp; receipts</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">Download a receipt for any payment you&apos;ve made.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">To pay</p><p className="tabular mt-1 text-[1.375rem] font-semibold text-ink">{money(owing, cur)}</p></div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Paid</p><p className="tabular mt-1 text-[1.375rem] font-semibold text-ink">{money(paid, cur)}</p></div>
      </div>

      <Panel title="Payment receipts">
        {newest.length === 0 ? <p className="border-t border-line px-4 py-8 text-center text-[0.8125rem] text-ink-muted sm:px-6">No payments yet.</p> : (
          <ul className="divide-y divide-line border-t border-line">
            {newest.map((p) => {
              const inv = invoices.find((i) => i.id === p.invoice_id);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">{money(p.amount, cur)} <span className="font-normal text-ink-muted">· {fmtDateTime(p.paid_at, org.timezone, "date")}</span></p>
                    <p className="text-[0.7812rem] text-ink-muted">Receipt {receiptNumber(inv?.number ?? null, nth.get(p.id) ?? 1)} · Invoice {inv?.number ?? "—"} · {methodLabel(p.method, p.reference)}</p>
                  </div>
                  <span className="flex gap-2">
                    <a href={`/p/${slug}/receipts/${p.id}`} target="_blank" rel="noopener" className={portalButton("secondary", "h-9 text-[0.8125rem]")}>View</a>
                    <a href={`/p/${slug}/receipts/${p.id}?download=1`} className={portalButton("primary", "h-9 text-[0.8125rem]")}><Download className="h-4 w-4" />Download</a>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Invoices">
        {invoices.length === 0 ? <p className="border-t border-line px-4 py-8 text-center text-[0.8125rem] text-ink-muted sm:px-6">No invoices yet.</p> : (
          <ul className="divide-y divide-line border-t border-line">
            {invoices.map((i) => {
              const s = CUSTOMER_INVOICE_STATUS[i.status];
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">Invoice {i.number} <span className="font-normal text-ink-muted">· {money(i.total, i.currency || cur)}</span></p>
                    <p className="text-[0.7812rem] text-ink-muted">Issued {fmtDate(i.issue_date)}{i.due_date ? ` · Due ${fmtDate(i.due_date)}` : ""}{Number(i.balance) > 0 && i.status !== "void" ? ` · ${money(i.balance, i.currency || cur)} to pay` : ""}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <a href={`/pay/${i.pay_token}`} className={portalButton(isOpenInvoice(i) ? "primary" : "secondary", "h-9 text-[0.8125rem]")}>{isOpenInvoice(i) ? "Pay" : "View"}</a>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
