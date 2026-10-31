import "server-only";
import { ApiError, apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { XERO_API, tenantId, xeroDate, xeroGet, xeroPut } from "@/lib/integrations/xero";
import type { XeroTransferLite } from "./core";

/**
 * Xero side of Reconcile.
 *  GET /Accounts?where=Type=="BANK"     your bank accounts (accounting.settings.read)
 *  GET /BankTransfers?where=Date>=…     transfers already in Xero (accounting.banktransactions[.read])
 *  PUT /BankTransfers?summarizeErrors=false   create transfers (accounting.banktransactions)
 *      https://developer.xero.com/documentation/api/accounting/banktransfers
 * Created transfers are unreconciled: in Xero each side's bank line then shows the transfer as a match to OK.
 */
export interface XeroBank { id: string; name: string; number: string | null; status: string }

/** The connection was made before EventureOS asked for bank transactions. */
export function canTransfer(scopes: string[] | null | undefined) {
  return (scopes ?? []).some((s) => s === "accounting.banktransactions" || s === "accounting.transactions");
}

export async function xeroBankAccounts(ctx: SyncContext): Promise<XeroBank[]> {
  const r = await xeroGet<{ Accounts?: { AccountID: string; Name: string; BankAccountNumber?: string; Status?: string; Type?: string }[] }>(ctx, "/Accounts", { where: 'Type=="BANK"' });
  return (r.Accounts ?? []).filter((a) => a.Status !== "ARCHIVED").map((a) => ({ id: a.AccountID, name: a.Name, number: a.BankAccountNumber ?? null, status: a.Status ?? "ACTIVE" }));
}

const permission = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);
const NEEDS = "Xero hasn't given EventureOS permission for bank transfers yet — reconnect Xero (button at the top) and approve the new access.";

export async function xeroTransfersSince(ctx: SyncContext, from: string): Promise<XeroTransferLite[]> {
  const [y, m, d] = from.split("-").map(Number);
  try {
    const r = await xeroGet<{ BankTransfers?: { BankTransferID: string; FromBankAccount?: { AccountID: string }; ToBankAccount?: { AccountID: string }; Amount?: number; Date?: string; DateString?: string }[] }>(
      ctx, "/BankTransfers", { where: `Date>=DateTime(${y},${m},${d})` });
    return (r.BankTransfers ?? []).flatMap((t) => {
      const date = xeroDate(t.Date, t.DateString);
      return t.FromBankAccount && t.ToBankAccount && date ? [{ id: t.BankTransferID, from: t.FromBankAccount.AccountID, to: t.ToBankAccount.AccountID, amount: Number(t.Amount ?? 0), date }] : [];
    });
  } catch (e) { if (permission(e)) throw new Error(NEEDS); throw e; }
}

export interface NewTransfer { key: string; from: string; to: string; amount: number; date: string }
export interface SentResult { key: string; ok: boolean; id?: string; error?: string }

/** Create transfers, 50 at a time; each one succeeds or fails on its own. */
export async function createXeroTransfers(ctx: SyncContext, items: NewTransfer[]): Promise<SentResult[]> {
  const out: SentResult[] = [];
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    try {
      const r = await xeroPut<{ BankTransfers?: { BankTransferID?: string; StatusAttributeString?: string; ValidationErrors?: { Message?: string }[] }[] }>(ctx, "/BankTransfers?summarizeErrors=false", {
        BankTransfers: chunk.map((t) => ({ FromBankAccount: { AccountID: t.from }, ToBankAccount: { AccountID: t.to }, Amount: t.amount.toFixed(2), Date: t.date })),
      });
      const back = r.BankTransfers ?? [];
      chunk.forEach((t, k) => {
        const b = back[k];
        const errs = (b?.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
        if (b?.BankTransferID && !errs.length && b.StatusAttributeString !== "ERROR") out.push({ key: t.key, ok: true, id: b.BankTransferID });
        else out.push({ key: t.key, ok: false, error: errs.join("; ") || "Xero didn't accept it." });
      });
    } catch (e) {
      if (permission(e)) throw new Error(NEEDS);
      const msg = e instanceof Error ? e.message.slice(0, 200) : "Xero didn't accept these.";
      for (const t of chunk) out.push({ key: t.key, ok: false, error: msg });
    }
  }
  return out;
}

// ── Invoices and Stripe payouts ──────────────────────────────────────────────────────────────────

export interface XeroAccountLite { id: string; code: string | null; name: string; type: string; cls: string | null }
export interface XeroTaxRate { type: string; name: string; rate: number }

