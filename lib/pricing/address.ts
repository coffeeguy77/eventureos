import type { PdfLine } from "./pdf-text";

/**
 * The "deliver to" address printed on an invoice — how a business with several stores tells which
 * store an order went to. Looks for a heading such as "Deliver To", "Delivery Address", "Ship To"
 * or "Delivery Point" and reads the lines underneath it in the same column.
 */
const HEADING = /^(deliver(?:y)?\s*(?:to|address|addr\.?|point|location|details)|ship(?:ping)?\s*(?:to|address)|delivered\s*to|consignee)\b\s*:?\s*/i;
// lines that start the next block, not more address
const STOP = /^(invoice|tax invoice|date|due|account|acct|customer\s*(no|number|code|id)|order|p\.?o\.?\b|purchase order|phone|ph\b|tel|fax|mob|email|e-mail|abn|acn|bill\s*to|sold\s*to|invoice\s*to|terms|page|rep\b|salesperson|route|run\b|driver|instructions?|notes?|qty|code|description|item|contact|attention|attn)/i;
const HAS_ADDRESS_BITS = /\d|\b(st|street|rd|road|ave|avenue|pl|place|dr|drive|cres|crescent|cct|circuit|hwy|highway|lane|ln|pde|parade|tce|terrace|blvd|way|shop|unit|level|suite|act|nsw|vic|qld|sa|wa|tas|nt)\b/i;

export function deliveryAddress(lines: PdfLine[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const cellIdx = lines[i].cells.findIndex((c) => HEADING.test(c.text.trim()));
    if (cellIdx < 0) continue;
    const cell = lines[i].cells[cellIdx];
    const parts: string[] = [];
    const rest = cell.text.trim().replace(HEADING, "").trim();
    if (rest) parts.push(rest);
    else {
      // "Deliver To:" then the address in the next cell on the same row
      const next = lines[i].cells[cellIdx + 1];
      if (next && !HEADING.test(next.text) && !STOP.test(next.text.trim()) && HAS_ADDRESS_BITS.test(next.text)) parts.push(next.text.trim());
    }
    const x = parts.length && !rest && lines[i].cells[cellIdx + 1] ? lines[i].cells[cellIdx + 1].x : cell.x;
    for (let j = i + 1; j < Math.min(lines.length, i + 7) && parts.length < 5; j++) {
      if (lines[j].page !== lines[i].page) break;
      const c = lines[j].cells.find((k) => Math.abs(k.x - x) <= 14) ?? (x !== cell.x ? lines[j].cells.find((k) => Math.abs(k.x - cell.x) <= 14) : undefined);
      if (!c) { if (parts.length) break; continue; }
      const t = c.text.trim();
      if (!t || STOP.test(t) || HEADING.test(t) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t)) break;
      // the row has moved on to another labelled field (e.g. "Invoice Date   12/09/2026")
      const left = lines[j].cells.filter((k) => k.x < c.x).pop();
      if (left && left.text.trim().length <= 24 && !/\d/.test(left.text) && STOP.test(left.text.trim())) break;
      parts.push(t);
    }
    const text = parts.join(", ").replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();
    if (text && HAS_ADDRESS_BITS.test(text)) return text.slice(0, 300);
  }
  return null;
}
