/**
 * Invoice lines written in EventureOS (so an invoice can be changed after it's raised — extra items, different quantities).
 * Stored in invoices.line_items, amounts INCLUDING GST, each marked `inc: true` so a Xero sync never overwrites them.
 * Pure — used by the invoice page, the save action and tests.
 */

export interface InvLine {
  description: string;
  quantity: number;
  unit_amount: number;        // per unit, GST inclusive
  tax_rate: 0 | 10;
  item_code?: string | null;  // Xero item code (from the price list)
  account_code?: string | null;
  service_id?: string | null;
  inc: true;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const lineAmount = (l: Pick<InvLine, "quantity" | "unit_amount">) => r2(Number(l.quantity) * Number(l.unit_amount));

/** Total, subtotal (ex GST) and GST for a set of lines. */
export function lineTotals(lines: Pick<InvLine, "quantity" | "unit_amount" | "tax_rate">[]) {
  let total = 0, subtotal = 0;
  for (const l of lines) {
    const g = lineAmount(l);
    total += g;
    subtotal += l.tax_rate ? r2(g / (1 + l.tax_rate / 100)) : g;
  }
  total = r2(total); subtotal = r2(subtotal);
  return { total, subtotal, tax: r2(total - subtotal) };
}

/** Accept only well-formed lines from the browser. Throws a plain-English message. */
export function cleanLines(raw: unknown): InvLine[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Add at least one line.");
  if (raw.length > 100) throw new Error("That's too many lines (100 at most).");
  return raw.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const description = String(o.description ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    const quantity = Number(o.quantity), unit = Number(o.unit_amount);
    if (!description) throw new Error(`Line ${i + 1} needs a description.`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error(`Line ${i + 1}: enter a quantity above zero.`);
    if (!Number.isFinite(unit) || Math.abs(unit) > 1_000_000) throw new Error(`Line ${i + 1}: enter a price.`);
    if (Math.abs(unit * 100 - Math.round(unit * 100)) > 1e-6) throw new Error(`Line ${i + 1}: prices can have at most two decimal places.`);
    const code = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const sid = typeof o.service_id === "string" && /^[0-9a-f-]{36}$/i.test(o.service_id) ? o.service_id : null;
    return { description, quantity: Math.round(quantity * 10000) / 10000, unit_amount: r2(unit), tax_rate: Number(o.tax_rate) === 0 ? 0 : 10,
      item_code: code(o.item_code, 30), account_code: code(o.account_code, 10), service_id: sid, inc: true } as InvLine;
  });
}

export interface QuoteItemForInvoice {
  name: string; description: string | null; quantity: number; tax_rate: number; line_total: number; is_optional: boolean; section_optional?: boolean;
  service_id?: string | null; code?: string | null; account?: string | null;
}

/**
 * The lines an invoice starts from when it's first edited:
 *   its own edited lines → else, for a full invoice from a quote, the quote's lines (if they add up to the invoice)
 *   → else lines written on it here (e.g. a course booking) → else one line for the whole amount.
 */
export function startLines(inv: { kind: string; total: number; line_items: unknown; xero_invoice_id: string | null; label: string },
  quoteItems: QuoteItemForInvoice[] | null): InvLine[] {
  const own = Array.isArray(inv.line_items) ? (inv.line_items as Record<string, unknown>[]) : [];
  if (own.length && own[0]?.inc) { try { return cleanLines(own); } catch { /* fall through */ } }
  if (inv.kind === "full" && quoteItems?.length) {
    const lines = quoteItems.filter((q) => !q.is_optional && !q.section_optional && q.name.trim() && Number(q.quantity) > 0).map((q) => ({
      description: [q.name.trim(), q.description?.trim()].filter(Boolean).join("\n"),
      quantity: Number(q.quantity), unit_amount: r2((Number(q.line_total) * (1 + Number(q.tax_rate) / 100)) / Number(q.quantity)),
      tax_rate: (Number(q.tax_rate) > 0 ? 10 : 0) as 0 | 10, item_code: q.code ?? null, account_code: q.account ?? null, service_id: q.service_id ?? null, inc: true as const,
    }));
    if (lines.length && Math.abs(lineTotals(lines).total - Number(inv.total)) <= 0.02) return lines;
  }
  // Written here (not synced back from Xero) — e.g. agency course bookings, amounts inc GST
  if (own.length && !inv.xero_invoice_id) {
    try {
      const lines = cleanLines(own.map((l) => ({ ...l, tax_rate: l.tax_rate ?? 10 })));
      if (Math.abs(lineTotals(lines).total - Number(inv.total)) <= 0.02) return lines;
    } catch { /* fall through */ }
  }
  return [{ description: inv.label, quantity: 1, unit_amount: r2(Number(inv.total)), tax_rate: 10, inc: true }];
}

/** "added ‘Cup stickers’, removed ‘Van hire’, changed 2 lines" — for the activity log. */
export function linesChangeSummary(before: InvLine[], after: InvLine[]) {
  const name = (l: InvLine) => l.description.split("\n")[0].slice(0, 60);
  const key = (l: InvLine) => name(l).toLowerCase();
  const was = new Map(before.map((l) => [key(l), l]));
  const now = new Map(after.map((l) => [key(l), l]));
  const added = after.filter((l) => !was.has(key(l))).map((l) => `‘${name(l)}’`);
  const removed = before.filter((l) => !now.has(key(l))).map((l) => `‘${name(l)}’`);
  const changed = after.filter((l) => { const b = was.get(key(l)); return b && (b.quantity !== l.quantity || b.unit_amount !== l.unit_amount || b.description !== l.description || b.tax_rate !== l.tax_rate); }).length;
  return [added.length ? `added ${added.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : "", changed ? `changed ${changed} line${changed === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") || "updated the lines";
}
