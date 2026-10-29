import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { billToLines, loadBillTo } from "@/lib/customers/bill-to";
import { lineAmount, startLines } from "./lines";
import { quoteItemsForInvoice } from "./quote-lines";
import { methodLabel } from "@/lib/payments/receipt-pdf";
import { buildInvoicePdf, lineTaxMode, type DocLine } from "./document-pdf";

/**
 * The invoice PDF (a tax invoice; once paid it shows the payments, the date paid and a zero balance).
 * Callers check who's asking first (customer portal, the private pay link, or staff).
 */
async function logoBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    return b.length < 3_000_000 && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8)) ? b : null;
  } catch { return null; }
}

const KIND: Record<string, string> = { deposit: "Deposit", final: "Final invoice", full: "Invoice", other: "Invoice" };

export async function invoicePdf(invoiceId: string): Promise<{ bytes: Uint8Array; file: string; paid: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return null;
  const db = createServiceClient();
  const { data: inv } = await db.from("invoices").select("id, organisation_id, number, kind, issue_date, due_date, subtotal, tax_total, total, amount_paid, balance, status, currency, reference, line_items, customer_id, event_id, quote_id, xero_invoice_id, created_by, origin, pay_token").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status === "draft") return null;
  const [{ data: org }, { data: pays }, cr, ev] = await Promise.all([
    db.from("organisations").select("name, address, contact_phone, contact_email, website, brand_colour, logo_url, settings").eq("id", inv.organisation_id).maybeSingle(),
    db.from("payments").select("amount, paid_at, method, reference, created_at").eq("invoice_id", inv.id).order("paid_at", { ascending: true }).order("created_at", { ascending: true }),
    db.from("invoice_credits").select("amount, credit_date, number, reason").eq("invoice_id", inv.id).order("credit_date", { ascending: true }),
    inv.event_id ? db.from("events").select("name, event_date, primary_contact_id").eq("id", inv.event_id).maybeSingle().then((r) => r.data as { name: string; event_date: string | null; primary_contact_id: string | null } | null) : Promise.resolve(null),
  ]);
  if (!org) return null;
  const [bill, logo] = await Promise.all([
    inv.customer_id ? loadBillTo(db, inv.organisation_id, inv.customer_id, ev?.primary_contact_id ?? null).catch(() => null) : Promise.resolve(null),
    logoBytes(org.logo_url as string | null),
  ]);

  const lines = await invoiceLines(db, inv as InvForLines, ev?.name ?? null);
  const lineTax = lineTaxMode(lines, Number(inv.subtotal), Number(inv.total));

  const settings = (org.settings ?? {}) as { business?: { abn?: unknown } };
  const abn = typeof settings.business?.abn === "string" ? settings.business.abn : null;
  const payments = ((pays ?? []) as { amount: number; paid_at: string; method: string | null; reference: string | null }[]).map((p) => ({ date: p.paid_at, label: methodLabel(p.method, p.reference), amount: Number(p.amount) }));
  const credits = cr.error ? [] : ((cr.data ?? []) as { amount: number; credit_date: string | null; number: string | null; reason: string | null }[]).map((c) => ({ date: c.credit_date ?? "", label: c.number ?? "Credit note", amount: Number(c.amount) }));
  const balance = Number(inv.balance);
  const paid = balance <= 0.004 && inv.status !== "void";
  const bytes = await buildInvoicePdf({
    org: { name: org.name as string, abn, address: org.address as string | null, phone: org.contact_phone as string | null, email: org.contact_email as string | null, website: org.website as string | null, brand: org.brand_colour as string | null, logo },
    billTo: billToLines(bill),
    invoice: { number: (inv.number as string) || "Invoice", issueDate: inv.issue_date as string | null, dueDate: inv.due_date as string | null, reference: inv.reference as string | null,
      eventLabel: ev ? `${ev.name}${ev.event_date ? ` · ${new Date(`${ev.event_date}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : ""}` : null,
      currency: (inv.currency as string) || "AUD", subtotal: Number(inv.subtotal), taxTotal: Number(inv.tax_total), total: Number(inv.total), balance, status: inv.status as string },
    lines, lineTax, payments, credits, payUrl: paid ? null : `${appBaseUrl()}/pay/${inv.pay_token}`,
  });
  return { bytes, paid, file: `${paid ? "Paid tax invoice" : "Tax invoice"} ${inv.number ?? ""}.pdf`.replace(/\s+\.pdf$/, ".pdf") };
}

type InvForLines = { organisation_id: string; kind: string; total: number; line_items: unknown; xero_invoice_id: string | null; quote_id: string | null; created_by: string | null; origin?: string | null };

/** What was bought: the invoice's own lines (GST inclusive) or, for one brought in from Xero, Xero's lines. */
export async function invoiceLines(db: ReturnType<typeof createServiceClient>, inv: InvForLines, eventName: string | null): Promise<DocLine[]> {
  const fromXero = inv.origin ? inv.origin === "xero" : !!inv.xero_invoice_id && !inv.quote_id && !inv.created_by && inv.kind === "other";
  const label = `${KIND[inv.kind as string] ?? "Invoice"}${eventName ? ` - ${eventName}` : ""}`;
  let lines: DocLine[];
  if (!fromXero) {
    const own = startLines({ kind: inv.kind as string, total: Number(inv.total), line_items: inv.line_items, xero_invoice_id: inv.xero_invoice_id as string | null, label },
      await quoteItemsForInvoice(db, inv.organisation_id, inv.quote_id as string | null).catch(() => null));
    lines = own.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit: Number(l.unit_amount), amount: lineAmount(l) }));
  } else {
    const raw = Array.isArray(inv.line_items) ? (inv.line_items as Record<string, unknown>[]) : [];
    lines = raw.map((l) => {
      const q = l.quantity == null ? null : Number(l.quantity), u = l.unit_amount == null ? null : Number(l.unit_amount);
      const a = l.line_amount != null ? Number(l.line_amount) : q != null && u != null ? Math.round(q * u * 100) / 100 : null;
      return { description: String(l.description ?? "").trim() || label, quantity: q, unit: u, amount: a };
    });
    if (!lines.length) lines = [{ description: label, quantity: 1, unit: null, amount: null }];
  }
  return lines;
}
