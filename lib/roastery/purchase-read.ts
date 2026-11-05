import "server-only";
import { ANTHROPIC_URL, anthropicHeaders, parseJSONObject } from "@/lib/ai/claude";
import { replyModel } from "@/lib/ai/reply";
import { cleanLine, isFeeLine, type CleanLine, type ReadLine } from "./purchases";

/**
 * Read a green coffee invoice PDF with Claude (any importer, any year's layout) into coffee lines with their origin,
 * region, process, kilos and price per kilo. The PDF goes to the Messages API as a document block
 * (https://platform.claude.com/docs/en/build-with-claude/pdf-support). Numbers are copied as printed, never guessed.
 */
const SYSTEM = `You read Australian green (unroasted) coffee importers' tax invoices — Project Origin, Cofinet, Cofi-Com/Volcafe, Origin Coffee Traders, Coffee & Nut Trading and similar — and copy out each line.
Return ONLY a JSON object:
{"supplier": string|null, "document": "invoice"|"credit_note"|"statement"|"remittance"|"price_list"|"order_confirmation"|"other",
 "invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null (Australian dates are day first),
 "lines": [{"description": string (as printed, joined onto one line), "code": string|null (stock/lot code e.g. "BRA-25-0097", "P18192.003"),
   "is_coffee": boolean (false for freight, delivery, pallets, surcharges, samples fees, sacks, anything not green coffee),
   "country": string|null (full English country name of origin, e.g. "Brazil", "Papua New Guinea"; null for multi-origin mixes or when not stated),
   "region": string|null (e.g. "Minas Gerais", "Huila", "Sidama", "Western Highlands"), "farm": string|null (farm, estate, co-op, washing station or named lot),
   "variety": string|null (e.g. "Yellow Bourbon", "Typica/Bourbon/Arusha"), "process": string|null (Washed, Natural, Honey, Anaerobic …),
   "grade": string|null (e.g. "NY 2/3 Scr 17/18", "AA", "Grade 1", "Peaberry"), "crop_year": number|null,
   "certifications": string[] (e.g. ["Organic","Fairtrade","Rainforest Alliance"]), "decaf": boolean, "blend": boolean (a mix of origins),
   "bags": number|null, "bag_kg": number|null (kilos per bag, e.g. 60, 69, 30), "kg": number|null (total kilos on the line),
   "price_per_kg": number|null (ex GST, as printed), "amount_ex_gst": number|null (line total ex GST)}],
 "freight_ex_gst": number|null, "total_inc_gst": number|null}
Rules: green coffee is GST-free in Australia; quantities are kilos unless the line says bags (then give bags and bag_kg as printed, e.g. "6 bags of 60 kgs" → bags 6, bag_kg 60, kg 360);
if the document is NOT an invoice (statement, remittance, price list / offer sheet, order confirmation, quote), set "document" accordingly and return "lines": [] — don't copy its lines;
short country codes like "Bra", "Col", "PNG", "Eth" mean Brazil, Colombia, Papua New Guinea, Ethiopia; copy numbers exactly; use null when a value isn't printed; never invent a line, origin or price.`;

export interface ReadInvoice {
  document: string; supplier: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  lines: CleanLine[]; freight: number; totalIncGst: number | null; warnings: string[];
}

export async function readGreenInvoice(bytes: Uint8Array, key: string): Promise<ReadInvoice> {
  // a reply that comes back cut short or garbled is asked for once more
  try { return await readOnce(bytes, key); }
  catch (e) {
    if (e instanceof Error && /JSON|Expected|Unexpected/i.test(e.message)) return readOnce(bytes, key);
    throw e;
  }
}

async function readOnce(bytes: Uint8Array, key: string): Promise<ReadInvoice> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal, headers: anthropicHeaders(key),
      body: JSON.stringify({
        model: replyModel(), max_tokens: 12000, system: SYSTEM,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: "Copy out this document as JSON." },
        ] }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const o = parseJSONObject(json.content?.find((c) => c.type === "text")?.text ?? "");
    const s = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(Number(v.replace(/[$,\s]/g, ""))) && v.trim() ? Number(v.replace(/[$,\s]/g, "")) : null);
    const warnings: string[] = [];
    const out: ReadInvoice = {
      document: s(o.document, 40) ?? "other", supplier: s(o.supplier), invoiceNumber: s(o.invoice_number, 60),
      invoiceDate: typeof o.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.invoice_date) ? o.invoice_date : null,
      lines: [], freight: Math.max(0, n(o.freight_ex_gst) ?? 0), totalIncGst: n(o.total_inc_gst), warnings,
    };
    let freightFromLines = 0;
    for (const raw of Array.isArray(o.lines) ? (o.lines as ReadLine[]).slice(0, 200) : []) {
      if (!raw || typeof raw.description !== "string") continue;
      if (isFeeLine(raw.description, raw.is_coffee)) { freightFromLines += n(raw.amount_ex_gst) ?? 0; continue; }
      const l = cleanLine(raw, (w) => warnings.push(w));
      if (l) out.lines.push(l);
    }
    if (!out.freight && freightFromLines) out.freight = Math.round(freightFromLines * 100) / 100;
    if (out.document === "invoice" && !out.lines.length) warnings.push("No coffee lines could be read from this invoice.");
    if (out.lines.some((l) => !l.kg)) warnings.push("A line has no kilos — check it.");
    return out;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI reader took too long on this invoice.");
    throw e;
  } finally { clearTimeout(timer); }
}
