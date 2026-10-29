import { billToLines, loadBillTo } from "@/lib/customers/bill-to";
import { readTerms } from "@/lib/accounts/core";
import { createServiceClient } from "@/lib/integrations/runtime";
import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { invoiceByToken, payable } from "@/lib/payments/service";
import { fmtDate, money } from "@/lib/format";
import { PayButton } from "./pay-button";
import { InvoiceViewBeacon } from "./view-beacon";
import { ReceiptWait } from "./receipt-wait";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; ce?: string; st?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const found = await invoiceByToken(token);
  if (!found) notFound();
  // opened from a chasing email in Accounts: count the pay-link click (only for that invoice's own email)
  if (sp.ce && /^[0-9a-f-]{36}$/i.test(sp.ce)) {
    const { recordCollectionClick } = await import("@/lib/accounts/track");
    await recordCollectionClick(sp.ce, found.inv.id).catch(() => undefined);
  }
  const { inv, stripeReady } = found;
  const colour = safeColour(inv.org.brand_colour);
  const cur = inv.currency || "AUD";
  const justPaid = sp.paid === "1";
  const canPay = payable(inv) && stripeReady && !justPaid;
  // The client's details (the pay link's token is already checked)
  const svc = createServiceClient();
  const { data: evc } = inv.event_id ? await svc.from("events").select("primary_contact_id").eq("id", inv.event_id).maybeSingle() : { data: null };
  // Credit notes (e.g. balance written off after a cancellation) — none before the 0047 database update
  const { data: cr, error: crErr } = await svc.from("invoice_credits").select("amount").eq("invoice_id", inv.id);
  const credited = crErr ? 0 : (cr ?? []).reduce((t, c) => t + Number(c.amount), 0);
  const received = Math.max(0, Number(inv.amount_paid) - credited);
  const bill = billToLines(await loadBillTo(svc, inv.organisation_id, inv.customer_id, evc?.primary_contact_id ?? null).catch(() => null));
  // The business's terms and conditions (Accounts → Fees & terms), linked when they've published them
  const { data: termsOrg } = await svc.from("organisations").select("slug, settings").eq("id", inv.organisation_id).maybeSingle();
  const termsHref = termsOrg && readTerms(termsOrg.settings) ? `/p/${termsOrg.slug as string}/terms` : null;
  // What they're paying for: the invoice's lines (from EventureOS or Xero)
  const { data: lineInv } = await svc.from("invoices").select("organisation_id, kind, total, subtotal, tax_total, line_items, xero_invoice_id, quote_id, created_by, origin, reference, issue_date").eq("id", inv.id).maybeSingle();
  const { invoiceLines } = await import("@/lib/invoices/document");
  const { lineTaxMode } = await import("@/lib/invoices/document-pdf");
  const docLines = lineInv ? await invoiceLines(svc, lineInv as Parameters<typeof invoiceLines>[1], inv.event?.name ?? null).catch(() => []) : [];
  const taxMode = lineInv ? lineTaxMode(docLines, Number(lineInv.subtotal), Number(lineInv.total)) : null;
  const kind = inv.kind === "deposit" ? "Deposit invoice" : inv.kind === "final" ? "Final invoice" : "Invoice";
  // Receipts: one per payment on this invoice
  const { data: pays } = await svc.from("payments").select("id, amount, paid_at, method, reference").eq("invoice_id", inv.id).order("paid_at", { ascending: true }).order("created_at", { ascending: true });
  const payments = (pays ?? []) as { id: string; amount: number; paid_at: string; method: string | null; reference: string | null }[];
  const recent = payments.some((x) => Date.now() - Date.parse(x.paid_at) < 15 * 60_000);

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:py-16">
      {!justPaid && <InvoiceViewBeacon token={token} />}
      <div className="mx-auto max-w-lg">
        {sp.st && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sp.st) && <a href={`/pay/statement/${sp.st}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← Back to your statement</a>}
        <div className="mb-6 flex items-center justify-center">
          {inv.org.logo_url && /^https:\/\//.test(inv.org.logo_url)
            ? <img src={inv.org.logo_url} alt={inv.org.name} className="h-12 max-w-[200px] object-contain" />
            : <p className="text-[1.25rem] font-semibold text-ink">{inv.org.name}</p>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="p-6">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">{kind} {inv.number ?? ""}</p>
            {bill ? (
              <div className="mt-2 text-[0.8125rem]">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint">Bill to</p>
                <p className="text-[0.9375rem] font-medium text-ink">{bill.main}</p>
                {bill.sub.map((l, i) => <p key={i} className="break-words text-ink-muted">{l}</p>)}
              </div>
            ) : <p className="mt-1 text-[0.9375rem] text-ink">{inv.customer?.name ?? ""}</p>}
            {inv.event && <p className="text-[0.8125rem] text-ink-muted">{inv.event.name}{inv.event.event_date ? ` · ${fmtDate(inv.event.event_date, "long")}` : ""}</p>}

            {docLines.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint">What it&apos;s for{lineInv?.issue_date ? ` · issued ${fmtDate(lineInv.issue_date as string, "long")}` : ""}{lineInv?.reference ? ` · ${lineInv.reference}` : ""}</p>
                <ul className="mt-2 space-y-2 text-[0.875rem]">
                  {docLines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 whitespace-pre-line text-ink">{l.description}{l.quantity != null && l.quantity !== 1 ? <span className="block text-[0.75rem] text-ink-muted">{l.quantity} × {l.unit != null ? money(l.unit, cur, { cents: true }) : ""}</span> : null}</span>
                      {l.amount != null && <span className="shrink-0 tabular-nums text-ink">{money(l.amount, cur, { cents: true })}</span>}
                    </li>
                  ))}
                </ul>
                {lineInv && Number(lineInv.tax_total) > 0 && <p className="mt-2 text-right text-[0.75rem] text-ink-muted">{taxMode === "ex" ? `Prices ex GST · subtotal ${money(Number(lineInv.subtotal), cur, { cents: true })} + GST ${money(Number(lineInv.tax_total), cur, { cents: true })}` : `Includes GST of ${money(Number(lineInv.tax_total), cur, { cents: true })}`}</p>}
              </div>
            )}
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[0.875rem]">
              <div className="flex justify-between"><dt className="text-ink-muted">Invoice total</dt><dd className="text-ink">{money(inv.total, cur, { cents: true })}</dd></div>
              {received > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Paid</dt><dd className="text-ink">{money(received, cur, { cents: true })}</dd></div>}
              {credited > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Credited</dt><dd className="text-ink">−{money(credited, cur, { cents: true })}</dd></div>}
              {inv.due_date && <div className="flex justify-between"><dt className="text-ink-muted">Due</dt><dd className="text-ink">{fmtDate(inv.due_date, "long")}</dd></div>}
              <div className="flex justify-between border-t border-line pt-3 text-[1.0625rem] font-semibold"><dt className="text-ink">Amount due</dt><dd className="text-ink">{money(justPaid ? 0 : inv.balance, cur, { cents: true })}</dd></div>
            </dl>
          </div>
          <div className="border-t border-line bg-zinc-50 p-6">
            {justPaid || inv.status === "paid" ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <p className="mt-2 text-[1rem] font-semibold text-ink">{justPaid ? "Payment received — thank you!" : credited > 0 ? "Nothing more to pay on this invoice." : "This invoice is paid — thank you!"}</p>
                <p className="mt-1 text-[0.8125rem] text-ink-muted">{inv.org.name} has been notified.{justPaid && !recent ? " Your receipt will appear below in a few seconds." : ""}</p>
                {justPaid && !recent && <ReceiptWait />}
              </div>
            ) : canPay ? (
              <PayButton token={token} label={`Pay ${money(inv.balance, cur, { cents: true })} by card`} colour={colour} />
            ) : (
              <p className="text-center text-[0.875rem] text-ink-muted">
                {!stripeReady ? `Online card payment isn't available for this invoice. Please contact ${inv.org.name} to pay.` : "This invoice can't be paid online."}
              </p>
            )}
          </div>
          {payments.length > 0 && (
            <div className="border-t border-line p-6">
              <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Payment receipts</p>
              <ul className="mt-3 space-y-2">
                {payments.map((x, i) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 text-[0.875rem]">
                    <span className="min-w-0"><span className="block text-ink">{money(x.amount, cur, { cents: true })} · {fmtDate(x.paid_at.slice(0, 10), "long")}</span><span className="block text-[0.75rem] text-ink-faint">Receipt {inv.number ?? "INV"}-R{i + 1}</span></span>
                    <a href={`/pay/${token}/receipt/${x.id}?download=1`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold text-white" style={{ background: colour }}><Download className="h-4 w-4" />Receipt</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="mt-4 text-center"><a href={`/pay/${token}/invoice?download=1`} className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-muted hover:text-ink"><Download className="h-4 w-4" />{Number(inv.balance) <= 0 ? "Download the paid tax invoice (PDF)" : "Download the invoice (PDF)"}</a></p>
        <p className="mt-6 text-center text-[0.75rem] text-ink-faint">
          Questions? Contact {inv.org.name}{inv.org.contact_email ? ` · ${inv.org.contact_email}` : ""}{inv.org.contact_phone ? ` · ${inv.org.contact_phone}` : ""}
          {termsHref && <> · <a href={termsHref} target="_blank" rel="noreferrer" className="underline hover:text-ink">Terms and conditions</a></>}
        </p>
      </div>
    </main>
  );
}
