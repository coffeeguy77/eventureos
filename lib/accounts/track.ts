import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";

/** A chasing email was opened (its tiny image loaded). */
export async function recordCollectionOpen(id: string) {
  const db = createServiceClient();
  const { data } = await db.from("collection_emails").select("id, opened_at, open_count").eq("id", id).maybeSingle();
  if (!data) return;
  await db.from("collection_emails").update({ opened_at: data.opened_at ?? new Date().toISOString(), open_count: Number(data.open_count ?? 0) + 1 }).eq("id", id);
}

/** The pay link in a chasing email was clicked (and it was for this invoice). An open is implied. */
export async function recordCollectionClick(id: string, invoiceId: string) {
  const db = createServiceClient();
  const { data } = await db.from("collection_emails").select("id, invoice_id, opened_at, open_count, clicked_at, click_count").eq("id", id).maybeSingle();
  if (!data || data.invoice_id !== invoiceId) return;
  const now = new Date().toISOString();
  await db.from("collection_emails").update({
    clicked_at: data.clicked_at ?? now, click_count: Number(data.click_count ?? 0) + 1,
    opened_at: data.opened_at ?? now, open_count: Math.max(1, Number(data.open_count ?? 0)),
  }).eq("id", id);
}
