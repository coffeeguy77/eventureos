"use server";

import { redirect } from "next/navigation";
import { startCheckout } from "@/lib/payments/service";

export async function payByCard(token: string, _prev: { error?: string } | undefined): Promise<{ error?: string }> {
  let url: string;
  try {
    url = await startCheckout(token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start the payment. Please try again." };
  }
  redirect(url);
}

/**
 * The customer opened their invoice page (called from the page once it has been visible for a moment, so email link
 * scanners don't count). Opens by the business's own signed-in team aren't counted.
 */
export async function recordInvoiceView(token: string): Promise<void> {
  try {
    if (!/^[0-9a-f]{32,64}$/i.test(String(token))) return;
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const { data: inv, error } = await db.from("invoices").select("id, number, organisation_id, customer_id, event_id, view_count, first_viewed_at, customer:customers(name)").eq("pay_token", token).maybeSingle();
    if (error || !inv) return; // before the 0059 database update
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: m } = await db.from("organisation_users").select("role").eq("user_id", user.id).eq("organisation_id", inv.organisation_id).eq("status", "active").maybeSingle();
        if (m && m.role !== "customer") return;
      }
    } catch { /* not signed in */ }
    const now = new Date().toISOString();
    await db.from("invoices").update({ view_count: Number(inv.view_count ?? 0) + 1, last_viewed_at: now, ...(inv.first_viewed_at ? {} : { first_viewed_at: now }) }).eq("id", inv.id);
    if (!inv.first_viewed_at) {
      const who = (inv.customer as unknown as { name: string } | null)?.name ?? "The client";
      await db.from("activity_logs").insert({ organisation_id: inv.organisation_id, actor_type: "customer", actor_label: who, action: "invoice.viewed", entity_type: "invoice",
        entity_id: inv.id, customer_id: inv.customer_id, event_id: inv.event_id, summary: `${who} opened invoice ${inv.number}` });
    }
  } catch { /* best effort */ }
}
