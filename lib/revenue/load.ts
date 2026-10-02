import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanRecodeMap, cleanRecodeRules } from "@/lib/integrations/xero-recode-plan";
import { revenueByStream, streamPeriods, type StreamInvoice, type StreamRow } from "@/lib/revenue/streams";

export interface StreamsData {
  periods: { key: string; label: string; rows: StreamRow[] }[];
  names: Record<string, string>;
  lastSync: string | null;
}

/** Every synced Xero invoice that counts as revenue, in pages (one pass — no per-item searches). */
async function revenueInvoices(db: SupabaseClient, orgId: string): Promise<StreamInvoice[]> {
  const rows: StreamInvoice[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("invoices").select("id, number, status, issue_date, subtotal, line_items")
      .eq("organisation_id", orgId).not("xero_invoice_id", "is", null).not("status", "in", "(draft,void)")
      .order("issue_date").order("id").range(from, from + 999);
    if (error) throw new Error(`Couldn't read invoices: ${error.message}`);
    rows.push(...((data ?? []) as StreamInvoice[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// Worked out at most every 30 minutes per organisation and set of choices (and straight away after a Xero sync changes the data's age)
const cached = unstable_cache(
  async (orgId: string, today: string, fyStartMonth: number, mapJson: string, rulesJson: string, _sync: string) => {
    const invoices = await revenueInvoices(createServiceClient(), orgId);
    const map = JSON.parse(mapJson) as Record<string, string>, rules = JSON.parse(rulesJson);
    return streamPeriods(today, fyStartMonth).map((p) => ({ key: p.key, label: p.label, rows: revenueByStream(invoices, map, p, rules) }));
  },
  ["revenue-streams-v1"],
  { revalidate: 1800 },
);

/** Revenue by stream for the dashboard, or null when no streams are set up (Xero → Recode by item). */
export async function loadRevenueStreams(db: SupabaseClient, orgId: string, today: string, fyStartMonth = 7): Promise<StreamsData | null> {
  const { data: integ } = await db.from("integrations").select("settings, last_sync_at").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
  const settings = (integ?.settings ?? {}) as Record<string, unknown>;
  const map = cleanRecodeMap(settings.recode_map), rules = cleanRecodeRules(settings.recode_rules);
  if (!Object.keys(map).length && !rules.length) return null;
  const lastSync = (integ?.last_sync_at as string | null) ?? null;
  return {
    periods: await cached(orgId, today, fyStartMonth, JSON.stringify(map), JSON.stringify(rules), lastSync ?? ""),
    names: (settings.account_names ?? {}) as Record<string, string>,
    lastSync,
  };
}
