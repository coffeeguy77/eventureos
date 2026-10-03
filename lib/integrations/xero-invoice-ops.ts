import "server-only";
import { ApiError, apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { XERO_API, tenantId, type XeroInvoice } from "@/lib/integrations/xero";
import { xeroReason } from "@/lib/integrations/xero-recode";

/**
 * Changes to an invoice that lives in Xero, made from EventureOS:
 *   GET  /Invoices/{id}                    check its status and what's been paid first
 *   POST /Invoices/{id}                    { Invoices: [{ InvoiceID, Status: "VOIDED" | "DELETED" }] }
 *   PUT  /CreditNotes                      an ACCRECCREDIT credit note for the amount being written off
 *   PUT  /CreditNotes/{id}/Allocations     allocate it against the invoice
 * https://developer.xero.com/documentation/api/accounting/invoices · …/creditnotes
 */

const headers = (ctx: SyncContext) => ({ "xero-tenant-id": tenantId(ctx), "content-type": "application/json" });

async function getInvoice(ctx: SyncContext, id: string) {
  const r = await apiJSON<{ Invoices?: XeroInvoice[] }>(ctx, `${XERO_API}/Invoices/${encodeURIComponent(id)}`, { headers: { "xero-tenant-id": tenantId(ctx) } }, "Xero get invoice");
  const inv = r.Invoices?.[0];
  if (!inv) throw new Error("Xero couldn't find that invoice.");
  return inv;
}

/** Void (or, for a Xero draft, delete) an invoice nothing has been paid on. Returns what Xero now says. */
export async function voidInXero(ctx: SyncContext, xeroInvoiceId: string): Promise<"VOIDED" | "DELETED"> {
  const inv = await getInvoice(ctx, xeroInvoiceId);
  if (inv.Status === "VOIDED" || inv.Status === "DELETED") return inv.Status;
  if ((inv.AmountPaid ?? 0) > 0 || (inv.AmountCredited ?? 0) > 0) {
    throw new Error("Xero shows money paid or credited on this invoice, so it can't be voided. Credit the balance instead.");
  }
  const status = inv.Status === "DRAFT" || inv.Status === "SUBMITTED" ? "DELETED" : "VOIDED";
  try {
    await apiJSON(ctx, `${XERO_API}/Invoices/${encodeURIComponent(xeroInvoiceId)}`, {
      method: "POST", headers: headers(ctx), body: JSON.stringify({ Invoices: [{ InvoiceID: xeroInvoiceId, Status: status }] }),
    }, "Xero void invoice");
  } catch (e) {
    throw new Error(`Xero wouldn't ${status === "DELETED" ? "delete" : "void"} it: ${xeroReason(e)}`);
  }
  return status;
}

/** Make a credit note in Xero for `amount` (inc GST) and allocate it to the invoice. Returns its id and number. */
export async function creditInXero(ctx: SyncContext, xeroInvoiceId: string, amount: number, date: string, reason: string): Promise<{ id: string; number: string | null }> {
  const inv = await getInvoice(ctx, xeroInvoiceId);
  if (inv.Status !== "AUTHORISED") throw new Error(`The invoice is ${inv.Status.toLowerCase()} in Xero — only approved, unpaid balances can be credited.`);
  const due = inv.AmountDue ?? 0;
  if (amount > due + 0.001) throw new Error(`Xero shows only ${due.toFixed(2)} owing on this invoice.`);
  const s = (ctx.integration.settings ?? {}) as { sales_account_code?: string; tax_type?: string };
  let id: string | undefined, number: string | null = null;
  try {
    const r = await apiJSON<{ CreditNotes?: { CreditNoteID: string; CreditNoteNumber?: string }[] }>(ctx, `${XERO_API}/CreditNotes`, {
      method: "PUT", headers: headers(ctx),
      body: JSON.stringify({ CreditNotes: [{
        Type: "ACCRECCREDIT", Contact: { ContactID: inv.Contact?.ContactID }, Date: date, Status: "AUTHORISED",
        Reference: `${inv.InvoiceNumber ?? ""} — ${reason}`.slice(0, 255), LineAmountTypes: "Inclusive", CurrencyCode: inv.CurrencyCode,
        LineItems: [{ Description: `Credit for ${inv.InvoiceNumber ?? "invoice"}: ${reason}`.slice(0, 4000), Quantity: 1, UnitAmount: amount,
          AccountCode: s.sales_account_code || "200", TaxType: s.tax_type || "OUTPUT" }],
      }] }),
    }, "Xero create credit note");
    id = r.CreditNotes?.[0]?.CreditNoteID;
    number = r.CreditNotes?.[0]?.CreditNoteNumber ?? null;
  } catch (e) {
    throw new Error(`Xero wouldn't make the credit note: ${xeroReason(e)}`);
  }
  if (!id) throw new Error("Xero didn't return the credit note.");
  try {
    await apiJSON(ctx, `${XERO_API}/CreditNotes/${encodeURIComponent(id)}/Allocations`, {
      method: "PUT", headers: headers(ctx), body: JSON.stringify({ Allocations: [{ Amount: amount, Invoice: { InvoiceID: xeroInvoiceId }, Date: date }] }),
    }, "Xero allocate credit note");
  } catch (e) {
    const why = e instanceof ApiError ? xeroReason(e) : String(e);
    throw new Error(`Credit note ${number ?? ""} was made in Xero but couldn't be applied to the invoice (${why}). Apply it to the invoice in Xero.`);
  }
  return { id, number };
}
