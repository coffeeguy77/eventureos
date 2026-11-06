import type { HostKvApi } from "@grok/agent-sdk";
import { dollarsToCents, type OpenDoc } from "./match.js";

export type AccountChoice = { id: string; code: string; name: string; type: string; taxType: string | null };
export type BankAccount = { id: string; code: string | null; name: string };

const TOKEN_URL = "https://identity.xero.com/connect/token";
const API = "https://api.xero.com/api.xro/2.0";
const REFRESH_KEY = "xero:refresh_token";
const PAGE_CAP = 2;
const PAGE_SIZE = 100;

export type XeroBooks = {
  organisation: string | null;
  bankAccounts: BankAccount[];
  invoices: OpenDoc[];
  bills: OpenDoc[];
  accounts: AccountChoice[];
  truncated: boolean;
  note: string | null;
};

type TokenCache = { access: string; exp: number };
let tokenCache: TokenCache | null = null;

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_TENANT_ID && process.env.XERO_REFRESH_TOKEN);
}

export class XeroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XeroError";
  }
}

function tenantId(): string {
  const tenant = process.env.XERO_TENANT_ID?.trim();
  if (!tenant) throw new XeroError("XERO_TENANT_ID is missing.");
  return tenant;
}

async function readRefresh(kv: HostKvApi): Promise<string> {
  const stored = await kv.get(REFRESH_KEY);
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  const fromEnv = process.env.XERO_REFRESH_TOKEN?.trim();
  if (!fromEnv) throw new XeroError("XERO_REFRESH_TOKEN is missing.");
  return fromEnv;
}

async function accessToken(kv: HostKvApi): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.exp > now + 60_000) return tokenCache.access;
  const clientId = process.env.XERO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) throw new XeroError("Xero client id or secret is missing.");
  const refresh = await readRefresh(kv);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new XeroError(`Xero did not refresh the connection (${res.status}). Reconnect Xero and save a new refresh token.`);
  let parsed: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number };
  } catch {
    throw new XeroError("Xero returned a token response that was not JSON.");
  }
  if (!parsed.access_token) throw new XeroError("Xero returned no access token.");
  if (parsed.refresh_token && parsed.refresh_token !== refresh) await kv.put(REFRESH_KEY, parsed.refresh_token);
  tokenCache = { access: parsed.access_token, exp: now + (parsed.expires_in ?? 1800) * 1000 };
  return parsed.access_token;
}

function xeroMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { Message?: string; Elements?: { ValidationErrors?: { Message?: string }[] }[] };
    const details = (parsed.Elements ?? []).flatMap((row) => row.ValidationErrors ?? []).map((item) => item.Message).filter(Boolean);
    if (details.length) return details.join("; ").slice(0, 300);
    if (parsed.Message) return parsed.Message.slice(0, 300);
  } catch {
    /* body was not JSON */
  }
  return `Xero returned ${status}.`;
}

