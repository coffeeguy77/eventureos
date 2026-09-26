import "server-only";
import { localDate } from "@/lib/ai/classify";
import { customerRecord, loadCustomersForMatching, upsertCandidate, type CustomerForMatch } from "@/lib/integrations/gmail-import";
import { bestMatch } from "@/lib/integrations/matching";
import {
  RateLimited, errMessage, finishSyncLog, logIntegration, saveIntegrationSettings, startSyncLog, type SyncContext,
} from "@/lib/integrations/runtime";
import {
  compactLines, contactPerson, contactPhone, mapInvoiceStatus, xeroDate, xeroGet, xeroPut, xeroTimestamp,
  type XeroContact, type XeroInvoice, type XeroPayment, type XeroQuote,
} from "@/lib/integrations/xero";

/**
 * Xero ⇄ EventureOS.
 *  - Sales invoices and quotes (with their lines) become each customer's job history. Xero is authoritative.
 *  - The customer for a Xero contact is found by:
 *      1. an existing link (customers.xero_contact_id)
 *      2. the exact same email address on one EventureOS customer or contact → linked
 *      3. a possible match with a customer that isn't from Xero → MATCH REVIEW (a person decides; its history waits)
 *      4. otherwise a new customer is created from the Xero contact (only contacts with sales are brought in)
 *  - Payments update invoices. EventureOS invoices for linked customers are pushed to Xero per settings.
 *  - Emails and enquiries from a customer's exact address are linked to that customer.
 * Large histories are fetched in batches; progress is saved after every page.
 */

export interface XeroCursor { page: number; run_started: string }
export interface XeroSettings {
  tenant_id?: string;
  tenant_name?: string;
  tenants?: { tenantId: string; tenantName: string | null }[];
  contacts_synced_at?: string | null;
  invoices_synced_at?: string | null;
  quotes_synced_at?: string | null;
  payments_synced_at?: string | null;
  cursors?: Partial<Record<Phase, XeroCursor | null>>;
  push_invoices?: "off" | "draft" | "authorised";
  sales_account_code?: string;
  tax_type?: string;
}
type Phase = "invoices" | "quotes" | "payments";

const TIME_BUDGET_MS = 40_000;

export function xeroSettings(ctx: SyncContext): XeroSettings {
  return (ctx.integration.settings ?? {}) as XeroSettings;
}

interface Resolver {
  linked: Map<string, string>;           // Xero ContactID → customer id
  waiting: Set<string>;                  // contacts sent to match review this run
  customers: CustomerForMatch[];         // non-Xero customers, for matching
  byEmail: Map<string, string | null>;   // lower(email) → customer id (null = ambiguous)
  created: number;
  linkedByEmail: number;
  review: number;
}

async function loadResolver(ctx: SyncContext): Promise<Resolver> {
  const all = await loadCustomersForMatching(ctx);
  const { data: linkedRows, error } = await ctx.db.from("customers").select("id, xero_contact_id").eq("organisation_id", ctx.org.id).not("xero_contact_id", "is", null);
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  const linked = new Map((linkedRows ?? []).map((r) => [r.xero_contact_id as string, r.id as string]));
  const fromXero = new Set(linked.values());
  const byEmail = new Map<string, string | null>();
  const addEmail = (e: string | null | undefined, id: string) => {
    const k = e?.trim().toLowerCase();
    if (!k) return;
    byEmail.set(k, byEmail.has(k) && byEmail.get(k) !== id ? null : id);
  };
  for (const c of all) { addEmail(c.email, c.id); for (const k of c.contacts) addEmail(k.email, c.id); }
  return { linked, waiting: new Set(), customers: all.filter((c) => !fromXero.has(c.id)), byEmail, created: 0, linkedByEmail: 0, review: 0 };
}

