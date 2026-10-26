import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { billToLines, loadBillTo } from "@/lib/customers/bill-to";
import { buildReceiptPdf } from "./receipt-pdf";

/**
 * Payment receipts: one per payment against an invoice, numbered "<invoice>-R<n>" in the order the payments were made.
 * Callers check who's asking first (customer portal, the private pay link, or staff); this builds the PDF.
 */
export interface ReceiptRow { id: string; invoice_id: string; amount: number; paid_at: string; method: string | null; reference: string | null }

export const receiptNumber = (invoiceNumber: string | null, n: number) => `${invoiceNumber || "INV"}-R${n}`;

async function logoBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    return b.length < 3_000_000 && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8)) ? b : null;
  } catch { return null; }
}

/** The receipt PDF for one payment (null when it doesn't exist or isn't for an invoice). */
export async function receiptPdf(paymentId: string): Promise<{ bytes: Uint8Array; file: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const db = createServiceClient();
  const { data: p } = await db.from("payments").select("id, organisation_id, invoice_id, amount, paid_at, method, reference").eq("id", paymentId).maybeSingle();
  if (!p?.invoice_id) return null;
  const [{ data: inv }, { data: all }, { data: org }] = await Promise.all([
    db.from("invoices").select("id, number, issue_date, total, tax_total, currency, reference, line_items, customer_id, event_id, status").eq("id", p.invoice_id).maybeSingle(),
    db.from("payments").select("id, amount, paid_at, created_at").eq("invoice_id", p.invoice_id).order("paid_at", { ascending: true }).order("created_at", { ascending: true }),
    db.from("organisations").select("name, address, contact_phone, contact_email, website, brand_colour, logo_url, timezone, settings").eq("id", p.organisation_id).maybeSingle(),
  ]);
  if (!inv || !org || inv.status === "void") return null;
  const list = (all ?? []) as { id: string; amount: number }[];
  const idx = Math.max(0, list.findIndex((x) => x.id === p.id));
  const paidBefore = list.slice(0, idx).reduce((t, x) => t + Number(x.amount), 0);
  const [bill, ev, logo] = await Promise.all([
    inv.customer_id ? loadBillTo(db, p.organisation_id, inv.customer_id).catch(() => null) : Promise.resolve(null),
    inv.event_id ? db.from("events").select("name, event_date").eq("id", inv.event_id).maybeSingle().then((r) => r.data as { name: string; event_date: string | null } | null) : Promise.resolve(null),
    logoBytes(org.logo_url as string | null),
  ]);
  const bt = billToLines(bill);
  const settings = (org.settings ?? {}) as { business?: { abn?: unknown } };
  const abn = typeof settings.business?.abn === "string" ? settings.business.abn : null;
  const lines = (Array.isArray(inv.line_items) ? (inv.line_items as { description?: unknown }[]) : [])
    .map((l) => ({ description: typeof l.description === "string" ? l.description : "", amount: null }));
  const no = receiptNumber(inv.number as string | null, idx + 1);
  const bytes = await buildReceiptPdf({
    org: { name: org.name as string, abn, address: org.address as string | null, phone: org.contact_phone as string | null, email: org.contact_email as string | null, website: org.website as string | null, brand: org.brand_colour as string | null, logo },
    customer: { name: bt?.main ?? "Customer", lines: bt?.sub.slice(0, 4) },
    receiptNo: no,
    invoice: { number: (inv.number as string) || "Invoice", issueDate: inv.issue_date as string | null, total: Number(inv.total), taxTotal: Number(inv.tax_total), currency: (inv.currency as string) || "AUD",
      reference: inv.reference as string | null, eventLabel: ev ? `${ev.name}${ev.event_date ? ` · ${new Date(`${ev.event_date}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : ""}` : null },
    payment: { amount: Number(p.amount), paidAt: p.paid_at as string, method: p.method as string | null, reference: p.reference as string | null },
    paidBefore, timezone: (org.timezone as string) || "Australia/Sydney", lines,
  });
  return { bytes, file: `Receipt ${no}.pdf` };
}

export function pdfResponse(r: { bytes: Uint8Array; file: string }, download: boolean) {
  const name = r.file.replace(/[^\w .-]+/g, "");
  return new Response(Buffer.from(r.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "cache-control": "private, no-store" } });
}
