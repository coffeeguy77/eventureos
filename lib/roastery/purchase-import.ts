import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAttachment, getMessage, header, listMessages, parseAddressList, type GmailMessage, type GmailPart } from "@/lib/integrations/gmail";
import { ReconnectRequired, type SyncContext } from "@/lib/integrations/runtime";
import { DEFAULT_GREEN_SENDERS, NOT_READ_YET, fileKind, greenQuery, supplierFor } from "./purchases";
import { readGreenInvoice } from "./purchase-read";

/**
 * Green coffee invoices from Gmail → Roastery purchases. Searches every email (all years) from the importers with a PDF,
 * reads each PDF with Claude and saves the coffee lines. Every attachment looked at is recorded so it's never read
 * twice (failed ones are tried again). Several invoices are read at once; it stops before `budgetMs` and carries on
 * next time (the 10-minute Gmail check keeps going until the history is done).
 * Settings: organisations.settings.roastery.green_import = { senders: [...], done: boolean, last_run: ISO }.
 */
export interface GreenImportResult { found: number; imported: number; duplicates: number; skipped: number; failed: number; more: boolean; lines: string[] }

export function greenSenders(settings: unknown): string[] {
  const r = ((((settings ?? {}) as Record<string, unknown>).roastery ?? {}) as Record<string, unknown>).green_import as Record<string, unknown> | undefined;
  const s = Array.isArray(r?.senders) ? (r!.senders as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  return s.length ? s : DEFAULT_GREEN_SENDERS;
}
export function greenImportState(settings: unknown): { done: boolean; lastRun: string | null } {
  const r = ((((settings ?? {}) as Record<string, unknown>).roastery ?? {}) as Record<string, unknown>).green_import as Record<string, unknown> | undefined;
  return { done: r?.done === true, lastRun: typeof r?.last_run === "string" ? r.last_run : null };
}

/** Every attached file in a message (any depth), not inline signature images. */
function attachments(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  const disp = (part.headers ?? []).find((h) => h.name.toLowerCase() === "content-disposition")?.value ?? "";
  const mine = part.filename && (part.body?.attachmentId || part.body?.data) && !(/^inline/i.test(disp) && (part.mimeType ?? "").startsWith("image/")) ? [part] : [];
  return [...mine, ...(part.parts ?? []).flatMap(attachments)];
}

const received = (m: GmailMessage) => (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null);

export async function importGreenInvoices(ctx: SyncContext, opts: { aiKey: string | null; budgetMs: number; parallel?: number }): Promise<GreenImportResult> {
  const started = Date.now();
  const db = ctx.db, orgId = ctx.org.id;
  const out: GreenImportResult = { found: 0, imported: 0, duplicates: 0, skipped: 0, failed: 0, more: false, lines: [] };
  if (!opts.aiKey) throw new Error("Reading invoices needs a Claude API key — add one in Settings → Integrations.");
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const query = greenQuery(greenSenders(org?.settings));
  if (!query) return out;

  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await listMessages(ctx, query, page, 100);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken;
  } while (page && ids.length < 5000);
  out.found = ids.length;

  // what's already been looked at (failed reads are tried again)
  const seen = new Set<string>(), seenMsg = new Set<string>();
  for (let c = 0; c < ids.length; c += 200) {
    const { data: rows, error } = await db.from("roastery_purchase_emails").select("gmail_message_id, attachment_name, status, message").eq("organisation_id", orgId).in("gmail_message_id", ids.slice(c, c + 200));
    if (error) throw new Error(error.message);
    for (const r of (rows ?? []) as { gmail_message_id: string; attachment_name: string; status: string }[]) {
      if (r.status === "failed" || (r.status === "skipped" && (r as { message?: string }).message?.startsWith(NOT_READ_YET))) continue;
      seen.add(`${r.gmail_message_id}|${r.attachment_name}`);
      seenMsg.add(r.gmail_message_id);
    }
  }
  const todo = ids.filter((id) => !seenMsg.has(id)).reverse(); // oldest first
  const parallel = Math.max(1, Math.min(8, opts.parallel ?? 5));
  let i = 0;

  const one = async (id: string) => {
    const msg = await getMessage(ctx, id);
    const from = parseAddressList(header(msg, "From"))[0]?.email?.toLowerCase() ?? null;
    const files = attachments(msg.payload).filter((p) => !seen.has(`${id}|${(p.filename || "attachment").slice(0, 200)}`));
    if (!files.length) { await record(db, orgId, msg, from, "(none)", "skipped", null, "No attachment"); out.skipped++; return; }
    for (const part of files) {
      const name = (part.filename || "attachment").slice(0, 200);
      const kind = fileKind(name, part.mimeType);
      // only PDFs are read for now; other files are listed so we can see what each importer sends
      // email signature logos (image001.png …) — nothing to read
      if (kind === "image" && ((part.body?.size ?? 0) < 60_000 || /^image\d{3}\./i.test(name))) { await record(db, orgId, msg, from, name, "skipped", null, "Email signature image"); out.skipped++; continue; }
      if (kind !== "pdf") { await record(db, orgId, msg, from, name, "skipped", null, `${NOT_READ_YET} (${kind}${part.mimeType ? `, ${part.mimeType}` : ""}, ${Math.round((part.body?.size ?? 0) / 1024)} KB)`); out.skipped++; continue; }
      try {
        const bytes = part.body?.attachmentId ? await getAttachment(ctx, id, part.body.attachmentId) : new Uint8Array(Buffer.from(part.body?.data ?? "", "base64url"));
        const inv = await readGreenInvoice(bytes, opts.aiKey!);
        if (inv.document !== "invoice") { await record(db, orgId, msg, from, name, "skipped", null, `Not an invoice (${inv.document.replace(/_/g, " ")})`); out.skipped++; continue; }
        if (!inv.lines.length) { await record(db, orgId, msg, from, name, "skipped", null, inv.warnings.join(" ") || "No coffee lines"); out.skipped++; continue; }
        const supplier = supplierFor(from, inv.supplier);
        const coffee = Math.round(inv.lines.reduce((t, l) => t + (l.amount_ex_gst ?? 0), 0) * 100) / 100;
        const { data: p, error } = await db.from("roastery_purchases").insert({
          organisation_id: orgId, supplier, invoice_number: inv.invoiceNumber, invoice_date: inv.invoiceDate ?? received(msg)?.slice(0, 10) ?? null,
          coffee_ex_gst: coffee, freight_ex_gst: inv.freight, total_inc_gst: inv.totalIncGst, source: "gmail", gmail_message_id: id, attachment_name: name,
          read_by: "ai", warnings: [...new Set(inv.warnings)].slice(0, 10),
        }).select("id").single();
        if (error) {
          if (error.code === "23505") { await record(db, orgId, msg, from, name, "duplicate", null, `${supplier} ${inv.invoiceNumber} is already in`); out.duplicates++; continue; }
          throw new Error(error.message);
        }
        const { error: lErr } = await db.from("roastery_purchase_lines").insert(inv.lines.map((l, k) => ({ ...l, organisation_id: orgId, purchase_id: p.id, line_no: k + 1 })));
        if (lErr) { await db.from("roastery_purchases").delete().eq("id", p.id); throw new Error(lErr.message); }
        await record(db, orgId, msg, from, name, "imported", p.id as string, `${supplier} ${inv.invoiceNumber ?? ""} · ${inv.lines.length} coffee${inv.lines.length === 1 ? "" : "s"}`);
        out.imported++;
      } catch (e) {
        if (e instanceof ReconnectRequired) throw e;
        const m = e instanceof Error ? e.message : String(e);
        await record(db, orgId, msg, from, name, "failed", null, m);
        out.failed++; out.lines.push(`${name}: ${m}`);
      }
    }
  };

  // a few at a time, until the time budget is nearly used (an invoice takes ~10–30 s to read)
  const worker = async () => {
    while (i < todo.length) {
      if (Date.now() - started > opts.budgetMs - 70_000) { out.more = true; return; }
      const id = todo[i++];
      try { await one(id); } catch (e) { if (e instanceof ReconnectRequired) throw e; out.failed++; out.lines.push(e instanceof Error ? e.message : String(e)); }
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  if (i < todo.length) out.more = true;

  // remember whether the history is finished (the Gmail check stops reading the backlog once it is)
  const { data: fresh } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const settings = (fresh?.settings ?? {}) as Record<string, unknown>;
  const ro = (settings.roastery ?? {}) as Record<string, unknown>;
  const gi = (ro.green_import ?? {}) as Record<string, unknown>;
  await db.from("organisations").update({ settings: { ...settings, roastery: { ...ro, green_import: { ...gi, done: !out.more, last_run: new Date().toISOString() } } } }).eq("id", orgId);
  return out;
}

async function record(db: SupabaseClient, orgId: string, msg: GmailMessage, from: string | null, name: string, status: string, purchaseId: string | null, message: string) {
  await db.from("roastery_purchase_emails").upsert({
    organisation_id: orgId, gmail_message_id: msg.id, attachment_name: name, from_email: from, subject: header(msg, "Subject")?.slice(0, 300) ?? null,
    received_at: received(msg), status, purchase_id: purchaseId, message: message.slice(0, 1000),
  }, { onConflict: "organisation_id,gmail_message_id,attachment_name" });
}

/** The 10-minute Gmail check: carry on for businesses whose history isn't finished, and pick up new invoices. */
export async function runGreenImports(db: SupabaseClient, budgetMs: number) {
  const { data } = await db.from("organisations").select("id, settings").not("settings->roastery->green_import", "is", null);
  const out: Record<string, unknown> = {};
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const { orgAiKey } = await import("@/lib/ai/key");
  for (const o of (data ?? []) as { id: string; settings: unknown }[]) {
    const st = greenImportState(o.settings);
    // new invoices: once an hour after the history is done
    if (st.done && st.lastRun && Date.now() - Date.parse(st.lastRun) < 3_600_000) continue;
    try {
      const ctx = await buildContext(db, "service", o.id, "gmail", null);
      const r = await importGreenInvoices(ctx, { aiKey: await orgAiKey(o.id), budgetMs, parallel: 6 });
      out[o.id] = { found: r.found, imported: r.imported, duplicates: r.duplicates, skipped: r.skipped, failed: r.failed, more: r.more };
    } catch (e) { out[o.id] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}
