"use server";

import { redirect } from "next/navigation";
import { appBaseUrl } from "@/lib/integrations/registry";

/** Pay the ticked invoices from an account statement (Stripe's card page). */
export async function payStatement(token: string, invoiceIds: string[]): Promise<{ error: string }> {
  let url: string;
  try {
    const { readStatement } = await import("@/lib/accounts/statement");
    const s = readStatement(token);
    if (!s || s.expired) throw new Error("This statement link has expired — ask us for a new one.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const { loadStripe } = await import("@/lib/payments/service");
    const { startPhoneCheckout } = await import("@/lib/payments/phone");
    const db = createServiceClient();
    const cfg = await loadStripe(db, s.orgId);
    if (!cfg) throw new Error("Card payments aren't available — please contact us to pay.");
    const [{ data: org }, { data: c }] = await Promise.all([
      db.from("organisations").select("currency").eq("id", s.orgId).single(),
      db.from("customers").select("email").eq("id", s.customerId).eq("organisation_id", s.orgId).maybeSingle(),
    ]);
    const back = `${appBaseUrl()}/pay/statement/${token}`;
    const r = await startPhoneCheckout(db, s.orgId, cfg, { customerId: s.customerId, invoiceIds, saveCard: false, staffId: null, staffName: "the customer", currency: (org?.currency as string) || "AUD",
      email: (c?.email as string | null) ?? null, statement: { successUrl: `${back}?paid=1`, cancelUrl: back } });
    url = r.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start the payment. Please try again." };
  }
  redirect(url);
}

/** The customer looked at their statement (from the page once visible; the business's own team isn't counted). */
export async function statementViewed(token: string): Promise<void> {
  try {
    const { readStatement, recordStatementView } = await import("@/lib/accounts/statement");
    const s = readStatement(token);
    if (!s) return;
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const { data: { user } } = await (await createClient()).auth.getUser();
      if (user) {
        const { data: m } = await db.from("organisation_users").select("role").eq("user_id", user.id).eq("organisation_id", s.orgId).eq("status", "active").maybeSingle();
        if (m && m.role !== "customer") return;
      }
    } catch { /* not signed in */ }
    await recordStatementView(db, s.orgId, s.customerId, s.emailId);
  } catch { /* best effort */ }
}
