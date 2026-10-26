import { pdfToLines, type PdfLine } from "./pdf-text";
import { deliveryAddress } from "./address";

/**
 * Invoice readers. Each supplier prints its invoice differently, so each has a reader tuned to
 * its layout; "generic" handles any invoice with a QTY / DESCRIPTION header row.
 *  - longpark: LongPark Meat Co (own invoice template)
 *  - bidfood:  Bidfood (sections FROZEN / CHILLER / DRY printed on the invoice)
 *  - fresho:   any supplier that invoices through Fresho (e.g. Temroug / Little Big Dairy)
 */
export type ParserId = "longpark" | "bidfood" | "fresho" | "generic";

export interface ParsedItem {
  lineNo: number;
  code: string | null;
  description: string;
  qty: number | null;
  unit: string | null;
  section: string | null;
  /** price per invoice unit, ex GST (e.g. $/kg for LongPark, $/CTN for Bidfood) */
  unitPrice: number | null;
  /** line total ex GST */
  lineTotal: number | null;
  /** pack description used to work out price per kg / litre, e.g. "5kg", "200x7gr", "CTN (6 x 2L)" */
  packSize: string | null;
}

export interface ParsedInvoice {
  parser: ParserId;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // yyyy-mm-dd
  /** "Deliver to" address — tells a multi-store business which store the order is for */
  deliveryAddress?: string | null;
  items: ParsedItem[];
  skipped: string[]; // fee lines etc. that aren't food
  warnings: string[];
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** dd/mm/yyyy, dd/mm/yy or "24 Sep 2026" → yyyy-mm-dd (Australian day-first). */
export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  let m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[2]), d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
  return null;
}

const num = (s: string | undefined | null) => {
  if (!s) return null;
  const v = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : null;
};
const isMoney = (s: string) => /^-?\$?\d[\d,]*\.\d{2}\s*\*?$/.test(s.trim());
const isQty = (s: string) => /^\d+(\.\d+)?$/.test(s.trim());

/** Delivery fees, freight, levies — never food. */
export function isFeeLine(desc: string, code?: string | null) {
  // anchored to the start so products like "Chips Supa Crunch Delivery" aren't mistaken for a fee
  return /^(delivery (fee|charge)|delivery$|freight|fuel levy|fuel surcharge|levy|surcharge|card fee|credit card|merchant fee|admin fee|handling|pallet|rounding|minimum order)/i.test(desc.trim())
    || (!!code && /^(DF|DEL|FRT|FREIGHT|FUEL)$/i.test(code.trim()));
}

function detect(text: string, filename?: string): ParserId {
  if (/BIDFOOD/i.test(text)) return "bidfood";
  if (/LongPark/i.test(text)) return "longpark";
  if (/fresho/i.test(filename ?? "") || /Scan to record delivery|Scan to place your next order/i.test(text)) return "fresho";
  return "generic";
}

export async function parseInvoicePdf(data: Uint8Array, opts: { parser?: ParserId; filename?: string } = {}): Promise<ParsedInvoice> {
  const lines = await pdfToLines(data);
  return parseInvoiceLines(lines, opts);
}

export function parseInvoiceLines(lines: PdfLine[], opts: { parser?: ParserId; filename?: string } = {}): ParsedInvoice {
  const text = lines.map((l) => l.text).join("\n");
  const parser = opts.parser && opts.parser !== "generic" ? opts.parser : detect(text, opts.filename);
  const res = parser === "bidfood" ? bidfood(lines, text) : parser === "longpark" ? longpark(lines, text)
    : parser === "fresho" ? fresho(lines, text) : generic(lines, text);
  res.deliveryAddress = deliveryAddress(lines);
  if (!res.items.length) res.warnings.push("No line items could be read from this invoice — add the items by hand.");
  if (!res.invoiceNumber) res.warnings.push("Couldn't find the invoice number.");
  if (!res.invoiceDate) res.warnings.push("Couldn't find the invoice date.");
  return res;
}

