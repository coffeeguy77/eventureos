import "server-only";
import { GMAIL_BASE, getAttachment, getMessage, header, listMessages, parseAddressList, pdfParts, type GmailMessage } from "@/lib/integrations/gmail";
import { apiJSON, ReconnectRequired, type SyncContext } from "@/lib/integrations/runtime";
import { addDaysISO, todayISO } from "@/lib/format";
import { buildQuery } from "./core";
import { importInvoice, type PriceSupplier } from "./import";

/**
 * Pull supplier invoices from Gmail: for each supplier with a sender and/or subject set, find new emails with PDFs,
 * read each invoice and save its prices. Every attachment looked at is recorded so it's never read twice.
 * Stops after ~45 seconds (server time limit) and says so — running it again carries on where it stopped.
 */
export interface PricingSync { imported: number; duplicates: number; skipped: number; failed: number; more: boolean; lines: string[] }
const BUDGET = 45_000;
const SUP_COLS = "id, name, parser, match_from, match_subject, match_exclude, last_synced_at";

export async function syncSupplierInvoices(ctx: SyncContext, opts: { supplierId?: string; historyFrom?: string; aiKey: string | null }): Promise<PricingSync> {
  const started = Date.now();
  const out: PricingSync = { imported: 0, duplicates: 0, skipped: 0, failed: 0, more: false, lines: [] };
  const orgId = ctx.org.id;
  // only the suppliers whose invoices arrive in this mailbox (yours, or the second Gmail account)
  const box = ctx.integration.provider;
  const load = (withBox: boolean) => {
    let q = ctx.db.from("price_suppliers").select(withBox ? `${SUP_COLS}, mailbox` : SUP_COLS).eq("organisation_id", orgId).eq("active", true);
    if (withBox) q = q.eq("mailbox", box);
    if (opts.supplierId) q = q.eq("id", opts.supplierId);
    return q;
  };
  let { data, error } = await load(true);
  if (error && /mailbox/.test(error.message)) {
    if (box !== "gmail") return out; // before the 0071 update every supplier is in the main mailbox
    ({ data, error } = await load(false));
  }
  if (error) throw new Error(error.message);
  const suppliers = ((data ?? []) as unknown as PriceSupplier[]).filter((s) => s.match_from.length || s.match_subject?.trim());
  if (!suppliers.length) return out;
  const today = todayISO(ctx.org.timezone);

  for (const s of suppliers) {
    const after = opts.historyFrom ?? (s.last_synced_at ? addDaysISO(s.last_synced_at.slice(0, 10), -3) : addDaysISO(today, -90));
    const query = buildQuery(s, after);
    if (!query) continue;
    const ids: string[] = [];
    let page: string | undefined;
    do {
      const r = await listMessages(ctx, query, page, 100);
      ids.push(...(r.messages ?? []).map((m) => m.id));
      page = r.nextPageToken;
    } while (page && ids.length < (opts.historyFrom ? 3000 : 300));

    const seen = new Set<string>();
    for (let c = 0; c < ids.length; c += 150) {
      const { data: rows, error: e } = await ctx.db.from("price_email_imports").select("gmail_message_id, attachment_name, status").eq("organisation_id", orgId).in("gmail_message_id", ids.slice(c, c + 150));
      if (e) throw new Error(e.message);
      // failed reads are tried again next time
      for (const r of (rows ?? []) as { gmail_message_id: string; attachment_name: string; status: string }[]) if (r.status !== "failed") seen.add(`${r.gmail_message_id}|${r.attachment_name}`);
    }
    let finished = true, fresh = 0;
    for (const id of ids.reverse()) { // oldest first, so history builds in order
      if (Date.now() - started > BUDGET) { out.more = true; finished = false; break; }
      if (seen.has(`${id}|(none)`)) continue;
      const msg = await getMessage(ctx, id);
      const pdfs = pdfParts(msg.payload).filter((p) => !seen.has(`${id}|${p.filename || "invoice.pdf"}`));
      if (!pdfs.length) {
        if (!pdfParts(msg.payload).length) await record(ctx, s.id, msg, "(none)", "skipped", null, "No PDF attached");
        continue;
      }
      for (const part of pdfs) {
        const name = part.filename || "invoice.pdf";
        try {
          const bytes = part.body?.attachmentId ? await getAttachment(ctx, id, part.body.attachmentId) : new Uint8Array(Buffer.from(part.body?.data ?? "", "base64url"));
          const r = await importInvoice(ctx.db, { orgId, supplier: s, bytes, filename: name, source: "gmail", gmailMessageId: id, receivedAt: received(msg), subject: header(msg, "Subject"), aiKey: opts.aiKey });
          await record(ctx, s.id, msg, name, r.status, r.invoiceId ?? null, r.message);
          if (r.status === "imported") { out.imported++; fresh++; out.lines.push(r.message); }
          else if (r.status === "duplicate") out.duplicates++;
          else { out.skipped++; out.lines.push(`${s.name}: ${r.message}`); }
        } catch (e) {
          if (e instanceof ReconnectRequired) throw e;
          const message = e instanceof Error ? e.message : String(e);
          await record(ctx, s.id, msg, name, "failed", null, message);
          out.failed++; out.lines.push(`${s.name} — ${name}: ${message}`);
        }
        if (Date.now() - started > BUDGET) { out.more = true; finished = false; break; }
      }
      if (!finished) break;
    }
    if (finished && !opts.historyFrom) await ctx.db.from("price_suppliers").update({ last_synced_at: new Date().toISOString() }).eq("id", s.id);
    if (finished && !fresh) out.lines.push(`${s.name}: nothing new`);
    if (out.more) break;
  }
  return out;
}

