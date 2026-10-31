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
