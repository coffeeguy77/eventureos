import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digits, hiddenNumbers, mergePhones, xeroNumbers, type PhoneOption } from "./phones";
import { cleanStored } from "@/lib/phone-format";

/**
 * Every number to call a customer on: the client record, their contacts, and — live from Xero — each number on their
 * Xero contact. A Xero number the client record is missing is saved onto it, so it shows everywhere from then on.
 */
export async function loadPhones(db: SupabaseClient, orgId: string, customerId: string, actorId: string | null): Promise<{ phones: PhoneOption[]; xero: "ok" | "none" | "error" }> {
  const [{ data: c }, { data: people }] = await Promise.all([
    db.from("customers").select("phone, xero_contact_id").eq("id", customerId).eq("organisation_id", orgId).maybeSingle(),
    db.from("contacts").select("first_name, last_name, phone, is_primary").eq("organisation_id", orgId).eq("customer_id", customerId).not("phone", "is", null).order("is_primary", { ascending: false }).limit(10),
  ]);
  // Stored numbers are tidied as they're shown ("+0476 804 0476804565" → "0476 804 565"; "Phone: … Mobile: …" → two numbers)
  const own: PhoneOption[] = c?.phone ? cleanStored(String(c.phone)).map((number) => ({ number, label: "Client record", source: "client" as const })) : [];
  const contacts: PhoneOption[] = ((people ?? []) as { first_name: string | null; last_name: string | null; phone: string }[])
    .flatMap((p) => cleanStored(p.phone).map((number) => ({ number, label: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Contact", source: "contact" as const })));
  let fromXero: PhoneOption[] = [];
  let xero: "ok" | "none" | "error" = "none";
  if (c?.xero_contact_id) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { xeroGet } = await import("@/lib/integrations/xero");
      const ctx = await buildContext(db, "user", orgId, "xero", actorId);
      const r = await Promise.race([
        xeroGet<{ Contacts?: { Phones?: Parameters<typeof xeroNumbers>[0] }[] }>(ctx, `/Contacts/${c.xero_contact_id}`, {}),
        new Promise<null>((res) => setTimeout(() => res(null), 4000)),
      ]);
      if (r) {
        fromXero = xeroNumbers(r.Contacts?.[0]?.Phones);
        xero = "ok";
        if (!c.phone && fromXero[0]) await db.from("customers").update({ phone: fromXero[0].number }).eq("id", customerId).eq("organisation_id", orgId).is("phone", null);
      } else xero = "error";
    } catch { xero = "error"; }
  }
  // numbers the team removed (someone who's left) stay hidden, even when Xero still has them
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const hidden = new Set(hiddenNumbers(org?.settings, customerId));
  return { phones: mergePhones(own, fromXero, contacts).filter((p) => !hidden.has(digits(p.number))), xero };
}
