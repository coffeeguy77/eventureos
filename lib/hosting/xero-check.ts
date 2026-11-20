import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { xeroDate, xeroGet } from "@/lib/integrations/xero";
import { inScope, readScope } from "@/lib/integrations/xero-scope";
import type { XeroRepeating } from "@/lib/recurring/core";

/**
 * Cross-check EventureOS against Xero, live, for a business that shares its Xero file with another (Web Culture
 * and Bean Culture): every Xero customer and every repeating invoice, and which business (if either) has it.
 */
interface XeroContactLite { ContactID: string; Name: string; EmailAddress?: string; IsCustomer?: boolean; IsSupplier?: boolean; ContactStatus?: string }

export interface CheckRepeating {
  id: string; contact: string; contactId: string; reference: string | null; description: string; total: number; status: string;
  every: string; next: string | null; inScopeHere: boolean; looksHosting: boolean;
  here: { recurringId: string; status: string } | null; otherOrg: boolean; customerHere: string | null;
}
export interface CheckContact { id: string; name: string; email: string | null; nameMatch: { id: string; name: string } | null }
export interface XeroCheck {
  checkedAt: string;
  xero: { contacts: number; customers: number; repeating: number };
  repeatingMissing: CheckRepeating[];        // in Xero, not in either business
  repeatingHere: number;                     // already in this business
  repeatingOther: number;                    // in the other business
  hostingWithoutRepeating: { id: string; domain: string; customer: string | null; billing: string | null }[];
  duplicateHosting: { domain: string; count: number; ids: string[] }[];
  customersMissing: CheckContact[];          // Xero customers in neither business
  linkedGone: { id: string; name: string }[];// linked here to a Xero contact that's archived or gone
}