/** Make sure every contact id has a customer (or is waiting for review). Fetches unknown contacts from Xero in one call. */
async function resolveContacts(ctx: SyncContext, R: Resolver, contactIds: string[]) {
  const todo = [...new Set(contactIds)].filter((id) => id && !R.linked.has(id) && !R.waiting.has(id));
  if (!todo.length) return;
  const contacts: XeroContact[] = [];
  for (let i = 0; i < todo.length; i += 50) {
    const r = await xeroGet<{ Contacts?: XeroContact[] }>(ctx, "/Contacts", { IDs: todo.slice(i, i + 50).join(","), includeArchived: "true" });
    contacts.push(...(r.Contacts ?? []));
  }
  for (const c of contacts) {
    const person = contactPerson(c);
    const email = c.EmailAddress?.trim() || null;
    const phone = contactPhone(c);

    // 2. exact email
    const exact = email ? R.byEmail.get(email.toLowerCase()) : undefined;
    if (exact) {
      const { error } = await ctx.db.from("customers").update({ xero_contact_id: c.ContactID }).eq("id", exact).eq("organisation_id", ctx.org.id).is("xero_contact_id", null);
      if (error) throw new Error(`Could not link ${c.Name}: ${error.message}`);
      const { data: check } = await ctx.db.from("customers").select("xero_contact_id").eq("id", exact).maybeSingle();
      if (check?.xero_contact_id === c.ContactID) {
        R.linked.set(c.ContactID, exact);
        R.customers = R.customers.filter((x) => x.id !== exact);
        R.linkedByEmail++;
        await logIntegration(ctx, { action: "customer.xero_linked", entityType: "customer", entityId: exact, customerId: exact, summary: `Linked to Xero contact “${c.Name}” (same email ${email})` });
        continue;
      }
      // That customer is already linked to a different Xero contact → fall through to review
    }

    // 3. possible match with a non-Xero customer → review
    const incoming = { name: person ?? c.Name, company: person ? c.Name : null, email, phone };
    const best = bestMatch(incoming, R.customers, customerRecord, 40);
    if (best || exact) {
      await upsertCandidate(ctx, "contact", c.ContactID, {
        contact_id: c.ContactID, name: c.Name, person, email, phone,
        is_customer: !!c.IsCustomer, is_supplier: !!c.IsSupplier, updated: xeroTimestamp(c.UpdatedDateUTC),
      }, best?.item.id ?? exact ?? null, best?.score ?? null, best?.reasons ?? [`Same email as a customer already linked to another Xero contact`]);
      R.waiting.add(c.ContactID);
      R.review++;
      continue;
    }

    // 4. new customer from Xero
    const isCompany = !!person && person.toLowerCase() !== c.Name.trim().toLowerCase();
    const { data: cust, error } = await ctx.db.from("customers").insert({
      organisation_id: ctx.org.id, kind: isCompany ? "company" : "individual", name: c.Name.trim().slice(0, 200),
      company: isCompany ? c.Name.trim().slice(0, 200) : null, email, phone, source: "other", tags: ["Xero"], xero_contact_id: c.ContactID,
      created_by: ctx.actorId,
    }).select("id").single();
    if (error) throw new Error(`Could not create customer ${c.Name}: ${error.message}`);
    const people = [
      ...(person || email ? [{ first: c.FirstName?.trim() || (isCompany ? null : c.Name.trim().split(/\s+/)[0]), last: c.LastName?.trim() || null, email }] : []),
      ...(c.ContactPersons ?? []).map((p) => ({ first: p.FirstName?.trim() || null, last: p.LastName?.trim() || null, email: p.EmailAddress?.trim() || null })),
    ].filter((p) => p.first || p.email);
    const seen = new Set<string>();
    const rows = people.filter((p) => { const k = `${p.first}|${p.last}|${p.email}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((p, i) => ({
        organisation_id: ctx.org.id, customer_id: cust.id, first_name: (p.first ?? p.email!.split("@")[0]).slice(0, 100), last_name: p.last,
        email: p.email, phone: i === 0 ? phone : null, is_primary: i === 0, created_by: ctx.actorId,
      }));
    if (rows.length) {
      const { error: kErr } = await ctx.db.from("contacts").insert(rows);
      if (kErr) throw new Error(`Could not add contacts for ${c.Name}: ${kErr.message}`);
    }
    R.linked.set(c.ContactID, cust.id);
    if (email) R.byEmail.set(email.toLowerCase(), cust.id);
    R.created++;
  }
  // Contacts Xero didn't return (deleted) are simply skipped
}

/** Run one paged phase until it finishes or the time budget runs out. Returns true when complete. */
async function pagedPhase<T>(ctx: SyncContext, phase: Phase, deadline: number, fetchPage: (page: number, since: string | null) => Promise<T[]>,
  handle: (items: T[]) => Promise<void>, pageSize = 100): Promise<boolean> {
  const s = xeroSettings(ctx);
  const sinceKey = `${phase}_synced_at` as const;
  let cursor = s.cursors?.[phase] ?? null;
  if (!cursor) cursor = { page: 1, run_started: new Date().toISOString() };
  const since = (s[sinceKey] as string | null | undefined) ?? null;
  while (Date.now() < deadline) {
    const items = await fetchPage(cursor.page, since);
    await handle(items);
    if (items.length < pageSize) {
      await saveIntegrationSettings(ctx, { [sinceKey]: cursor.run_started, cursors: { ...(xeroSettings(ctx).cursors ?? {}), [phase]: null } });
      return true;
    }
    cursor = { ...cursor, page: cursor.page + 1 };
    await saveIntegrationSettings(ctx, { cursors: { ...(xeroSettings(ctx).cursors ?? {}), [phase]: cursor } });
  }
  return false;
}

export async function syncXero(ctx: SyncContext, opts: { full?: boolean } = {}) {
  const logId = await startSyncLog(ctx, "accounting");
  const deadline = Date.now() + TIME_BUDGET_MS;
  if (opts.full) await saveIntegrationSettings(ctx, { invoices_synced_at: null, quotes_synced_at: null, payments_synced_at: null, cursors: {} });
  const s = xeroSettings(ctx);
  const counts = { invoices: 0, quotes: 0, payments: 0, pushed: 0, waiting: 0 };
  const notes: string[] = [];
  let done = false, rateLimited = false;
  let R: Resolver | null = null;
  try {
    R = await loadResolver(ctx);
    const today = localDate(new Date().toISOString(), ctx.org.timezone);

    // 1. Sales invoices → history
    let complete = await pagedPhase<XeroInvoice>(ctx, "invoices", deadline,
      async (page, since) => (await xeroGet<{ Invoices?: XeroInvoice[] }>(ctx, "/Invoices",
        { page: String(page), pageSize: "100", where: 'Type=="ACCREC"', order: "UpdatedDateUTC ASC" }, since)).Invoices ?? [],
      async (list) => {
        const keep = list.filter((i) => i.Status !== "DELETED" && i.Contact?.ContactID);
        await resolveContacts(ctx, R!, keep.map((i) => i.Contact!.ContactID));
        counts.invoices += await upsertInvoices(ctx, keep, R!.linked, today);
      });

    // 2. Quotes → history
    if (complete) complete = await pagedPhase<XeroQuote>(ctx, "quotes", deadline,
      async (page, since) => (await xeroGet<{ Quotes?: XeroQuote[] }>(ctx, "/Quotes", { page: String(page), order: "UpdatedDateUTC ASC" }, since)).Quotes ?? [],
      async (list) => {
        const keep = list.filter((q) => q.Status !== "DELETED" && q.Contact?.ContactID);
        await resolveContacts(ctx, R!, keep.map((q) => q.Contact!.ContactID));
        counts.quotes += await upsertQuotes(ctx, keep, R!.linked);
      });

    // 3. Payments
    if (complete) complete = await pagedPhase<XeroPayment>(ctx, "payments", deadline,
      async (page, since) => (await xeroGet<{ Payments?: XeroPayment[] }>(ctx, "/Payments", { page: String(page), pageSize: "100" }, since)).Payments ?? [],
      async (list) => { counts.payments += await upsertPayments(ctx, list); });

    // 4. Push new EventureOS invoices
    if (complete && s.push_invoices && s.push_invoices !== "off") {
      const r = await pushInvoices(ctx, s);
      counts.pushed = r.pushed; counts.waiting = r.waiting;
      notes.push(...r.errors);
    }
    done = complete;
  } catch (e) {
    if (!(e instanceof RateLimited)) {
      await finishSyncLog(ctx, logId, "error", 0, `Xero sync failed: ${errMessage(e)}`);
      throw e;
    }
    rateLimited = true;
  }

  // 5. Link emails and enquiries to customers by exact address
  let linkedMail = { enquiries: 0, threads: 0 };
  if (R && (R.created || R.linkedByEmail || done)) {
    const { data, error } = await ctx.db.rpc("link_customer_emails", { p_org: ctx.org.id });
    if (error) notes.push(`Linking emails: ${error.message}`);
    else linkedMail = data as typeof linkedMail;
  }

  const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts = [
    `${pl(counts.invoices, "invoice")}, ${pl(counts.quotes, "quote")} and ${pl(counts.payments, "payment")} updated`,
    R?.created ? `${pl(R.created, "new customer")} from Xero` : null,
    R?.linkedByEmail ? `${pl(R.linkedByEmail, "customer")} linked by email` : null,
    R?.review ? `${pl(R.review, "contact")} to check in Match review` : null,
    linkedMail.threads || linkedMail.enquiries ? `${pl(linkedMail.threads, "email conversation")} and ${pl(linkedMail.enquiries, "enquiry")} linked to customers` : null,
    s.push_invoices && s.push_invoices !== "off" && done ? `${pl(counts.pushed, "invoice")} pushed to Xero` : null,
    counts.waiting ? `${pl(counts.waiting, "invoice")} waiting for its customer to be matched to a Xero contact` : null,
  ].filter(Boolean);
  const msg = parts.join(", ") +
    // "more will be fetched" (without "slow down") lets Sync now continue automatically
    (done ? "." : rateLimited ? ". Xero asked us to slow down — the rest will be fetched on the next sync." : ". More will be fetched on the next sync.") +
    (notes.length ? ` Problems: ${notes.slice(0, 3).join("; ")}` : "");
  const message = msg;
  await finishSyncLog(ctx, logId, done && !notes.length ? "success" : "partial",
    counts.invoices + counts.quotes + counts.payments + counts.pushed + (R?.created ?? 0), message);
  if (counts.invoices || counts.quotes || counts.payments || counts.pushed || R?.created) {
    await logIntegration(ctx, { action: "xero.synced", entityType: "integration", entityId: ctx.integration.id, summary: `Xero sync: ${message}` });
  }
  return { ...counts, message };
}

async function upsertInvoices(ctx: SyncContext, list: XeroInvoice[], linked: Map<string, string>, today: string) {
  const rows = list.filter((i) => linked.has(i.Contact!.ContactID));
  if (!rows.length) return 0;
  const { data: existing, error } = await ctx.db.from("invoices").select("id, xero_invoice_id, number, customer_id")
    .eq("organisation_id", ctx.org.id).in("xero_invoice_id", rows.map((r) => r.InvoiceID));
  if (error) throw new Error(`Could not load invoices: ${error.message}`);
  const have = new Map((existing ?? []).map((e) => [e.xero_invoice_id as string, e]));
  const values = (inv: XeroInvoice) => ({
    total: inv.Total ?? 0, subtotal: inv.SubTotal ?? 0, tax_total: inv.TotalTax ?? 0,
    amount_paid: Math.max(0, (inv.AmountPaid ?? 0) + (inv.AmountCredited ?? 0)),
    status: mapInvoiceStatus(inv, today), due_date: xeroDate(inv.DueDate, inv.DueDateString), currency: inv.CurrencyCode ?? ctx.org.currency,
    reference: inv.Reference?.slice(0, 500) || null, line_items: inv.LineItems ? compactLines(inv.LineItems) : undefined,
    xero_synced_at: new Date().toISOString(),
  });
  let written = 0;
  for (const inv of rows.filter((r) => have.has(r.InvoiceID))) {
    const { error: uErr } = await ctx.db.from("invoices").update(values(inv)).eq("id", have.get(inv.InvoiceID)!.id);
    if (uErr) throw new Error(`Could not update invoice ${inv.InvoiceNumber}: ${uErr.message}`);
    written++;
  }
  const fresh = rows.filter((r) => !have.has(r.InvoiceID));
  if (fresh.length) {
    const wanted = fresh.map((i) => i.InvoiceNumber?.trim() || `XERO-${i.InvoiceID.slice(0, 8)}`);
    const { data: clash } = await ctx.db.from("invoices").select("number").eq("organisation_id", ctx.org.id).in("number", wanted);
    const taken = new Set((clash ?? []).map((c) => c.number as string));
    const { error: iErr } = await ctx.db.from("invoices").insert(fresh.map((inv, i) => ({
      organisation_id: ctx.org.id, number: taken.has(wanted[i]) ? `XERO-${wanted[i]}` : wanted[i], customer_id: linked.get(inv.Contact!.ContactID)!, kind: "other",
      issue_date: xeroDate(inv.Date, inv.DateString) ?? today, xero_invoice_id: inv.InvoiceID, ...values(inv),
    })));
    if (iErr) throw new Error(`Could not import Xero invoices: ${iErr.message}`);
    written += fresh.length;
  }
  return written;
}

async function upsertQuotes(ctx: SyncContext, list: XeroQuote[], linked: Map<string, string>) {
  const rows = list.filter((q) => linked.has(q.Contact!.ContactID)).map((q) => ({
    organisation_id: ctx.org.id, customer_id: linked.get(q.Contact!.ContactID)!, xero_quote_id: q.QuoteID,
    number: q.QuoteNumber ?? null, reference: q.Reference?.slice(0, 500) || null, title: q.Title?.slice(0, 500) || null, summary: q.Summary?.slice(0, 4000) || null,
    status: q.Status, quote_date: xeroDate(q.Date, q.DateString), expiry_date: xeroDate(q.ExpiryDate, q.ExpiryDateString),
    subtotal: q.SubTotal ?? 0, tax_total: q.TotalTax ?? 0, total: q.Total ?? 0, currency: q.CurrencyCode ?? ctx.org.currency,
    line_items: compactLines(q.LineItems), xero_updated_at: xeroTimestamp(q.UpdatedDateUTC),
  }));
  if (!rows.length) return 0;
  const { error } = await ctx.db.from("xero_quotes").upsert(rows, { onConflict: "organisation_id,xero_quote_id" });
  if (error) throw new Error(`Could not save Xero quotes: ${error.message}`);
  return rows.length;
}

async function upsertPayments(ctx: SyncContext, list: XeroPayment[]) {
  const invIds = [...new Set(list.map((p) => p.Invoice?.InvoiceID).filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  for (let i = 0; i < invIds.length; i += 100) {
    const { data } = await ctx.db.from("invoices").select("id, xero_invoice_id").eq("organisation_id", ctx.org.id).in("xero_invoice_id", invIds.slice(i, i + 100));
    for (const d of data ?? []) map.set(d.xero_invoice_id as string, d.id as string);
  }
  let written = 0;
  for (const p of list) {
    const invoiceId = p.Invoice ? map.get(p.Invoice.InvoiceID) : undefined;
    if (!invoiceId) continue;
    if (p.Status === "DELETED" || !p.Amount || p.Amount <= 0) {
      await ctx.db.from("payments").delete().eq("organisation_id", ctx.org.id).eq("xero_payment_id", p.PaymentID);
      written++;
      continue;
    }
    const { error } = await ctx.db.from("payments").upsert({
      organisation_id: ctx.org.id, invoice_id: invoiceId, amount: p.Amount,
      paid_at: xeroTimestamp(p.Date) ?? new Date().toISOString(), method: "Xero", reference: p.Reference ?? null, xero_payment_id: p.PaymentID,
    }, { onConflict: "organisation_id,xero_payment_id" });
    if (error) throw new Error(`Could not save Xero payment: ${error.message}`);
    written++;
  }
  return written;
}

async function pushInvoices(ctx: SyncContext, s: XeroSettings) {
  const errors: string[] = [];
  let pushed = 0;
  const { data: rows, error } = await ctx.db.from("invoices")
    .select("id, number, kind, issue_date, due_date, total, currency, status, customer_id, event_id, customer:customers(name, xero_contact_id), event:events(name)")
    .eq("organisation_id", ctx.org.id).is("xero_invoice_id", null).neq("status", "void").limit(50);
  if (error) throw new Error(`Could not load invoices to push: ${error.message}`);
  type Row = { id: string; number: string; kind: string; issue_date: string; due_date: string | null; total: number; currency: string; status: string; customer_id: string; event_id: string | null; customer: { name: string; xero_contact_id: string | null } | null; event: { name: string } | null };
  const list = (rows ?? []) as unknown as Row[];
  const ready = list.filter((r) => r.customer?.xero_contact_id);
  for (const inv of ready) {
    const kindLabel = inv.kind === "deposit" ? "Deposit" : inv.kind === "final" ? "Final balance" : "Services";
    const body = {
      Invoices: [{
        Type: "ACCREC",
        Contact: { ContactID: inv.customer!.xero_contact_id },
        Date: inv.issue_date,
        DueDate: inv.due_date ?? inv.issue_date,
        InvoiceNumber: inv.number,
        Reference: inv.event?.name?.slice(0, 255) ?? undefined,
        LineAmountTypes: "Inclusive",
        Status: s.push_invoices === "authorised" ? "AUTHORISED" : "DRAFT",
        CurrencyCode: inv.currency,
        LineItems: [{
          Description: `${kindLabel}${inv.event?.name ? ` — ${inv.event.name}` : ""}`,
          Quantity: 1, UnitAmount: Number(inv.total),
          AccountCode: s.sales_account_code || "200",
          TaxType: s.tax_type || "OUTPUT",
        }],
      }],
    };
    try {
      const r = await xeroPut<{ Invoices?: XeroInvoice[] }>(ctx, "/Invoices", body);
      const x = r.Invoices?.[0];
      if (!x?.InvoiceID) throw new Error("Xero did not return an invoice id");
      const { error: uErr } = await ctx.db.from("invoices").update({ xero_invoice_id: x.InvoiceID, xero_synced_at: new Date().toISOString() }).eq("id", inv.id);
      if (uErr) throw new Error(uErr.message);
      await logIntegration(ctx, { action: "invoice.pushed", entityType: "invoice", entityId: inv.id, customerId: inv.customer_id, eventId: inv.event_id, summary: `${inv.number} sent to Xero as ${body.Invoices[0].Status}` });
      pushed++;
    } catch (e) {
      errors.push(`${inv.number}: ${errMessage(e)}`);
    }
  }
  return { pushed, waiting: list.length - ready.length, errors };
}

/** After a person links a customer to a Xero contact in MATCH REVIEW, bring in that contact's history. */
export async function importHistoryForContact(ctx: SyncContext, xeroContactId: string, customerId: string) {
  const linked = new Map([[xeroContactId, customerId]]);
  const today = localDate(new Date().toISOString(), ctx.org.timezone);
  let invoices = 0, quotes = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await xeroGet<{ Invoices?: XeroInvoice[] }>(ctx, "/Invoices", { page: String(page), pageSize: "100", where: 'Type=="ACCREC"', ContactIDs: xeroContactId });
    const list = (r.Invoices ?? []).filter((i) => i.Status !== "DELETED" && i.Contact?.ContactID);
    invoices += await upsertInvoices(ctx, list, linked, today);
    if ((r.Invoices ?? []).length < 100) break;
  }
  for (let page = 1; page <= 20; page++) {
    const r = await xeroGet<{ Quotes?: XeroQuote[] }>(ctx, "/Quotes", { page: String(page), ContactID: xeroContactId });
    const list = (r.Quotes ?? []).filter((q) => q.Status !== "DELETED" && q.Contact?.ContactID);
    quotes += await upsertQuotes(ctx, list, linked);
    if ((r.Quotes ?? []).length < 100) break;
  }
  let payments = 0;
  for (let page = 1; page <= 10; page++) {
    const r = await xeroGet<{ Payments?: XeroPayment[] }>(ctx, "/Payments", { page: String(page), pageSize: "100" });
    payments += await upsertPayments(ctx, r.Payments ?? []);
    if ((r.Payments ?? []).length < 100) break;
  }
  await ctx.db.rpc("link_customer_emails", { p_org: ctx.org.id });
  return { invoices, quotes, payments };
}

export async function selectTenant(ctx: SyncContext, tenantId: string) {
  const t = (xeroSettings(ctx).tenants ?? []).find((x) => x.tenantId === tenantId);
  if (!t) throw new Error("That Xero organisation isn't part of this connection.");
  await saveIntegrationSettings(ctx, { tenant_id: t.tenantId, tenant_name: t.tenantName, contacts_synced_at: null, invoices_synced_at: null, quotes_synced_at: null, payments_synced_at: null, cursors: {} });
  const { error } = await ctx.db.from("integrations").update({ account_label: t.tenantName, external_account_id: t.tenantId }).eq("id", ctx.integration.id);
  if (error) throw new Error(error.message);
}