async function xero(kv: HostKvApi, path: string, init: { method?: "GET" | "PUT"; body?: unknown; idempotencyKey?: string } = {}, retried = false): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${await accessToken(kv)}`,
    "xero-tenant-id": tenantId(),
    accept: "application/json",
  };
  if (init.body) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (res.status === 401 && !retried) {
    tokenCache = null;
    return xero(kv, path, init, true);
  }
  if (res.status === 429) throw new XeroError("Xero rate limit. Wait a minute and try again.");
  if (!res.ok) throw new XeroError(xeroMessage(res.status, text));
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new XeroError("Xero returned a response that was not JSON.");
  }
}

type XeroAccount = { AccountID?: string; Code?: string; Name?: string; Type?: string; TaxType?: string; Status?: string; Class?: string };
type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  Contact?: { Name?: string };
  DateString?: string;
  DueDateString?: string;
  AmountDue?: number;
  Reference?: string;
};

const CODE_TYPES = new Set(["EXPENSE", "DIRECTCOSTS", "OVERHEADS", "REVENUE", "SALES", "OTHERINCOME", "CURRENT", "FIXED"]);

function mapDoc(row: XeroInvoice, kind: "invoice" | "bill"): OpenDoc | null {
  if (!row.InvoiceID || row.Status !== "AUTHORISED") return null;
  const amountDueCents = dollarsToCents(row.AmountDue ?? 0);
  if (amountDueCents === null || amountDueCents <= 0) return null;
  return {
    id: row.InvoiceID,
    number: row.InvoiceNumber?.trim() || row.InvoiceID.slice(0, 8),
    kind,
    contactName: row.Contact?.Name?.trim() || "Unknown contact",
    date: row.DateString?.slice(0, 10) ?? null,
    dueDate: row.DueDateString?.slice(0, 10) ?? null,
    amountDueCents,
  };
}

async function pages<T>(kv: HostKvApi, path: string, key: string): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 1; page <= PAGE_CAP; page += 1) {
    const joiner = path.includes("?") ? "&" : "?";
    const payload = await xero(kv, `${path}${joiner}page=${page}&pageSize=${PAGE_SIZE}`) as Record<string, T[] | undefined>;
    const batch = payload[key] ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function fetchXeroBooks(kv: HostKvApi): Promise<XeroBooks> {
  const [organisationPayload, accountPayload, invoicePage, billPage] = await Promise.all([
    xero(kv, "/Organisation") as Promise<{ Organisations?: { Name?: string }[] }>,
    xero(kv, "/Accounts") as Promise<{ Accounts?: XeroAccount[] }>,
    pages<XeroInvoice>(kv, `/Invoices?Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCREC"')}`, "Invoices"),
    pages<XeroInvoice>(kv, `/Invoices?Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCPAY"')}`, "Invoices"),
  ]);
  const accountPage = { rows: accountPayload.Accounts ?? [], truncated: false };
  const accounts = accountPage.rows.filter((row) => row.AccountID && row.Status !== "ARCHIVED");
  const bankAccounts = accounts
    .filter((row) => row.Type === "BANK")
    .map((row) => ({ id: row.AccountID as string, code: row.Code ?? null, name: row.Name ?? "Bank" }));
  const choices = accounts
    .filter((row) => row.Code && row.Type && CODE_TYPES.has(row.Type))
    .slice(0, 80)
    .map((row) => ({ id: row.AccountID as string, code: row.Code as string, name: row.Name ?? row.Code as string, type: row.Type as string, taxType: row.TaxType ?? null }));
  const truncated = accountPage.truncated || invoicePage.truncated || billPage.truncated;
  return {
    organisation: organisationPayload.Organisations?.[0]?.Name ?? null,
    bankAccounts,
    invoices: invoicePage.rows.map((row) => mapDoc(row, "invoice")).filter((row): row is OpenDoc => row !== null),
    bills: billPage.rows.map((row) => mapDoc(row, "bill")).filter((row): row is OpenDoc => row !== null),
    accounts: choices,
    truncated,
    note: truncated ? "Only the first 200 open sales invoices and 200 open bills were read." : null,
  };
}

export type Posted = { xeroId: string; kind: "payment" | "bank_transaction" };

export async function postPayment(kv: HostKvApi, input: { invoiceId: string; bankAccountId: string; date: string; amount: number; reference: string; idempotencyKey: string }): Promise<Posted> {
  const payload = await xero(kv, "/Payments", {
    method: "PUT",
    idempotencyKey: input.idempotencyKey,
    body: {
      Payments: [{
        Invoice: { InvoiceID: input.invoiceId },
        Account: { AccountID: input.bankAccountId },
        Date: input.date,
        Amount: input.amount,
        Reference: input.reference.slice(0, 255),
      }],
    },
  }) as { Payments?: { PaymentID?: string }[] };
  const xeroId = payload.Payments?.[0]?.PaymentID;
  if (!xeroId) throw new XeroError("Xero created no payment id.");
  return { xeroId, kind: "payment" };
}

export async function postBankTransaction(kv: HostKvApi, input: { type: "SPEND" | "RECEIVE"; bankAccountId: string; accountCode: string; taxType: string | null; date: string; amount: number; description: string; idempotencyKey: string }): Promise<Posted> {
  const line: { Description: string; Quantity: number; UnitAmount: number; AccountCode: string; TaxType?: string } = {
    Description: input.description.slice(0, 250),
    Quantity: 1,
    UnitAmount: input.amount,
    AccountCode: input.accountCode,
  };
  if (input.taxType) line.TaxType = input.taxType;
  const payload = await xero(kv, "/BankTransactions", {
    method: "PUT",
    idempotencyKey: input.idempotencyKey,
    body: {
      BankTransactions: [{
        Type: input.type,
        BankAccount: { AccountID: input.bankAccountId },
        LineItems: [line],
        LineAmountTypes: "Inclusive",
        Date: input.date,
        Reference: input.description.slice(0, 255),
      }],
    },
  }) as { BankTransactions?: { BankTransactionID?: string }[] };
  const xeroId = payload.BankTransactions?.[0]?.BankTransactionID;
  if (!xeroId) throw new XeroError("Xero created no bank transaction id.");
  return { xeroId, kind: "bank_transaction" };
}