const HOSTING = /host|domain|website|web site|\bssl\b|cpanel|email|e-mail|wordpress|backup|seo|adwords|google ads|\bweb\b/i;
const norm = (s: string) => s.toLowerCase().replace(/\b(pty|ltd|limited|the|inc|co)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function runXeroCheck(ctx: SyncContext, db: SupabaseClient, otherOrgId: string | null): Promise<XeroCheck> {
  const orgId = ctx.org.id;
  // Xero: every contact (active + archived, to spot links to archived ones) and every repeating invoice
  const contacts: XeroContactLite[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await xeroGet<{ Contacts?: XeroContactLite[] }>(ctx, "/Contacts", { page: String(page), pageSize: "200", includeArchived: "true" });
    const list = r.Contacts ?? [];
    contacts.push(...list);
    if (!list.length) break; // keep paging until Xero has none left (don't rely on the page size being honoured)
  }
  const rep = (await xeroGet<{ RepeatingInvoices?: XeroRepeating[] }>(ctx, "/RepeatingInvoices")).RepeatingInvoices ?? [];
  const repeating = rep.filter((x) => (x.Type ?? "ACCREC") === "ACCREC" && x.Status !== "DELETED" && x.Contact?.ContactID);
  const scope = readScope(ctx.integration.settings);

  // EventureOS: customers (both businesses), recurring invoices (both), hosting accounts (here)
  const page = async <T,>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const out: T[] = [];
    for (let i = 0; i < 100; i++) { const { data, error } = await q(i * 1000, i * 1000 + 999); if (error) throw new Error(error.message); out.push(...(data ?? [])); if (!data || data.length < 1000) break; }
    return out;
  };
  const orgs = otherOrgId ? [orgId, otherOrgId] : [orgId];
  const [custs, recs, hosts] = await Promise.all([
    page<{ id: string; organisation_id: string; name: string; xero_contact_id: string | null }>((a, b) => db.from("customers").select("id, organisation_id, name, xero_contact_id").in("organisation_id", orgs).order("id").range(a, b)),
    page<{ id: string; organisation_id: string; status: string; xero_repeating_id: string | null; hosting_account_id: string | null; customer_id: string; category: string | null }>((a, b) => db.from("recurring_invoices").select("id, organisation_id, status, xero_repeating_id, hosting_account_id, customer_id, category").in("organisation_id", orgs).order("id").range(a, b)),
    page<{ id: string; domain: string; customer_id: string | null; billing_status: string | null; on_server: boolean | null }>((a, b) => db.from("hosting_accounts").select("id, domain, customer_id, billing_status, on_server").eq("organisation_id", orgId).order("id").range(a, b)),
  ]);
  const custName = new Map(custs.map((c) => [c.id, c.name]));
  const linkedHere = new Map(custs.filter((c) => c.organisation_id === orgId && c.xero_contact_id).map((c) => [c.xero_contact_id!, c.id]));
  const linkedAny = new Set(custs.filter((c) => c.xero_contact_id).map((c) => c.xero_contact_id!));
  const recByXero = new Map(recs.filter((r) => r.xero_repeating_id).map((r) => [r.xero_repeating_id!, r]));

  let repeatingHere = 0, repeatingOther = 0;
  const repeatingMissing: CheckRepeating[] = [];
  for (const x of repeating) {
    const r = recByXero.get(x.RepeatingInvoiceID);
    if (r && r.organisation_id === orgId) { repeatingHere++; continue; }
    if (r) { repeatingOther++; continue; }
    const desc = (x.LineItems ?? []).map((l) => l.Description ?? "").join(" · ").replace(/\s+/g, " ").trim();
    const s = x.Schedule ?? {};
    repeatingMissing.push({
      id: x.RepeatingInvoiceID, contact: x.Contact?.Name ?? "?", contactId: x.Contact!.ContactID, reference: x.Reference ?? null,
      description: desc.slice(0, 300), total: Number(x.Total ?? 0), status: x.Status ?? "",
      every: `${s.Period ?? 1} ${s.Unit === "WEEKLY" ? "week" : "month"}${(s.Period ?? 1) === 1 ? "" : "s"}`,
      next: xeroDate(s.NextScheduledDate, s.NextScheduledDateString), inScopeHere: inScope(x.LineItems, scope),
      looksHosting: HOSTING.test(`${desc} ${x.Reference ?? ""} ${(x.LineItems ?? []).map((l) => `${l.ItemCode ?? ""} ${l.AccountCode ?? ""}`).join(" ")}`) || (x.LineItems ?? []).some((l) => (l.AccountCode ?? "").startsWith("666")),
      here: null, otherOrg: false, customerHere: linkedHere.get(x.Contact!.ContactID) ?? null,
    });
  }
  repeatingMissing.sort((a, b) => Number(b.looksHosting) - Number(a.looksHosting) || a.contact.localeCompare(b.contact));

  // hosting accounts with no repeating invoice: none linked to the account, and none for its client
  const recHost = new Set(recs.filter((r) => r.organisation_id === orgId && r.hosting_account_id && r.status !== "ended").map((r) => r.hosting_account_id!));
  const recCust = new Set(recs.filter((r) => r.organisation_id === orgId && r.status !== "ended").map((r) => r.customer_id));
  const byDomain = new Map<string, typeof hosts>();
  for (const h of hosts) { const k = h.domain.trim().toLowerCase(); byDomain.set(k, [...(byDomain.get(k) ?? []), h]); }
  const hostingWithoutRepeating = [...byDomain.values()].map((hs) => hs[0])
    .filter((h) => h.on_server !== false && !byDomain.get(h.domain.trim().toLowerCase())!.some((x) => recHost.has(x.id)) && !(h.customer_id && recCust.has(h.customer_id)))
    .map((h) => ({ id: h.id, domain: h.domain, customer: h.customer_id ? custName.get(h.customer_id) ?? null : null, billing: h.billing_status }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
  const duplicateHosting = [...byDomain.entries()].filter(([, hs]) => hs.length > 1).map(([domain, hs]) => ({ domain, count: hs.length, ids: hs.map((h) => h.id) }));

  // Xero customers in neither business (customers = contacts Xero marks as customers), with a same-name client here
  const unlinkedHere = custs.filter((c) => c.organisation_id === orgId && !c.xero_contact_id);
  const byName = new Map<string, { id: string; name: string }>();
  for (const c of unlinkedHere) byName.set(norm(c.name), { id: c.id, name: c.name });
  const customersMissing = contacts.filter((c) => c.IsCustomer && c.ContactStatus !== "ARCHIVED" && !linkedAny.has(c.ContactID))
    .map((c) => ({ id: c.ContactID, name: c.Name, email: c.EmailAddress?.trim() || null, nameMatch: byName.get(norm(c.Name)) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const status = new Map(contacts.map((c) => [c.ContactID, c.ContactStatus ?? "ACTIVE"]));
  const linkedGone = custs.filter((c) => c.organisation_id === orgId && c.xero_contact_id && status.get(c.xero_contact_id) !== "ACTIVE")
    .map((c) => ({ id: c.id, name: `${c.name}${status.has(c.xero_contact_id!) ? " (archived in Xero)" : " (not found in Xero)"}` }));

  return {
    checkedAt: new Date().toISOString(),
    xero: { contacts: contacts.filter((c) => c.ContactStatus !== "ARCHIVED").length, customers: contacts.filter((c) => c.IsCustomer && c.ContactStatus !== "ARCHIVED").length, repeating: repeating.length },
    repeatingMissing, repeatingHere, repeatingOther, hostingWithoutRepeating, duplicateHosting, customersMissing, linkedGone,
  };
}
