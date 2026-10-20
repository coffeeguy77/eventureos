/**
 * Read an Ordermentum order email ("Invoice - <Business> #OMI2706" from notifications@ordermentum.com).
 * Pure — used by the Gmail import and tests. Returns null when it isn't an order email; `problems` lists anything that
 * didn't add up, so the order can be flagged for a look rather than dropped.
 */

export interface OmLine { name: string; quantity: number; unit_price: number; line_total: number }
export interface OmOrder {
  invoiceNumber: string;          // OMI2706
  orderNumber: string;            // OMO2706
  orderDate: string | null;       // 2026-10-20
  deliveryDate: string | null;
  customerBlock: string;          // the "To" block, for matching the customer
  customerName: string;           // best guess at the name (first line of the To block)
  phone: string | null;
  shipTo: string | null;          // a delivery address given for the customer
  lines: OmLine[];
  subtotal: number | null; freight: number; gst: number; surcharge: number; discount: number; total: number | null;
  problems: string[];
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function date(s: string | undefined): string | null {
  const m = s && /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(s);
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
}
const money = (s: string | undefined) => (s == null ? null : Number(s.replace(/[$,\s]/g, "")));
const amountAfter = (flat: string, label: string) => {
  const m = new RegExp(`\\b${label}\\s+\\$\\s*(-?[\\d,]+\\.\\d{2})`, "i").exec(flat);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

export function parseOrdermentumEmail(subject: string | null, text: string): OmOrder | null {
  const inv = /#?\s*(OMI\d+)/i.exec(subject ?? "") ?? /TAX INVOICE\s+(OMI\d+)/i.exec(text);
  if (!inv) return null;
  const invoiceNumber = inv[1].toUpperCase();
  const flat = text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const problems: string[] = [];

  const orderNumber = (/Order number\s*#?\s*(OMO\d+)/i.exec(flat)?.[1] ?? invoiceNumber.replace(/^OMI/i, "OMO")).toUpperCase();
  const orderDate = date(/Order date\s+([^]{0,20})/i.exec(flat)?.[1]);
  const deliveryDate = date(/Delivery Date\s+([^]{0,20})/i.exec(flat)?.[1]);
  if (!orderDate) problems.push("order date not found");

  // The customer: between "To" and "From" (after the TAX INVOICE heading)
  const start = flat.search(/TAX INVOICE/i);
  const after = flat.slice(start < 0 ? 0 : start);
  const toM = /\bTo\s+([^]*?)\s+From\s/i.exec(after);
  let customerBlock = (toM?.[1] ?? "").trim();
  let shipTo: string | null = null;
  const dm = /^(.*?)\s*Delivery Address\s*(.+)$/i.exec(customerBlock);
  if (dm) { customerBlock = dm[1].trim(); shipTo = dm[2].replace(/\s*Phone:.*$/i, "").trim(); }
  const phone = /Phone:\s*([+\d][\d ()+-]{5,})/i.exec(toM?.[1] ?? "")?.[1].trim() ?? null;
  // Name: the first line of the To block in the original text when there are lines, else up to the first digit
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const toLine = lines.findIndex((l) => /^To\b/i.test(l) && l.length < 200);
  let customerName = toLine >= 0 ? lines[toLine].replace(/^To\s*/i, "").replace(/\s*Delivery Address.*$/i, "").trim() : "";
  if (!customerName || customerName.length > 120) customerName = customerBlock.split(/\s(?=\d)|Phone:/)[0].trim();
  if (!customerName) problems.push("customer not found");

  // Items: between the ITEM QTY PRICE TOTAL heading and Subtotal
  const items: OmLine[] = [];
  const iStart = flat.search(/ITEM\s+QTY\s+PRICE\s+TOTAL/i);
  const iEnd = flat.search(/\bSubtotal\s+\$/i);
  if (iStart >= 0 && iEnd > iStart) {
    const body = flat.slice(iStart, iEnd).replace(/^ITEM\s+QTY\s+PRICE\s+TOTAL\s*/i, "");
    const re = /(.+?)\s+(\d+(?:\.\d+)?)\s+\$\s*(-?[\d,]+\.\d{2})\s+\$\s*(-?[\d,]+\.\d{2})(?=\s|$)/g;
    for (let m: RegExpExecArray | null; (m = re.exec(body)); ) {
      items.push({ name: m[1].trim(), quantity: Number(m[2]), unit_price: money(m[3])!, line_total: money(m[4])! });
    }
  }
  if (!items.length) problems.push("no items found");

  const subtotal = amountAfter(flat, "Subtotal");
  const freight = amountAfter(flat, "Freight") ?? 0;
  const gst = amountAfter(flat, "GST") ?? 0;
  const surcharge = amountAfter(flat, "Surcharge") ?? 0;
  const discount = Math.abs(amountAfter(flat, "Discount") ?? 0);
  const total = amountAfter(flat, "Total");
  const sum = Math.round(items.reduce((t, l) => t + l.line_total, 0) * 100) / 100;
  if (subtotal != null && items.length && Math.abs(sum - subtotal) > 0.02) problems.push(`items add up to ${sum.toFixed(2)} but the subtotal is ${subtotal.toFixed(2)}`);
  for (const l of items) if (Math.abs(l.quantity * l.unit_price - l.line_total) > 0.02) problems.push(`${l.name}: ${l.quantity} × ${l.unit_price} isn't ${l.line_total}`);
  if (total == null) problems.push("total not found");

  return { invoiceNumber, orderNumber, orderDate, deliveryDate, customerBlock, customerName, phone, shipTo, lines: items, subtotal, freight, gst, surcharge, discount, total, problems };
}