export async function xeroAccountsAll(ctx: SyncContext): Promise<XeroAccountLite[]> {
  const r = await xeroGet<{ Accounts?: { AccountID: string; Code?: string; Name: string; Type?: string; Class?: string; Status?: string }[] }>(ctx, "/Accounts");
  return (r.Accounts ?? []).filter((a) => a.Status !== "ARCHIVED").map((a) => ({ id: a.AccountID, code: a.Code ?? null, name: a.Name, type: a.Type ?? "", cls: a.Class ?? null }));
}
export async function xeroTaxRates(ctx: SyncContext): Promise<XeroTaxRate[]> {
  const r = await xeroGet<{ TaxRates?: { Name: string; TaxType: string; Status?: string; EffectiveRate?: number }[] }>(ctx, "/TaxRates");
  return (r.TaxRates ?? []).filter((t) => t.Status !== "DELETED" && t.Status !== "ARCHIVED").map((t) => ({ type: t.TaxType, name: t.Name, rate: Number(t.EffectiveRate ?? 0) }));
}

export interface NewPayment { key: string; invoice: string; bank: string; amount: number; date: string; reference: string }

/** Record invoice payments into the right bank account — only while Xero still shows that much owing. */
export async function createXeroPayments(ctx: SyncContext, items: NewPayment[]): Promise<SentResult[]> {
  const out: SentResult[] = [];
  const due = new Map<string, { status: string; due: number }>();
  for (let i = 0; i < items.length; i += 40) {
    const ids = items.slice(i, i + 40).map((t) => t.invoice).join(",");
    const r = await xeroGet<{ Invoices?: { InvoiceID: string; Status: string; AmountDue?: number }[] }>(ctx, "/Invoices", { IDs: ids, summaryOnly: "true" });
    for (const inv of r.Invoices ?? []) due.set(inv.InvoiceID, { status: inv.Status, due: Number(inv.AmountDue ?? 0) });
  }
  const ok: NewPayment[] = [];
  for (const t of items) {
    const d = due.get(t.invoice);
    if (!d) out.push({ key: t.key, ok: false, error: "Xero couldn't find that invoice." });
    else if (d.status !== "AUTHORISED" || d.due + 0.005 < t.amount) out.push({ key: t.key, ok: false, error: d.status === "PAID" ? "Already paid in Xero." : `Xero shows $${d.due.toFixed(2)} owing (${d.status.toLowerCase()}).` });
    else ok.push(t);
  }
  for (let i = 0; i < ok.length; i += 50) {
    const chunk = ok.slice(i, i + 50);
    try {
      const r = await xeroPut<{ Payments?: { PaymentID?: string; StatusAttributeString?: string; ValidationErrors?: { Message?: string }[] }[] }>(ctx, "/Payments?summarizeErrors=false", {
        Payments: chunk.map((t) => ({ Invoice: { InvoiceID: t.invoice }, Account: { AccountID: t.bank }, Date: t.date, Amount: t.amount.toFixed(2), Reference: t.reference.slice(0, 255) })),
      });
      chunk.forEach((t, k) => {
        const b = (r.Payments ?? [])[k];
        const errs = (b?.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
        out.push(b?.PaymentID && !errs.length && b.StatusAttributeString !== "ERROR" ? { key: t.key, ok: true, id: b.PaymentID } : { key: t.key, ok: false, error: errs.join("; ") || "Xero didn't accept it." });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "Xero didn't accept these.";
      for (const t of chunk) out.push({ key: t.key, ok: false, error: msg });
    }
  }
  return out;
}

/** The contact for payout deposits (Xero needs one on every bank transaction) — found by name, or added. */
async function depositContact(ctx: SyncContext, name: string): Promise<string> {
  const safe = name.replace(/"/g, "").slice(0, 100) || "Stripe";
  const r = await xeroGet<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { where: `Name=="${safe}"` });
  if (r.Contacts?.[0]) return r.Contacts[0].ContactID;
  const c = await xeroPut<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { Contacts: [{ Name: safe }] });
  const id = c.Contacts?.[0]?.ContactID;
  if (!id) throw new Error(`Couldn't add the contact "${safe}" in Xero.`);
  return id;
}

/** Payout deposits already in Xero (Reference = payout id): their Xero id and whether they've been reconciled. */
export async function payoutsInXero(ctx: SyncContext, ids: string[]): Promise<Map<string, { id: string; reconciled: boolean }>> {
  const found = new Map<string, { id: string; reconciled: boolean }>();
  for (let i = 0; i < ids.length; i += 15) {
    const where = ids.slice(i, i + 15).map((id) => `Reference!=null&&Reference.StartsWith("${id.replace(/[^\w]/g, "")}")`).join(" OR ");
    try {
      const r = await xeroGet<{ BankTransactions?: { BankTransactionID: string; Reference?: string; Status?: string; IsReconciled?: boolean }[] }>(ctx, "/BankTransactions", { where });
      // the reference starts with the payout id (then who paid)
      for (const t of r.BankTransactions ?? []) if (t.Reference && t.Status !== "DELETED" && t.Status !== "VOIDED") found.set(t.Reference.split(/\s/)[0], { id: t.BankTransactionID, reconciled: !!t.IsReconciled });
    } catch (e) { if (permission(e)) throw new Error(NEEDS); throw e; }
  }
  return found;
}

/** Take back deposits EventureOS made (only while they're not reconciled — Xero won't delete a reconciled one). */
export async function deleteDeposits(ctx: SyncContext, items: { key: string; id: string }[]): Promise<SentResult[]> {
  const out: SentResult[] = [];
  for (const t of items) {
    try {
      await apiJSON(ctx, `${XERO_API}/BankTransactions/${t.id}`, { method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" }, body: JSON.stringify({ BankTransactions: [{ BankTransactionID: t.id, Status: "DELETED" }] }) }, "Xero POST /BankTransactions");
      out.push({ key: t.key, ok: true, id: t.id });
    } catch (e) {
      if (permission(e)) throw new Error(NEEDS);
      out.push({ key: t.key, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Xero didn't remove it." });
    }
  }
  return out;
}

export interface NewDeposit { key: string; payoutId: string; bank: string; date: string; reference?: string; lines: { description: string; account: string; amount: number; tax: string | null }[] }

/** One "receive money" per payout into the bank it landed in, coded across your accounts (amounts include GST). */
export async function createPayoutDeposits(ctx: SyncContext, items: NewDeposit[], contactName: string): Promise<SentResult[]> {
  if (!items.length) return [];
  const contact = await depositContact(ctx, contactName);
  const out: SentResult[] = [];
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    try {
      const r = await xeroPut<{ BankTransactions?: { BankTransactionID?: string; StatusAttributeString?: string; ValidationErrors?: { Message?: string }[] }[] }>(ctx, "/BankTransactions?summarizeErrors=false", {
        BankTransactions: chunk.map((t) => ({
          Type: "RECEIVE", Contact: { ContactID: contact }, BankAccount: { AccountID: t.bank }, Date: t.date, Reference: (t.reference ?? t.payoutId).slice(0, 255), LineAmountTypes: "Inclusive",
          LineItems: t.lines.map((l) => ({ Description: l.description, Quantity: 1, UnitAmount: l.amount.toFixed(2), AccountCode: l.account, ...(l.tax ? { TaxType: l.tax } : {}) })),
        })),
      });
      chunk.forEach((t, k) => {
        const b = (r.BankTransactions ?? [])[k];
        const errs = (b?.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
        out.push(b?.BankTransactionID && !errs.length && b.StatusAttributeString !== "ERROR" ? { key: t.key, ok: true, id: b.BankTransactionID } : { key: t.key, ok: false, error: errs.join("; ") || "Xero didn't accept it." });
      });
    } catch (e) {
      if (permission(e)) throw new Error(NEEDS);
      const msg = e instanceof Error ? e.message.slice(0, 200) : "Xero didn't accept these.";
      for (const t of chunk) out.push({ key: t.key, ok: false, error: msg });
    }
  }
  return out;
}

// ── Ordermentum: one batch payment per payout ────────────────────────────────────────────────────

export interface NewBatch { key: string; batch: string; bank: string; date: string; reference: string; payments: { invoice: string; amount: number }[] }

/** Batches already in Xero (the reference starts with the Ordermentum batch code): id, reference, reconciled. */
export async function batchesInXero(ctx: SyncContext, refs: string[]): Promise<Map<string, { id: string; reference: string; reconciled: boolean }>> {
  const found = new Map<string, { id: string; reference: string; reconciled: boolean }>();
  for (let i = 0; i < refs.length; i += 15) {
    const where = refs.slice(i, i + 15).map((r) => `Reference!=null&&Reference.StartsWith("${r.replace(/[^\w]/g, "")}")`).join(" OR ");
    const r = await xeroGet<{ BatchPayments?: { BatchPaymentID: string; Reference?: string; Status?: string; IsReconciled?: boolean | string }[] }>(ctx, "/BatchPayments", { where });
    for (const b of r.BatchPayments ?? []) if (b.Reference && b.Status !== "DELETED") found.set(b.Reference.split(/\s/)[0], { id: b.BatchPaymentID, reference: b.Reference, reconciled: b.IsReconciled === true || b.IsReconciled === "true" });
  }
  return found;
}

/** Remove an unreconciled batch payment (to put it back with the invoice list in its reference). */
export async function deleteBatchPayment(ctx: SyncContext, id: string) {
  await apiJSON(ctx, `${XERO_API}/BatchPayments`, { method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" }, body: JSON.stringify({ BatchPaymentID: id, Status: "DELETED" }) }, "Xero POST /BatchPayments");
}

/** "OM26092414 · OMI2657 Café Floriade $778.00; …" — shown on Xero's reconcile screen (Xero allows 255 characters). */
export function batchReference(batch: string, list: { invoice: string; retailer: string; amount: number }[]) {
  const head = `${batch} · `;
  let text = head;
  for (let k = 0; k < list.length; k++) {
    const part = `${k ? "; " : ""}${list[k].invoice} ${list[k].retailer} $${list[k].amount.toFixed(2)}`;
    const more = `; +${list.length - k} more`;
    if ((text + part).length > (k < list.length - 1 ? 255 - more.length : 255)) return text + more;
    text += part;
  }
  return text;
}

/**
 * Each payout as one Xero batch payment into the bank it landed in (a single transaction to match), after checking
 * every invoice is still owing in Xero. Never twice for the same batch code.
 */
export async function createBatchPayments(ctx: SyncContext, items: NewBatch[], opts: { replace?: boolean } = {}): Promise<SentResult[]> {
  const out: SentResult[] = [];
  const there = await batchesInXero(ctx, items.map((t) => t.batch));
  const due = new Map<string, { status: string; due: number }>();
  const ids = [...new Set(items.flatMap((t) => t.payments.map((p) => p.invoice)))];
  for (let i = 0; i < ids.length; i += 40) {
    const r = await xeroGet<{ Invoices?: { InvoiceID: string; Status: string; AmountDue?: number }[] }>(ctx, "/Invoices", { IDs: ids.slice(i, i + 40).join(","), summaryOnly: "true" });
    for (const inv of r.Invoices ?? []) due.set(inv.InvoiceID, { status: inv.Status, due: Number(inv.AmountDue ?? 0) });
  }
  for (const t of items) {
    const old = there.get(t.batch);
    if (old) {
      if (!opts.replace) { out.push({ key: t.key, ok: true, error: "Already in Xero" }); continue; }
      if (old.reconciled) { out.push({ key: t.key, ok: false, error: "Already reconciled in Xero — left as it is." }); continue; }
      if (old.reference === t.reference) { out.push({ key: t.key, ok: true, error: "Already in Xero with the invoice list" }); continue; }
      try { await deleteBatchPayment(ctx, old.id); } catch (e) { out.push({ key: t.key, ok: false, error: `Couldn't replace the old one: ${e instanceof Error ? e.message.slice(0, 160) : "Xero refused"}` }); continue; }
      // its invoices are owing again now: check against that
      for (const p of t.payments) { const d = due.get(p.invoice); if (d) due.set(p.invoice, { status: "AUTHORISED", due: d.due + p.amount }); }
    }
    const bad = t.payments.find((p) => { const d = due.get(p.invoice); return !d || d.status !== "AUTHORISED" || d.due + 0.005 < p.amount; });
    if (bad) { out.push({ key: t.key, ok: false, error: "An invoice in this batch isn't owing that much in Xero any more — reconcile this one by hand." }); continue; }
    try {
      const r = await xeroPut<{ BatchPayments?: { BatchPaymentID?: string; ValidationErrors?: { Message?: string }[] }[] }>(ctx, "/BatchPayments", {
        BatchPayments: [{ Account: { AccountID: t.bank }, Date: t.date, Reference: t.reference.slice(0, 255), Payments: t.payments.map((p) => ({ Invoice: { InvoiceID: p.invoice }, Amount: p.amount.toFixed(2) })) }],
      });
      const b = r.BatchPayments?.[0];
      const errs = (b?.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
      out.push(b?.BatchPaymentID && !errs.length ? { key: t.key, ok: true, id: b.BatchPaymentID } : { key: t.key, ok: false, error: errs.join("; ") || "Xero didn't accept it." });
    } catch (e) {
      out.push({ key: t.key, ok: false, error: e instanceof Error ? e.message.slice(0, 220) : "Xero didn't accept it." });
    }
  }
  return out;
}
