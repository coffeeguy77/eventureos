import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Insert a support ticket and get its id and number. Ticket numbers come from the business's counter; if a ticket
 * already holds the next number (e.g. one imported from RepairShopr kept its old number), move the counter past the
 * highest number and try again, instead of failing — a failure here would stop the whole mail sync.
 */
export async function insertTicket(db: SupabaseClient, org: string, row: Record<string, unknown>): Promise<{ data: { id: string; number: number } | null; error: { message: string } | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("support_tickets").insert(row).select("id, number").single();
    if (!error) return { data: data as { id: string; number: number }, error: null };
    if (error.code !== "23505" || !/support_tickets_number/.test(error.message)) return { data: null, error };
    const { data: top } = await db.from("support_tickets").select("number").eq("organisation_id", org).order("number", { ascending: false }).limit(1).maybeSingle();
    const max = Number(top?.number ?? 0);
    const { error: cErr } = await db.from("organisation_counters").update({ value: max }).eq("organisation_id", org).eq("key", "support_tickets").lt("value", max);
    if (cErr) return { data: null, error: cErr };
  }
  return { data: null, error: { message: "Couldn't find a free ticket number." } };
}
