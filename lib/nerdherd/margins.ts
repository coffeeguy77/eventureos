import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientMargin, marginFor, type Margin } from "./projects";

/**
 * Project margins (Nerd Herd → Projects), kept in public.nh_margins — managers only, never readable from the client
 * portal. One row per client (the default) and optionally one per invoice (an override on that invoice). Before update
 * 0120 the client margin lived in organisations.settings, so that is read when the table isn't there yet.
 */
export interface Margins { client: number; invoices: Map<string, number>; ready: boolean; of: Margin }

export async function loadMargins(db: SupabaseClient, orgId: string, customerId: string, settings?: unknown): Promise<Margins> {
  const { data, error } = await db.from("nh_margins").select("customer_id, invoice_id, margin_percent").eq("organisation_id", orgId)
    .or(`customer_id.eq.${customerId},invoice_id.not.is.null`);
  if (error) {
    const client = clientMargin(settings, customerId);
    return { client, invoices: new Map(), ready: false, of: client };
  }
  const rows = (data ?? []) as { customer_id: string | null; invoice_id: string | null; margin_percent: number }[];
  const client = Number(rows.find((r) => r.customer_id === customerId)?.margin_percent ?? 0);
  const invoices = new Map(rows.filter((r) => r.invoice_id).map((r) => [r.invoice_id as string, Number(r.margin_percent)]));
  return { client, invoices, ready: true, of: marginFor(client, invoices) };
}

export const NEEDS_0120 = "Run update 0120 (margins and portal roles) in Supabase first.";
export const missing0120 = (m: string) => /nh_margins|portal_role|does not exist|schema cache/.test(m);
