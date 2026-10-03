/**
 * Fill in a customer's missing details from their Xero contact: address, phone, and the extra people
 * (Xero "contact persons"). Only blanks are filled — anything already typed into EventureOS is kept.
 * Pure planner (`planContactFill`) is tested with `npx tsx`; `applyContactFill` writes the plan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { contactPhone, type XeroContact } from "./xero-format";

export interface XeroAddressLike { AddressType?: string; AddressLine1?: string; AddressLine2?: string; AddressLine3?: string; AddressLine4?: string; City?: string; Region?: string; PostalCode?: string; Country?: string; AttentionTo?: string }
export type XeroContactFull = XeroContact & { Addresses?: XeroAddressLike[] };

export interface CustomerNow { id: string; email: string | null; phone: string | null; address: string | null }
export interface ContactNow { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; is_primary: boolean }

export interface FillPlan {
  customer: Partial<Pick<CustomerNow, "phone" | "address" | "email">>;
  addContacts: { first_name: string; last_name: string | null; email: string | null; phone: string | null; is_primary: boolean }[];
  contactPhones: { id: string; phone: string }[];
  /** Plain-English list of what changed, for the activity log */
  changes: string[];
}

/** Street address if Xero has one, otherwise the postal address; one line per part. */
export function xeroAddress(c: XeroContactFull): string | null {
  const fmt = (a: XeroAddressLike) => {
    const lines = [a.AddressLine1, a.AddressLine2, a.AddressLine3, a.AddressLine4].map((x) => x?.trim()).filter(Boolean) as string[];
    const town = [a.City, a.Region, a.PostalCode].map((x) => x?.trim()).filter(Boolean).join(" ");
    if (town) lines.push(town);
    const country = a.Country?.trim();
    if (country && !/^(australia|au|aus)$/i.test(country)) lines.push(country);
    return lines.length ? lines.join("\n") : null;
  };
  const list = c.Addresses ?? [];
  for (const type of ["STREET", "POBOX", "DELIVERY"]) {
    const a = list.find((x) => x.AddressType === type);
    const s = a ? fmt(a) : null;
    if (s) return s.slice(0, 500);
  }
  return null;
}

const blank = (v: string | null | undefined) => !v || !v.trim();
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function planContactFill(cust: CustomerNow, people: ContactNow[], x: XeroContactFull): FillPlan {
  const plan: FillPlan = { customer: {}, addContacts: [], contactPhones: [], changes: [] };
  const addr = xeroAddress(x);
  if (blank(cust.address) && addr) { plan.customer.address = addr; plan.changes.push("address"); }
  const phone = contactPhone(x);
  if (blank(cust.phone) && phone) { plan.customer.phone = phone; plan.changes.push("phone"); }
  const email = x.EmailAddress?.trim() || null;
  if (blank(cust.email) && email) { plan.customer.email = email; plan.changes.push("email"); }

  // The main person's phone, if their contact row has none
  const primary = people.find((p) => p.is_primary) ?? people[0];
  if (primary && blank(primary.phone) && phone && (!email || norm(primary.email) === norm(email) || blank(primary.email))) {
    plan.contactPhones.push({ id: primary.id, phone });
  }

  // Extra people from Xero — added when nobody with that email (or that name, if no email) exists yet
  const knownEmails = new Set(people.map((p) => norm(p.email)).filter(Boolean));
  const knownNames = new Set(people.map((p) => norm(`${p.first_name} ${p.last_name ?? ""}`)));
  let hasPrimary = people.length > 0;
  const candidates = [
    ...(people.length === 0 && (x.FirstName?.trim() || email) ? [{ FirstName: x.FirstName, LastName: x.LastName, EmailAddress: email ?? undefined }] : []),
    ...(x.ContactPersons ?? []),
  ];
  for (const p of candidates) {
    const first = p.FirstName?.trim() || null, last = p.LastName?.trim() || null, em = p.EmailAddress?.trim() || null;
    if (!first && !em) continue;
    const name = norm(`${first ?? ""} ${last ?? ""}`);
    if ((em && knownEmails.has(norm(em))) || (!em && knownNames.has(name))) continue;
    plan.addContacts.push({ first_name: (first ?? em!.split("@")[0]).slice(0, 100), last_name: last, email: em, phone: !hasPrimary ? phone : null, is_primary: !hasPrimary });
    if (em) knownEmails.add(norm(em));
    knownNames.add(name);
    hasPrimary = true;
  }
  if (plan.addContacts.length) plan.changes.push(`${plan.addContacts.length} contact${plan.addContacts.length === 1 ? "" : "s"}`);
  return plan;
}

/** Write a plan. Customer fields are only set where still blank (guards against a race with someone editing). */
export async function applyContactFill(db: SupabaseClient, orgId: string, customerId: string, plan: FillPlan, actorId: string | null) {
  for (const [k, v] of Object.entries(plan.customer)) {
    const { error } = await db.from("customers").update({ [k]: v }).eq("id", customerId).eq("organisation_id", orgId).or(`${k}.is.null,${k}.eq.`);
    if (error) throw new Error(`Couldn't update the client's ${k}: ${error.message}`);
  }
  for (const c of plan.contactPhones) {
    await db.from("contacts").update({ phone: c.phone }).eq("id", c.id).eq("organisation_id", orgId).is("phone", null);
  }
  if (plan.addContacts.length) {
    const { error } = await db.from("contacts").insert(plan.addContacts.map((c) => ({ ...c, organisation_id: orgId, customer_id: customerId, created_by: actorId })));
    if (error) throw new Error(`Couldn't add contacts: ${error.message}`);
  }
}