// ------------------------------------------------------------------------------------------------
// Column helpers: text columns are left-aligned, so a cell belongs to a column when it starts at
// (or just after) that column's header.
// ------------------------------------------------------------------------------------------------
function headerX(line: PdfLine, re: RegExp) {
  return line.cells.find((c) => re.test(c.text))?.x ?? null;
}
const near = (x: number, target: number | null, tol = 8) => target !== null && Math.abs(x - target) <= tol;

// ------------------------------------------------------------------------------------------------
// LongPark Meat Co
// QTY. | ITEM NO. | DESCRIPTION | (EX) PRICE | UNIT | EXTENDED PRICE | CODE
// ------------------------------------------------------------------------------------------------
function longpark(lines: PdfLine[], text: string): ParsedInvoice {
  const out: ParsedInvoice = { parser: "longpark", supplierName: "LongPark Meat Co", invoiceNumber: null, invoiceDate: null, items: [], skipped: [], warnings: [] };
  out.invoiceNumber = text.match(/Invoice\s*#:?\s+(\w+)/i)?.[1] ?? null;
  out.invoiceDate = parseDate(text.match(/\bDate:\s+([\d/]+)/)?.[1]);
  let hx: { item: number | null; desc: number | null } | null = null;
  let last: ParsedItem | null = null;
  for (const l of lines) {
    if (/^QTY\.?\b/i.test(l.cells[0]?.text ?? "") && /DESCRIPTION/i.test(l.text)) {
      hx = { item: headerX(l, /^ITEM/i), desc: headerX(l, /^DESCRIPTION/i) }; last = null; continue;
    }
    if (!hx) continue;
    if (/SALE AMT|TOTAL AMT|Please quote/i.test(l.text)) { hx = null; continue; }
    const first = l.cells[0];
    if (first && isQty(first.text) && l.cells.some((c) => isMoney(c.text))) {
      const code = l.cells.find((c) => near(c.x, hx!.item))?.text ?? null;
      const desc = l.cells.find((c) => near(c.x, hx!.desc))?.text ?? "";
      const moneyIdx = l.cells.findIndex((c) => isMoney(c.text));
      const unit = l.cells.slice(moneyIdx + 1).find((c) => !isMoney(c.text) && /^[a-z]{1,6}$/i.test(c.text))?.text ?? null;
      const money = l.cells.filter((c) => c.text.trim().startsWith("$") && isMoney(c.text)).map((c) => num(c.text));
      const item: ParsedItem = { lineNo: out.items.length + 1, code, description: desc || code || "Item", qty: num(first.text), unit: unit?.toLowerCase() ?? null, section: null,
        unitPrice: money[0] ?? null, lineTotal: money.length > 1 ? money[money.length - 1] : null, packSize: null };
      if (isFeeLine(item.description, code)) { out.skipped.push(item.description); last = null; continue; }
      out.items.push(item); last = item;
    } else if (last && l.cells.length <= 2) {
      // wrapped text under ITEM NO. or DESCRIPTION
      for (const c of l.cells) {
        if (near(c.x, hx.item) && last.code) last.code = `${last.code} ${c.text}`;
        else if (near(c.x, hx.desc)) last.description = `${last.description} ${c.text}`;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Bidfood — every word is placed separately, so columns come from the header x positions.
// Code | Product Description | Brand | Pack Size | Unit of Measure | Quantity Supplied | prices…
// Section banners: ****** FROZEN ****** / CHILLER / DRY
// ------------------------------------------------------------------------------------------------
function bidfood(lines: PdfLine[], text: string): ParsedInvoice {
  const out: ParsedInvoice = { parser: "bidfood", supplierName: "Bidfood", invoiceNumber: null, invoiceDate: null, items: [], skipped: [], warnings: [] };
  out.invoiceNumber = text.match(/Document No:?\s+([A-Z]?\d+)/i)?.[1] ?? null;
  out.invoiceDate = parseDate(text.match(/Invoice Date\s+([\d/]+)/i)?.[1]);
  let cols: { desc: number; brand: number; pack: number; uom: number; qty: number; price: number } | null = null;
  let top: PdfLine | null = null;
  let section: string | null = null;
  for (const l of lines) {
    if (/\bBrand\b/.test(l.text) && /Quantity/.test(l.text)) { top = l; continue; }
    if (top && /^Code$/i.test(l.cells[0]?.text ?? "") && /Description/i.test(l.text)) {
      const g = (line: PdfLine, re: RegExp) => headerX(line, re) ?? 0;
      cols = {
        desc: g(l, /^Product/i), brand: g(top, /^Brand/i), pack: g(top, /^Pack/i), uom: g(top, /^Unit of/i),
        qty: g(top, /^Quantity/i), price: g(l, /^Price/i) || g(top, /^Unit$/i),
      };
      continue;
    }
    if (!cols) continue;
    const banner = l.text.match(/^\*+\s+([A-Z][A-Z &]+?)\s+\*+$/);
    if (banner) { section = banner[1].trim(); continue; }
    if (/^\*+$/.test(l.text.trim()) || /Totals/.test(l.text)) { section = null; continue; }
    const first = l.cells[0];
    if (!first || !/^\d{2,}$/.test(first.text) || first.x > cols.desc - 5) continue;
    const words = (lo: number, hi: number) => l.cells.filter((c) => c.x >= lo - 3 && c.x < hi - 3).map((c) => c.text).join(" ").trim();
    const desc = words(cols.desc - 12, cols.brand);
    const qtyCell = l.cells.find((c) => c.x >= cols!.qty - 3 && c.x < cols!.price - 3);
    // after the quantity: Unit Price | Price | Excl. GST Value | GST Value | Total Value
    const nums = l.cells.filter((c) => c.x >= cols!.price - 12 && /^-?\d[\d,]*\.\d{2}$/.test(c.text)).map((c) => num(c.text));
    const pack = words(cols.pack - 5, cols.uom); // sizes sit a few points left of the "Pack" heading
    const uom = words(cols.uom, cols.qty);
    const item: ParsedItem = {
      lineNo: out.items.length + 1, code: first.text, description: titleCase(desc), qty: num(qtyCell?.text),
      unit: [pack, uom].filter(Boolean).join(" ") || null, section,
      unitPrice: nums[0] ?? null, lineTotal: nums.length >= 3 ? nums[2] : nums[nums.length - 1] ?? null,
      packSize: /^kg$/i.test(uom) ? "per kg" : pack || null,
    };
    if (isFeeLine(item.description, item.code)) { out.skipped.push(item.description); continue; }
    out.items.push(item);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Fresho (Temroug / Little Big Dairy and other Fresho suppliers)
// QTY | CODE | DESCRIPTION | UNIT | UNIT PRICE | AMOUNT
// ------------------------------------------------------------------------------------------------
function fresho(lines: PdfLine[], text: string): ParsedInvoice {
  const out: ParsedInvoice = { parser: "fresho", supplierName: null, invoiceNumber: null, invoiceDate: null, items: [], skipped: [], warnings: [] };
  // supplier = the "… Pty Ltd" line in the letterhead that isn't the customer
  out.supplierName = lines.flatMap((l) => l.cells).find((c) => /^[A-Z][\w&'. -]{1,60}\s+Pty\.?\s+Ltd\.?$/i.test(c.text))?.text ?? null;
  out.invoiceNumber = text.match(/\b(F\d{6,})\b/)?.[1] ?? text.match(/Invoice Number\s+(\S+)/i)?.[1] ?? null;
  const dateIdx = lines.findIndex((l) => /Invoice Date/i.test(l.text));
  for (let i = Math.max(0, dateIdx); i < Math.min(lines.length, dateIdx + 4) && !out.invoiceDate; i++) out.invoiceDate = parseDate(lines[i].text);
  let hx: { code: number | null; desc: number | null } | null = null;
  let last: ParsedItem | null = null;
  for (const l of lines) {
    if (/^QTY$/i.test(l.cells[0]?.text ?? "") && /DESCRIPTION/i.test(l.text)) { hx = { code: headerX(l, /^CODE$/i), desc: headerX(l, /^DESCRIPTION/i) }; continue; }
    if (!hx) continue;
    if (/Subtotal|Total \(incl/i.test(l.text)) { hx = null; continue; }
    const first = l.cells[0];
    if (first && isQty(first.text) && l.cells.some((c) => isMoney(c.text))) {
      const code = l.cells.find((c) => near(c.x, hx!.code))?.text ?? null;
      const descCell = l.cells.find((c) => near(c.x, hx!.desc, 10));
      const moneyIdx = l.cells.findIndex((c) => isMoney(c.text));
      const descIdx = descCell ? l.cells.indexOf(descCell) : -1;
      const unit = descIdx >= 0 && moneyIdx > descIdx + 1 ? l.cells.slice(descIdx + 1, moneyIdx).map((c) => c.text).join(" ") : null;
      const money = l.cells.filter((c) => c.text.trim().startsWith("$") && isMoney(c.text)).map((c) => num(c.text));
      const item: ParsedItem = { lineNo: out.items.length + 1, code, description: descCell?.text ?? code ?? "Item", qty: num(first.text), unit, section: null,
        unitPrice: money[0] ?? null, lineTotal: money.length > 1 ? money[money.length - 1] : null, packSize: unit };
      if (isFeeLine(item.description, code)) { out.skipped.push(item.description); last = null; continue; }
      out.items.push(item); last = item;
    } else if (last && l.cells.length === 1 && near(l.cells[0].x, hx.desc, 10)) {
      last.description = `${last.description} ${l.cells[0].text}`;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Generic: find a header row with a quantity column and a description column.
// ------------------------------------------------------------------------------------------------
function generic(lines: PdfLine[], text: string): ParsedInvoice {
  const out: ParsedInvoice = { parser: "generic", supplierName: null, invoiceNumber: null, invoiceDate: null, items: [], skipped: [], warnings: [] };
  out.invoiceNumber = text.match(/(?:Invoice|Tax Invoice|Document)\s*(?:No\.?|Number|#)\s*:?\s*([A-Z]*-?\d[\w-]*)/i)?.[1] ?? null;
  out.invoiceDate = parseDate(text.match(/(?:Invoice\s+)?Date\s*:?\s+([^\n]{6,20})/i)?.[1]) ?? parseDate(text);
  let hx: { desc: number; code: number | null; qty: number | null } | null = null;
  for (const l of lines) {
    const d = headerX(l, /^(DESCRIPTION|Product Description|Item Description|Product|Item)$/i);
    const q = headerX(l, /^(QTY\.?|Quantity|Qty Supplied|Units)$/i);
    if (d !== null && q !== null) { hx = { desc: d, code: headerX(l, /^(CODE|ITEM NO\.?|SKU|Product Code)$/i), qty: q }; continue; }
    if (!hx) continue;
    if (/sub-?total|total|amount due|balance/i.test(l.text) && !l.cells.some((c) => near(c.x, hx!.desc, 10) && /[a-z]{3}/i.test(c.text) && !/total/i.test(c.text))) { hx = null; continue; }
    if (!l.cells.some((c) => isMoney(c.text))) continue;
    const descCell = l.cells.find((c) => near(c.x, hx!.desc, 12) && /[a-z]{2}/i.test(c.text));
    if (!descCell) continue;
    const qtyCell = l.cells.find((c) => isQty(c.text) && hx!.qty !== null && Math.abs(c.x - hx!.qty) < 40);
    const code = hx.code !== null ? l.cells.find((c) => near(c.x, hx!.code, 10))?.text ?? null : null;
    const money = l.cells.filter((c) => isMoney(c.text)).map((c) => num(c.text));
    const item: ParsedItem = { lineNo: out.items.length + 1, code, description: descCell.text, qty: num(qtyCell?.text), unit: null, section: null,
      unitPrice: money[0] ?? null, lineTotal: money.length > 1 ? money[money.length - 1] : null, packSize: null };
    if (isFeeLine(item.description, code)) { out.skipped.push(item.description); continue; }
    out.items.push(item);
  }
  return out;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(P\/c|Iqf|Uht)\b/gi, (m) => m.toUpperCase());
}
