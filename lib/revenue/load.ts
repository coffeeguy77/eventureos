import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanRecodeMap } from "@/lib/integrations/xero-recode-plan";
import { revenueByStream, streamPeriods, type StreamInvoice, type StreamRow } from "@/lib/revenue/streams";

export interface StreamsData {
  periods: { key: string; label: string; rows: StreamRow[] }[];
  names: Record<string, string>;
  lastSync: string | null;
}

/** Revenue by stream for the dashboard, or null when no streams are set up (Xero → Recode by item). */
export async function loadRevenueStreams(db: SupabaseClient, orgId: string, today: string, fyStartMonth?: number): Promise<StreamsData | null> {
  const { data: integ } = await db.from("integrations").select("settings, last_sync_at").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
  const settings = (integ?.settings ?? {}) as Record<string, unknown>;
  const map = cleanRecodeMap(settings.recode_map);
  if (!Object.keys(map).length) return null;

  // Invoices with a mapped item, or a line already on one of the stream accounts
  const filters = [...Object.keys(map).map((c) => ({ item_code: c })), ...[...new Set(Object.values(map))].map((a) => ({ account_code: a }))];
  const byId = new Map<string, StreamInvoice>();
  await Promise.all(filters.map(async (f) => {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("invoices").select("id, status, issue_date, subtotal, line_items")
        .eq("organisation_id", orgId).not("xero_invoice_id", "is", null).not("status", "in", "(draft,void)")
        .contains("line_items", JSON.stringify([f])).order("issue_date").range(from, from + 999);
      if (error) throw new Error(`Couldn't read invoices: ${error.message}`);
      for (const r of (data ?? []) as StreamInvoice[]) byId.set(r.id, r);
      if (!data || data.length < 1000) break;
    }
  }));
  const invoices = [...byId.values()];
  return {
    periods: streamPeriods(today, fyStartMonth).map((p) => ({ key: p.key, label: p.label, rows: revenueByStream(invoices, map, p) })),
    names: (settings.account_names ?? {}) as Record<string, string>,
    lastSync: (integ?.last_sync_at as string | null) ?? null,
  };
}
