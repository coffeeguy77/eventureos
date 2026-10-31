import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import { getAttachment, getMessage, listMessages, type GmailPart } from "@/lib/integrations/gmail";
import { parseRemittance, type RemitRow } from "./ordermentum";

/**
 * Ordermentum's remittance emails (with the CSV) from your Gmail — read only (gmail.readonly).
 *  users.messages.list q=…  →  users.messages.get  →  users.messages.attachments.get
 */
function csvParts(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  const mine = (/csv/i.test(part.mimeType ?? "") || /\.csv$/i.test(part.filename ?? "")) && (part.body?.attachmentId || part.body?.data) ? [part] : [];
  return [...mine, ...(part.parts ?? []).flatMap(csvParts)];
}

export async function ordermentumRemittances(ctx: SyncContext, batches: string[]): Promise<{ rows: RemitRow[]; emails: number }> {
  const wanted = [...new Set(batches.filter((b) => /^OM\d{6,}$/.test(b)))].slice(0, 60);
  if (!wanted.length) return { rows: [], emails: 0 };
  const rows: RemitRow[] = [];
  let emails = 0;
  for (let i = 0; i < wanted.length; i += 15) {
    const q = `has:attachment filename:csv ordermentum (${wanted.slice(i, i + 15).join(" OR ")})`;
    const r = await listMessages(ctx, q, undefined, 50);
    for (const m of r.messages ?? []) {
      const msg = await getMessage(ctx, m.id);
      for (const part of csvParts(msg.payload)) {
        const bytes = part.body?.attachmentId ? await getAttachment(ctx, m.id, part.body.attachmentId) : new Uint8Array(Buffer.from(part.body?.data ?? "", "base64url"));
        try { rows.push(...parseRemittance(new TextDecoder().decode(bytes))); emails++; } catch { /* another CSV on the email */ }
      }
    }
  }
  return { rows: rows.filter((x) => wanted.includes(x.batch)), emails };
}