const received = (m: GmailMessage) => (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null);

async function record(ctx: SyncContext, supplierId: string, msg: GmailMessage, name: string, status: string, invoiceId: string | null, message: string) {
  await ctx.db.from("price_email_imports").upsert({
    organisation_id: ctx.org.id, supplier_id: supplierId, gmail_message_id: msg.id, attachment_name: name, subject: header(msg, "Subject")?.slice(0, 300) ?? null,
    from_email: parseAddressList(header(msg, "From"))[0]?.email ?? null, received_at: received(msg), status, invoice_id: invoiceId, message: message.slice(0, 1000),
  }, { onConflict: "organisation_id,gmail_message_id,attachment_name" });
}

/** Who sends you invoices: senders of emails with PDF invoices over the last year, busiest first (to pick suppliers from). */
export async function findInvoiceSenders(ctx: SyncContext, own: string[]): Promise<{ email: string; name: string | null; domain: string; count: number; subject: string | null; last: string | null }[]> {
  const started = Date.now();
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await listMessages(ctx, `has:attachment filename:pdf (invoice OR "tax invoice") newer_than:1y -in:sent`, page, 100);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken;
  } while (page && ids.length < 400);
  const by = new Map<string, { email: string; name: string | null; domain: string; count: number; subject: string | null; last: string | null }>();
  const ownSet = new Set(own.map((x) => x.toLowerCase()));
  const ownDomains = new Set(own.map((x) => x.split("@")[1]?.toLowerCase()).filter(Boolean));
  for (let i = 0; i < ids.length; i += 20) {
    if (Date.now() - started > 40_000) break;
    const batch = await Promise.all(ids.slice(i, i + 20).map((id) => apiJSON<GmailMessage>(ctx, `${GMAIL_BASE}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {}, "Gmail messages.get").catch(() => null)));
    for (const m of batch) {
      if (!m) continue;
      const from = parseAddressList(header(m, "From"))[0];
      if (!from?.email) continue;
      const email = from.email.toLowerCase(), domain = email.split("@")[1] ?? "";
      if (ownSet.has(email) || ownDomains.has(domain)) continue;
      const x = by.get(email) ?? { email, name: from.name, domain, count: 0, subject: header(m, "Subject")?.slice(0, 120) ?? null, last: received(m) };
      x.count++;
      by.set(email, x);
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, 60);
}
