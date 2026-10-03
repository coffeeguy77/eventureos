/**
 * After an enquiry becomes a job: make sure the client record has the enquirer's phone, email and (when the form
 * asked for one) their own address — filling blanks only. A plain "address"/"venue"/"location" field is the event's
 * location, not the client's, so only clearly-labelled ones (billing / postal / business / home address) are used.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFormFields } from "@/lib/ai/classify";

const ADDRESS_KEYS = ["billing address", "postal address", "business address", "company address", "home address", "your address", "street address", "invoice address", "mailing address"];

export function clientAddressFromForm(message: string | null | undefined): string | null {
  if (!message) return null;
  const fields = parseFormFields(message);
  for (const k of ADDRESS_KEYS) {
    const v = fields[k]?.trim();
    if (v && v.length >= 6 && !/^(n\/?a|none|-+)$/i.test(v)) return v.slice(0, 500);
  }
  return null;
}

const blank = (v: unknown) => v == null || String(v).trim() === "";

export async function fillCustomerFromEnquiry(db: SupabaseClient, orgId: string, enquiryId: string): Promise<string[]> {
  const { data: e } = await db.from("enquiries").select("customer_id, contact_id, contact_name, contact_email, contact_phone, company, message")
    .eq("id", enquiryId).eq("organisation_id", orgId).maybeSingle();
  if (!e?.customer_id) return [];
  const { data: c } = await db.from("customers").select("id, email, phone, address, company").eq("id", e.customer_id).eq("organisation_id", orgId).maybeSingle();
  if (!c) return [];
  const patch: Record<string, string> = {};
  if (blank(c.email) && e.contact_email) patch.email = e.contact_email;
  if (blank(c.phone) && e.contact_phone) patch.phone = e.contact_phone;
  const addr = clientAddressFromForm(e.message);
  if (blank(c.address) && addr) patch.address = addr;
  if (blank(c.company) && e.company) patch.company = e.company;
  if (Object.keys(patch).length) await db.from("customers").update(patch).eq("id", c.id).eq("organisation_id", orgId);
  // The enquirer's own phone on their contact row
  if (e.contact_id && e.contact_phone) await db.from("contacts").update({ phone: e.contact_phone }).eq("id", e.contact_id).eq("organisation_id", orgId).is("phone", null);
  return Object.keys(patch);
}
