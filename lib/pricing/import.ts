import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchKey } from "./core";
import { parseInvoicePdf, type ParsedInvoice, type ParserId } from "./parse";
import { unitPrice } from "./units";

export interface PriceSupplier {
  id: string; name: string; parser: string; match_from: string[]; match_subject: string | null; match_exclude: string[]; last_synced_at: string | null;
}
export interface ImportResult { status: "imported" | "duplicate" | "skipped" | "failed"; invoiceId?: string; message: string; lines?: number }

const LAYOUTS: ParserId[] = ["bidfood", "longpark", "fresho", "generic"];

/** Read an invoice: the supplier's layout reader first, then Claude when nothing could be read (or when set to AI). */
export async function readInvoice(bytes: Uint8Array, supplier: Pick<PriceSupplier, "parser">, filename: string, aiKey: string | null): Promise<ParsedInvoice & { readBy: string }> {
  let parsed: ParsedInvoice | null = null;
  if (supplier.parser !== "ai") {
    try {
      parsed = await parseInvoicePdf(bytes, { parser: LAYOUTS.includes(supplier.parser as ParserId) ? (supplier.parser as ParserId) : undefined, filename });
    } catch { parsed = null; }
    // a reader that found lines without prices didn't really understand the layout
    if (parsed && parsed.items.length && parsed.items.filter((i) => i.unitPrice !== null).length >= Math.ceil(parsed.items.length * 0.6)) return { ...parsed, readBy: parsed.parser };
  }
  if (!aiKey) {
    if (parsed) return { ...parsed, readBy: parsed.parser };
    throw new Error("This invoice's layout couldn't be read, and AI reading isn't set up (Settings → Integrations → Anthropic).");
  }
  const { readInvoiceWithAi } = await import("./ai-read");
  const ai = await readInvoiceWithAi(bytes, aiKey);
  return { ...ai, readBy: "ai" };
}

/** Read a supplier invoice PDF, keep a copy, and save one price row per line (ex GST, per kg / L / each). */
export async function importInvoice(db: SupabaseClient, o: {
  orgId: string; supplier: PriceSupplier; bytes: Uint8Array; filename: string; source: "gmail" | "upload";
  gmailMessageId?: string; receivedAt?: string | null; subject?: string | null; aiKey: string | null;
  /** already in the supplier-invoices bucket (uploaded from the browser) */ existingPath?: string;
}): Promise<ImportResult> {
  if (/statement|remittance|reminder|overdue|receipt of payment|credit card|price list/i.test(`${o.subject ?? ""} ${o.filename}`) && !/invoice/i.test(o.filename)) {
    return { status: "skipped", message: `${o.filename}: looks like a statement or remittance — skipped.` };
  }
  const parsed = await readInvoice(o.bytes, o.supplier, o.filename, o.aiKey);
  if (!parsed.items.length) {
    return { status: "skipped", message: `${o.filename}: ${parsed.warnings[0] ?? "no priced lines found"}` };
  }
  if (parsed.invoiceNumber) {
    const { data: dupe } = await db.from("price_invoices").select("id").eq("organisation_id", o.orgId).eq("supplier_id", o.supplier.id).eq("invoice_number", parsed.invoiceNumber).maybeSingle();
    if (dupe) return { status: "duplicate", invoiceId: dupe.id as string, message: `Invoice ${parsed.invoiceNumber} is already in.` };
  }
  let path = o.existingPath;
  if (!path) {
    const safe = o.filename.replace(/[^\w.-]+/g, "_").slice(-80) || "invoice.pdf";
    path = `${o.orgId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await db.storage.from("supplier-invoices").upload(path, o.bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Couldn't save the PDF: ${upErr.message}`);
  }

  const invoiceDate = parsed.invoiceDate ?? (o.receivedAt ? o.receivedAt.slice(0, 10) : null);
  const priced = parsed.items.flatMap((it) => {
    const u = unitPrice(it);
    return u ? [{ it, u }] : [];
  });
  const subtotal = Math.round(priced.reduce((a, { it }) => a + (it.lineTotal ?? (it.qty ?? 0) * (it.unitPrice ?? 0)), 0) * 100) / 100;
  const { data: inv, error } = await db.from("price_invoices").insert({
    organisation_id: o.orgId, supplier_id: o.supplier.id, invoice_number: parsed.invoiceNumber, invoice_date: invoiceDate, source: o.source,
    gmail_message_id: o.gmailMessageId ?? null, attachment_name: o.filename, storage_path: path, read_by: parsed.readBy, subtotal,
    line_count: priced.length, notes: parsed.warnings.length ? parsed.warnings.join(" ").slice(0, 1000) : null,
  }).select("id").single();
  if (error) {
    if (/duplicate key/i.test(error.message)) return { status: "duplicate", message: `Invoice ${parsed.invoiceNumber} is already in.` };
    throw new Error(`Couldn't save the invoice: ${error.message}`);
  }
  if (priced.length) {
    const { error: lErr } = await db.from("price_lines").insert(priced.map(({ it, u }) => ({
      organisation_id: o.orgId, invoice_id: inv.id, supplier_id: o.supplier.id, line_no: it.lineNo, code: it.code, description: it.description,
      match_key: matchKey(it.description, it.code), invoice_date: invoiceDate, qty: it.qty, unit: it.unit, pack_size: it.packSize,
      unit_price: it.unitPrice, line_total: it.lineTotal, base_unit: u.baseUnit, base_qty: u.baseQty, price_per_base: u.pricePerBase,
    })));
    if (lErr) throw new Error(`Saved the invoice but not its prices: ${lErr.message}`);
  }
  return { status: "imported", invoiceId: inv.id as string, lines: priced.length, message: `${o.supplier.name} ${parsed.invoiceNumber ?? ""} (${invoiceDate ?? "no date"}): ${priced.length} price${priced.length === 1 ? "" : "s"}${parsed.readBy === "ai" ? " · read by AI" : ""}` };
}
