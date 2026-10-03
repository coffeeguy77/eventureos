import { billToLines, loadBillTo } from "@/lib/customers/bill-to";
import { createServiceClient } from "@/lib/integrations/runtime";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { invoiceByToken, payable } from "@/lib/payments/service";
import { fmtDate, money } from "@/lib/format";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const found = await invoiceByToken(token);
  if (!found) notFound();
  const { inv, stripeReady } = found;
  const colour = safeColour(inv.org.brand_colour);
  const cur = inv.currency || "AUD";
  const justPaid = sp.paid === "1";
  const canPay = payable(inv) && stripeReady && !justPaid;
  // The client's details (the pay link's token is already checked)
  const svc = createServiceClient();
  const { data: evc } = inv.event_id ? await svc.from("events").select("primary_contact_id").eq("id", inv.event_id).maybeSingle() : { data: null };
  const bill = billToLines(await loadBillTo(svc, inv.organisation_id, inv.customer_id, evc?.primary_contact_id ?? null).catch(() => null));
  const kind = inv.kind === "deposit" ? "Deposit invoice" : inv.kind === "final" ? "Final invoice" : "Invoice";

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-md">
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

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[0.875rem]">
              <div className="flex justify-between"><dt className="text-ink-muted">Invoice total</dt><dd className="text-ink">{money(inv.total, cur, { cents: true })}</dd></div>
              {Number(inv.amount_paid) > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Paid</dt><dd className="text-ink">{money(inv.amount_paid, cur, { cents: true })}</dd></div>}
              {inv.due_date && <div className="flex justify-between"><dt className="text-ink-muted">Due</dt><dd className="text-ink">{fmtDate(inv.due_date, "long")}</dd></div>}
              <div className="flex justify-between border-t border-line pt-3 text-[1.0625rem] font-semibold"><dt className="text-ink">Amount due</dt><dd className="text-ink">{money(justPaid ? 0 : inv.balance, cur, { cents: true })}</dd></div>
            </dl>
          </div>
          <div className="border-t border-line bg-zinc-50 p-6">
            {justPaid || inv.status === "paid" ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <p className="mt-2 text-[1rem] font-semibold text-ink">{justPaid ? "Payment received — thank you!" : "This invoice is paid — thank you!"}</p>
                <p className="mt-1 text-[0.8125rem] text-ink-muted">{justPaid ? "Stripe will email your receipt. " : ""}{inv.org.name} has been notified.</p>
              </div>
            ) : canPay ? (
              <PayButton token={token} label={`Pay ${money(inv.balance, cur, { cents: true })} by card`} colour={colour} />
            ) : (
              <p className="text-center text-[0.875rem] text-ink-muted">
                {!stripeReady ? `Online card payment isn't available for this invoice. Please contact ${inv.org.name} to pay.` : "This invoice can't be paid online."}
              </p>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-[0.75rem] text-ink-faint">
          Questions? Contact {inv.org.name}{inv.org.contact_email ? ` · ${inv.org.contact_email}` : ""}{inv.org.contact_phone ? ` · ${inv.org.contact_phone}` : ""}
        </p>
      </div>
    </main>
  );
}
