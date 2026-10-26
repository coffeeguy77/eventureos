import "server-only";
import { ANTHROPIC_URL, aiModel, anthropicHeaders, parseJSONObject } from "@/lib/ai/claude";
import { isFeeLine, parseDate, type ParsedInvoice, type ParsedItem } from "./parse";

/**
 * Read an invoice PDF with Claude when no layout reader understands it (any supplier, any template).
 * The PDF goes to the Messages API as a document block: https://platform.claude.com/docs/en/build-with-claude/pdf-support
 * Only what's printed is used — prices are copied, never worked out or guessed.
 */
const SYSTEM = `You read Australian supplier tax invoices and copy out the line items exactly as printed.
Return ONLY a JSON object:
{"supplier": string|null, "invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null (Australian dates are day first),
 "is_invoice": true|false (false for statements, remittances, quotes, order confirmations without prices),
 "items": [{"code": string|null, "description": string, "qty": number|null, "unit": string|null (e.g. EA, CTN, KG, BTL),
            "pack_size": string|null (e.g. "6 x 700ml", "1kg", "CTN (6 x 2L)" — the pack printed with the item, if any),
            "unit_price_ex_gst": number|null, "line_total_ex_gst": number|null}],
 "subtotal_ex_gst": number|null, "total_inc_gst": number|null}
Rules: copy numbers as printed; if the invoice only shows GST-inclusive prices, divide by 1.1 for the lines that carry GST; skip delivery/freight/surcharge/card-fee lines; never invent a line or a price; use null when a value isn't printed.`;

export async function readInvoiceWithAi(bytes: Uint8Array, key: string): Promise<ParsedInvoice> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal, headers: anthropicHeaders(key),
      body: JSON.stringify({
        model: aiModel(), max_tokens: 4000, temperature: 0, system: SYSTEM,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: "Copy out this invoice as JSON." },
        ] }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const o = parseJSONObject(json.content?.find((c) => c.type === "text")?.text ?? "");
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[$,]/g, ""))) ? Number(v.replace(/[$,]/g, "")) : null);
    const s = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const out: ParsedInvoice = {
      parser: "generic", supplierName: s(o.supplier), invoiceNumber: s(o.invoice_number, 60),
      invoiceDate: typeof o.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.invoice_date) ? o.invoice_date : parseDate(s(o.invoice_date)), items: [], skipped: [], warnings: [],
    };
    if (o.is_invoice === false) { out.warnings.push("Not an invoice (statement, remittance or similar)."); return out; }
    for (const raw of Array.isArray(o.items) ? o.items.slice(0, 300) : []) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const description = s(r.description, 300);
      if (!description) continue;
      const item: ParsedItem = {
        lineNo: out.items.length + 1, code: s(r.code, 60), description, qty: n(r.qty), unit: s(r.unit, 40), section: null,
        unitPrice: n(r.unit_price_ex_gst), lineTotal: n(r.line_total_ex_gst), packSize: s(r.pack_size, 80),
      };
      // a unit price the line total contradicts (more than 2% out) is dropped rather than trusted
      if (item.unitPrice !== null && item.qty && item.lineTotal !== null && item.lineTotal > 0 && Math.abs(item.unitPrice * item.qty - item.lineTotal) / item.lineTotal > 0.02) {
        out.warnings.push(`Check "${description}": its price and line total don't agree.`);
        item.unitPrice = item.lineTotal / item.qty;
      }
      if (item.unitPrice === null && item.qty && item.lineTotal !== null) item.unitPrice = Math.round((item.lineTotal / item.qty) * 10000) / 10000;
      if (isFeeLine(description, item.code)) { out.skipped.push(description); continue; }
      out.items.push(item);
    }
    if (!out.items.length) out.warnings.push("No line items could be read from this invoice.");
    return out;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI reader took too long on this invoice.");
    throw e;
  } finally { clearTimeout(timer); }
}
