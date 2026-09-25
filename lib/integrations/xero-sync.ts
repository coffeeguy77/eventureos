import "server-only";
import { localDate } from "@/lib/ai/classify";
import { customerRecord, loadCustomersForMatching, upsertCandidate } from "@/lib/integrations/gmail-import";
import { bestMatch } from "@/lib/integrations/matching";
import {
  errMessage, finishSyncLog, logIntegration, saveIntegrationSettings, startSyncLog, type SyncContext,
} from "@/lib/integrations/runtime";
import {
  contactPerson, contactPhone, mapInvoiceStatus, xeroDate, xeroGet, xeroPut, xeroTimestamp,
  type XeroContact, type XeroInvoice, type XeroPayment,
} from "@/lib/integrations/xero";

/**
 * Xero ⇄ EventureOS.
 *  - Contacts → MATCH REVIEW candidates (never merged automatically).
 *  - Invoices + payments for customers linked to a Xero contact → EventureOS invoices/payments.
 *    Xero is authoritative: totals, amount paid and status are overwritten from Xero.
 *  - EventureOS invoices (e.g. deposit raised on quote acceptance) for linked customers → pushed to Xero
 *    as DRAFT or AUTHORISED per settings. Customers not yet linked are reported, not guessed.
 */

export interface XeroSettings {
  tenant_id?: string;
  tenant_name?: string;
  tenants?: { tenantId: string; tenantName: string | null }[];
  contacts_synced_at?: string;
  invoices_synced_at?: string;
  payments_synced_at?: string;
  push_invoices?: "off" | "draft" | "authorised";
  sales_account_code?: string;
  tax_type?: string;
}

const MAX_PAGES = 10;

export function xeroSettings(ctx: SyncContext): XeroSettings {
  return (ctx.integration.settings ?? {}) as XeroSettings;
}

export async function syncXero(ctx: SyncContext, opts: { full?: boolean } = {}) {
  const logId = await startSyncLog(ctx, "accounting");
  const s = xeroSettings(ctx);
  const runStarted = new Date().toISOString();
  const counts = { contacts: 0, candidates: 0, invoices: 0, payments: 0, pushed: 0, waiting: 0 };
  const notes: string[] = [];
  try {
    // 1. Contacts → match review
    const customers = await loadCustomersForMatching(ctx);
    const { data: linkedRows } = await ctx.db.from("customers").select("id, xero_contact_id").eq("organisation_id", ctx.org.id).not("xero_contact_id", "is", null);
    const linked = new Map((linkedRows ?? []).map((r) => [r.xero_contact_id as string, r.id as string]));
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await xeroGet<{ Contacts?: XeroContact[] }>(ctx, "/Contacts", { page: String(page), pageSize: "100", includeArchived: "false" }, opts.full ? null : s.contacts_synced_at);
      const list = r.Contacts ?? [];
      for (const c of list) {
        counts.contacts++;
        if (linked.has(c.ContactID)) continue;
        if (c.IsSupplier && !c.IsCustomer) continue; // suppliers aren't customers
        const person = contactPerson(c);
        const incoming = { name: person ?? c.Name, company: person ? c.Name : null, email: c.EmailAddress ?? null, phone: contactPhone(c) };
        const best = bestMatch(incoming, customers, customerRecord, 30);
        await upsertCandidate(ctx, "contact", c.ContactID, {
          contact_id: c.ContactID, name: c.Name, person, email: c.EmailAddress ?? null, phone: contactPhone(c),
          is_customer: !!c.IsCustomer, is_supplier: !!c.IsSupplier, updated: xeroTimestamp(c.UpdatedDateUTC),
        }, best?.item.id ?? null, best?.score ?? null, best?.reasons ?? ["No matching EventureOS customer — keep separate to create one"]);
        counts.candidates++;
      }
      if (list.length < 100) break;
    }

    // 2. Invoices for linked customers (incremental)
    counts.invoices += await syncInvoices(ctx, linked, opts.full ? null : s.invoices_synced_at ?? null);

    // 3. Payments
    counts.payments += await syncPayments(ctx, opts.full ? null : s.payments_synced_at ?? null);

    // 4. Push new EventureOS invoices
    if (s.push_invoices && s.push_invoices !== "off") {
      const r = await pushInvoices(ctx, s);
      counts.pushed = r.pushed; counts.waiting = r.waiting;
      notes.push(...r.errors);
    }

    await saveIntegrationSettings(ctx, { contacts_synced_at: runStarted, invoices_synced_at: runStarted, payments_synced_at: runStarted });
    const msg = `Checked ${counts.contacts} Xero contact${counts.contacts === 1 ? "" : "s"} (${counts.candidates} to review), updated ${counts.invoices} invoice${counts.invoices === 1 ? "" : "s"} and ${counts.payments} payment${counts.payments === 1 ? "" : "s"}` +
      (s.push_invoices && s.push_invoices !== "off" ? `, pushed ${counts.pushed} invoice${counts.pushed === 1 ? "" : "s"} to Xero` : "") +
      (counts.waiting ? ` — ${counts.waiting} invoice${counts.waiting === 1 ? " waits" : "s wait"} for its customer to be matched to a Xero contact` : "") +
      (notes.length ? `. Problems: ${notes.slice(0, 3).join("; ")}` : ".");
    await finishSyncLog(ctx, logId, notes.length ? "partial" : "success", counts.invoices + counts.payments + counts.pushed + counts.candidates, msg);
    if (counts.invoices || counts.payments || counts.pushed) await logIntegration(ctx, { action: "xero.synced", entityType: "integration", entityId: ctx.integration.id, summary: msg });
    return { ...counts, message: msg };
  } catch (e) {
    await finishSyncLog(ctx, logId, "error", 0, `Xero sync failed: ${errMessage(e)}`);
    throw e;
  }
}

