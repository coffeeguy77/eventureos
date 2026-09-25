import "server-only";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Xero Accounting API client (fetch only).
 *  Connections  GET https://api.xero.com/connections → [{ id, tenantId, tenantType, tenantName, createdDateUtc, updatedDateUtc }]
 *               DELETE https://api.xero.com/connections/{id}
 *               https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml
 *               https://developer.xero.com/documentation/guides/oauth2/auth-flow/
 *  Accounting   base https://api.xero.com/api.xro/2.0 ; headers Authorization: Bearer, xero-tenant-id, Accept: application/json;
 *               optional If-Modified-Since. Spec: https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml
 *   GET /Contacts   (page, pageSize, includeArchived, where, summaryOnly)   https://developer.xero.com/documentation/api/accounting/contacts
 *   GET /Invoices   (page, pageSize, where, ContactIDs, Statuses)        https://developer.xero.com/documentation/api/accounting/invoices
 *   PUT /Invoices   create                                                 (POST updates)
 *   GET /Payments   (page, where)                                          https://developer.xero.com/documentation/api/accounting/payments
 *   GET /CreditNotes (page, where)                                         https://developer.xero.com/documentation/api/accounting/creditnotes
 */
export const XERO_API = "https://api.xero.com/api.xro/2.0";
export const XERO_CONNECTIONS = "https://api.xero.com/connections";

export interface XeroConnection { id: string; tenantId: string; tenantType: string; tenantName: string | null; createdDateUtc?: string; updatedDateUtc?: string }

export async function xeroConnectionsWithToken(accessToken: string): Promise<XeroConnection[]> {
  const res = await fetch(XERO_CONNECTIONS, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Xero connections ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as XeroConnection[];
}

export interface XeroPhone { PhoneType?: string; PhoneNumber?: string; PhoneAreaCode?: string; PhoneCountryCode?: string }
export interface XeroContact {
  ContactID: string; ContactStatus?: string; Name: string; FirstName?: string; LastName?: string; EmailAddress?: string;
  Phones?: XeroPhone[]; IsCustomer?: boolean; IsSupplier?: boolean; UpdatedDateUTC?: string;
}
export interface XeroInvoice {
  Type: "ACCREC" | "ACCPAY"; InvoiceID: string; InvoiceNumber?: string; Reference?: string;
  Contact?: { ContactID: string; Name?: string }; Date?: string; DateString?: string; DueDate?: string; DueDateString?: string;
  Status: string; LineAmountTypes?: string; SubTotal?: number; TotalTax?: number; Total?: number; AmountDue?: number; AmountPaid?: number;
  AmountCredited?: number; CurrencyCode?: string; UpdatedDateUTC?: string;
}
export interface XeroPayment { PaymentID: string; Date?: string; Amount?: number; Reference?: string; Status?: string; PaymentType?: string; Invoice?: { InvoiceID: string; InvoiceNumber?: string } }
export interface XeroCreditNote { CreditNoteID: string; CreditNoteNumber?: string; Type?: string; Status?: string; Total?: number; RemainingCredit?: number; Date?: string; DateString?: string; Contact?: { ContactID: string; Name?: string } }

export function tenantId(ctx: SyncContext): string {
  const t = (ctx.integration.settings?.tenant_id as string | undefined) ?? ctx.integration.external_account_id;
  if (!t) throw new Error("No Xero organisation selected — reconnect Xero.");
  return t;
}

export function xeroGet<T>(ctx: SyncContext, path: string, params: Record<string, string> = {}, ifModifiedSince?: string | null) {
  const u = new URL(XERO_API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { "xero-tenant-id": tenantId(ctx) };
  if (ifModifiedSince) headers["If-Modified-Since"] = new Date(ifModifiedSince).toISOString().slice(0, 19);
  return apiJSON<T>(ctx, u.toString(), { headers }, `Xero GET ${path}`);
}

export function xeroPut<T>(ctx: SyncContext, path: string, body: unknown) {
  return apiJSON<T>(ctx, XERO_API + path, {
    method: "PUT", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" }, body: JSON.stringify(body),
  }, `Xero PUT ${path}`);
}

/** Xero JSON dates are "/Date(1518685950940+0000)/" (or ISO in *String fields). Returns YYYY-MM-DD. */
export function xeroDate(v?: string | null, alt?: string | null): string | null {
  const m = v?.match(/\/Date\((-?\d+)/);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  const s = alt ?? v;
  if (s && !Number.isNaN(Date.parse(s))) return s.slice(0, 10);
  return null;
}
export function xeroTimestamp(v?: string | null): string | null {
  const m = v?.match(/\/Date\((-?\d+)/);
  if (m) return new Date(Number(m[1])).toISOString();
  return v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
}

export function contactPhone(c: XeroContact): string | null {
  const order = ["MOBILE", "DEFAULT", "DDI", "OFFICE"];
  const phones = (c.Phones ?? []).filter((p) => p.PhoneNumber?.trim());
  phones.sort((a, b) => order.indexOf(a.PhoneType ?? "") - order.indexOf(b.PhoneType ?? ""));
  const p = phones[0];
  if (!p) return null;
  return [p.PhoneCountryCode ? `+${p.PhoneCountryCode.replace(/^\+/, "")}` : "", p.PhoneAreaCode ?? "", p.PhoneNumber ?? ""].filter(Boolean).join(" ").trim();
}

export function contactPerson(c: XeroContact): string | null {
  const n = [c.FirstName, c.LastName].filter((x) => x?.trim()).join(" ").trim();
  return n || null;
}

/** Map Xero invoice status to EventureOS status (Xero is authoritative). */
export function mapInvoiceStatus(inv: Pick<XeroInvoice, "Status" | "AmountPaid" | "AmountDue" | "DueDate" | "DueDateString">, today: string) {
  switch (inv.Status) {
    case "DRAFT": case "SUBMITTED": return "draft" as const;
    case "PAID": return "paid" as const;
    case "VOIDED": case "DELETED": return "void" as const;
    case "AUTHORISED": {
      const due = xeroDate(inv.DueDate, inv.DueDateString);
      if ((inv.AmountDue ?? 1) <= 0) return "paid" as const;
      if (due && due < today) return "overdue" as const;
      return (inv.AmountPaid ?? 0) > 0 ? ("part_paid" as const) : ("awaiting_payment" as const);
    }
    default: return "awaiting_payment" as const;
  }
}

export async function listCreditNotes(ctx: SyncContext, page = 1) {
  const r = await xeroGet<{ CreditNotes?: XeroCreditNote[] }>(ctx, "/CreditNotes", { page: String(page), where: 'Type=="ACCRECCREDIT"', order: "Date DESC" });
  return r.CreditNotes ?? [];
}
