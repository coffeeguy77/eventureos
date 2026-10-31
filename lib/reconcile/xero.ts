import "server-only";
import { ApiError, type SyncContext } from "@/lib/integrations/runtime";
import { xeroDate, xeroGet, xeroPut } from "@/lib/integrations/xero";
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

/** The "Stripe" contact for payout deposits (Xero needs a contact on every bank transaction). */
async function stripeContact(ctx: SyncContext): Promise<string> {
  const r = await xeroGet<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { where: 'Name=="Stripe"' });
  if (r.Contacts?.[0]) return r.Contacts[0].ContactID;
  const c = await xeroPut<{ Contacts?: { ContactID: string }[] }>(ctx, "/Contacts", { Contacts: [{ Name: "Stripe" }] });
  const id = c.Contacts?.[0]?.ContactID;
  if (!id) throw new Error("Couldn't add a Stripe contact in Xero.");
  return id;
}

/** Payout ids that already have a Xero deposit (Reference = payout id). */
export async function payoutsInXero(ctx: SyncContext, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 15) {
    const where = ids.slice(i, i + 15).map((id) => `Reference=="${id.replace(/[^\w]/g, "")}"`).join(" OR ");
    try {
      const r = await xeroGet<{ BankTransactions?: { Reference?: string; Status?: string }[] }>(ctx, "/BankTransactions", { where });
      for (const t of r.BankTransactions ?? []) if (t.Reference && t.Status !== "DELETED" && t.Status !== "VOIDED") found.add(t.Reference);
    } catch (e) { if (permission(e)) throw new Error(NEEDS); throw e; }
  }
  return found;
}

export interface NewDeposit { key: string; payoutId: string; bank: string; date: string; lines: { description: string; account: string; amount: number; tax: string | null }[] }

/** One "receive money" per payout into the bank it landed in, coded across your accounts (amounts include GST). */
export async function createPayoutDeposits(ctx: SyncContext, items: NewDeposit[]): Promise<SentResult[]> {
  if (!items.length) return [];
  const contact = await stripeContact(ctx);
  const out: SentResult[] = [];
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    try {
      const r = await xeroPut<{ BankTransactions?: { BankTransactionID?: string; StatusAttributeString?: string; ValidationErrors?: { Message?: string }[] }[] }>(ctx, "/BankTransactions?summarizeErrors=false", {
        BankTransactions: chunk.map((t) => ({
          Type: "RECEIVE", Contact: { ContactID: contact }, BankAccount: { AccountID: t.bank }, Date: t.date, Reference: t.payoutId, LineAmountTypes: "Inclusive",
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