/** Invoices for the given linked contacts (all history when `since` is null). Returns rows written. */
export async function syncInvoices(ctx: SyncContext, linked: Map<string, string>, since: string | null, onlyContactIds?: string[]) {
  if (!linked.size) return 0;
  const today = localDate(new Date().toISOString(), ctx.org.timezone);
  let written = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params: Record<string, string> = { page: String(page), pageSize: "100", where: 'Type=="ACCREC"', order: "UpdatedDateUTC ASC" };
    if (onlyContactIds?.length) params.ContactIDs = onlyContactIds.join(",");
    const r = await xeroGet<{ Invoices?: XeroInvoice[] }>(ctx, "/Invoices", params, since);
    const list = r.Invoices ?? [];
    for (const inv of list) {
      const customerId = inv.Contact ? linked.get(inv.Contact.ContactID) : undefined;
      if (!customerId) continue;
      await upsertInvoice(ctx, inv, customerId, today);
      written++;
    }
    if (list.length < 100) break;
  }
  return written;
}

async function upsertInvoice(ctx: SyncContext, inv: XeroInvoice, customerId: string, today: string) {
  const status = mapInvoiceStatus(inv, today);
  const values = {
    total: inv.Total ?? 0, subtotal: inv.SubTotal ?? 0, tax_total: inv.TotalTax ?? 0,
    amount_paid: Math.max(0, (inv.AmountPaid ?? 0) + (inv.AmountCredited ?? 0)),
    status, due_date: xeroDate(inv.DueDate, inv.DueDateString), currency: inv.CurrencyCode ?? ctx.org.currency,
    xero_synced_at: new Date().toISOString(),
  };
  const { data: existing } = await ctx.db.from("invoices").select("id, status, amount_paid, number, event_id")
    .eq("organisation_id", ctx.org.id).eq("xero_invoice_id", inv.InvoiceID).maybeSingle();
  if (existing) {
    const { error } = await ctx.db.from("invoices").update(values).eq("id", existing.id);
    if (error) throw new Error(`Could not update invoice ${existing.number}: ${error.message}`);
    if (existing.status !== status || Number(existing.amount_paid) !== values.amount_paid) {
      await logIntegration(ctx, {
        action: "invoice.synced", entityType: "invoice", entityId: existing.id, customerId, eventId: existing.event_id,
        summary: `Xero updated ${existing.number}: ${existing.status} → ${status}, paid ${values.amount_paid.toFixed(2)}`,
      });
    }
    return;
  }
  let number = inv.InvoiceNumber?.trim() || `XERO-${inv.InvoiceID.slice(0, 8)}`;
  const { data: clash } = await ctx.db.from("invoices").select("id").eq("organisation_id", ctx.org.id).eq("number", number).maybeSingle();
  if (clash) number = `XERO-${number}`;
  const { data: created, error } = await ctx.db.from("invoices").insert({
    organisation_id: ctx.org.id, number, customer_id: customerId, kind: "other",
    issue_date: xeroDate(inv.Date, inv.DateString) ?? today, xero_invoice_id: inv.InvoiceID, ...values,
  }).select("id").single();
  if (error) throw new Error(`Could not import Xero invoice ${number}: ${error.message}`);
  await logIntegration(ctx, { action: "invoice.imported", entityType: "invoice", entityId: created.id, customerId, summary: `Imported ${number} from Xero (${status})` });
}

async function syncPayments(ctx: SyncContext, since: string | null) {
  let written = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await xeroGet<{ Payments?: XeroPayment[] }>(ctx, "/Payments", { page: String(page) }, since);
    const list = r.Payments ?? [];
    const invIds = [...new Set(list.map((p) => p.Invoice?.InvoiceID).filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    for (let i = 0; i < invIds.length; i += 100) {
      const { data } = await ctx.db.from("invoices").select("id, xero_invoice_id").eq("organisation_id", ctx.org.id).in("xero_invoice_id", invIds.slice(i, i + 100));
      for (const d of data ?? []) map.set(d.xero_invoice_id as string, d.id as string);
    }
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
    if (list.length < 100) break;
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
  const n = await syncInvoices(ctx, linked, null, [xeroContactId]);
  const p = await syncPayments(ctx, null);
  return { invoices: n, payments: p };
}

export async function selectTenant(ctx: SyncContext, tenantId: string) {
  const t = (xeroSettings(ctx).tenants ?? []).find((x) => x.tenantId === tenantId);
  if (!t) throw new Error("That Xero organisation isn't part of this connection.");
  await saveIntegrationSettings(ctx, { tenant_id: t.tenantId, tenant_name: t.tenantName, contacts_synced_at: null, invoices_synced_at: null, payments_synced_at: null });
  const { error } = await ctx.db.from("integrations").update({ account_label: t.tenantName, external_account_id: t.tenantId }).eq("id", ctx.integration.id);
  if (error) throw new Error(error.message);
}
