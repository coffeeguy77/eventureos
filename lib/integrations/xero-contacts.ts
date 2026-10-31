import "server-only";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { XERO_API, tenantId, xeroGet, xeroPut } from "@/lib/integrations/xero";
import { xeroReason } from "@/lib/integrations/xero-recode";

/**
 * Xero contacts and which contact an invoice is billed to.
 *   GET  /Contacts?where=EmailAddress=="…" | Name=="…"     find one (Xero contact names are unique)
 *   PUT  /Contacts                                       add one
 *   POST /Contacts                                       { Contacts: [{ ContactID, Name, EmailAddress, TaxNumber, … }] } change one
 *   POST /Invoices/{id}                                  { Invoices: [{ InvoiceID, Contact: { ContactID } }] } bill an invoice to another contact
 * https://developer.xero.com/documentation/api/accounting/contacts · …/invoices
 */

export interface ContactFields { name: string; company: string | null; email: string | null; phone: string | null; abn?: string | null; person?: { first: string; last: string | null } | null }

const q = (v: string) => v.replace(/["\\]/g, "").trim();
/** The name Xero shows: the company for a business, otherwise the person. */
export const xeroName = (c: { name: string; company: string | null }) => q(c.company?.trim() || c.name).slice(0, 255);

export async function findXeroContactByName(ctx: SyncContext, name: string): Promise<string | null> {
  const n = q(name);
  if (!n) return null;
  const r = await xeroGet<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { where: `Name=="${n}"` });
  return r.Contacts?.[0]?.ContactID ?? null;
}

/** The customer's Xero contact: by email, then by exact name, else a new one. */
export async function ensureXeroContact(ctx: SyncContext, c: ContactFields): Promise<string> {
  const email = c.email?.trim().toLowerCase() || null;
  if (email) {
    const r = await xeroGet<{ Contacts?: { ContactID: string; ContactStatus?: string }[] }>(ctx, "/Contacts", { where: `EmailAddress=="${q(email)}"` });
    const hit = (r.Contacts ?? []).find((x) => x.ContactStatus !== "ARCHIVED") ?? r.Contacts?.[0];
    if (hit) return hit.ContactID;
  }
  const name = xeroName(c);
  if (!name) throw new Error("the customer has no name");
  const byName = await findXeroContactByName(ctx, name);
  if (byName) return byName;
  const created = await xeroPut<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { Contacts: [contactBody(c)] });
  const id = created.Contacts?.[0]?.ContactID;
  if (!id) throw new Error("Xero didn't return a contact id");
  return id;
}

function contactBody(c: ContactFields) {
  const email = c.email?.trim().toLowerCase() || null;
  const [first, ...rest] = c.person ? [c.person.first, c.person.last ?? ""] : (c.company ? c.name : "").trim().split(/\s+/);
  return {
    Name: xeroName(c),
    ...(email ? { EmailAddress: email } : {}),
    ...(first ? { FirstName: first, LastName: rest.join(" ").trim() || undefined } : {}),
    ...(c.abn ? { TaxNumber: c.abn.replace(/\s+/g, "") } : {}),
    ...(c.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: c.phone }] } : {}),
  };
}

/** Bring an existing Xero contact into line with the customer (name, email, ABN, phone, person). Throws Xero's own reason. */
export async function updateXeroContact(ctx: SyncContext, contactId: string, c: ContactFields): Promise<void> {
  try {
    await apiJSON(ctx, `${XERO_API}/Contacts`, {
      method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" },
      body: JSON.stringify({ Contacts: [{ ContactID: contactId, ...contactBody(c) }] }),
    }, "Xero update contact");
  } catch (e) { throw new Error(xeroReason(e)); }
}

/** Bill an invoice that's already in Xero to another contact. Throws Xero's own reason. */
export async function setXeroInvoiceContact(ctx: SyncContext, xeroInvoiceId: string, contactId: string): Promise<void> {
  try {
    await apiJSON(ctx, `${XERO_API}/Invoices/${encodeURIComponent(xeroInvoiceId)}`, {
      method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" },
      body: JSON.stringify({ Invoices: [{ InvoiceID: xeroInvoiceId, Contact: { ContactID: contactId } }] }),
    }, "Xero change invoice contact");
  } catch (e) { throw new Error(xeroReason(e)); }
}
