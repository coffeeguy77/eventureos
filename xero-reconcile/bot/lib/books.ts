import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HostKvApi } from "@grok/agent-sdk";
import { dollarsToCents, type OpenDoc } from "./match.js";
import { fetchXeroBooks, xeroConfigured, type AccountChoice, type BankAccount, type XeroBooks } from "./xero.js";

export type { AccountChoice, BankAccount };

export type Books = {
  source: "xero" | "demo" | "unconfigured";
  organisation: string | null;
  bankAccounts: BankAccount[];
  invoices: OpenDoc[];
  bills: OpenDoc[];
  accounts: AccountChoice[];
  truncated: boolean;
  note: string | null;
};

type FixtureDoc = {
  id: string;
  number: string;
  contactName: string;
  date: string | null;
  dueDate: string | null;
  amountDue: number;
  reference?: string | null;
};

type Fixture = {
  organisation: string;
  bankAccounts: BankAccount[];
  invoices: FixtureDoc[];
  bills: FixtureDoc[];
  accounts: AccountChoice[];
};

function asDoc(row: FixtureDoc, kind: "invoice" | "bill"): OpenDoc {
  const amountDueCents = dollarsToCents(row.amountDue);
  if (amountDueCents === null || amountDueCents <= 0) throw new Error(`Fixture ${row.number} has a bad amount`);
  return {
    id: row.id,
    number: row.number,
    kind,
    contactName: row.contactName,
    date: row.date,
    dueDate: row.dueDate,
    amountDueCents,
  };
}

export function demoBooks(): Books {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/books.json");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  return {
    source: "demo",
    organisation: fixture.organisation,
    bankAccounts: fixture.bankAccounts,
    invoices: fixture.invoices.map((row) => asDoc(row, "invoice")),
    bills: fixture.bills.map((row) => asDoc(row, "bill")),
    accounts: fixture.accounts,
    truncated: false,
    note: "These are sample books, not a Xero organisation. Nothing in this result can be posted.",
  };
}

function unconfiguredBooks(): Books {
  return {
    source: "unconfigured",
    organisation: null,
    bankAccounts: [],
    invoices: [],
    bills: [],
    accounts: [],
    truncated: false,
    note: "Xero is not connected. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REFRESH_TOKEN, and XERO_TENANT_ID.",
  };
}

export async function loadBooks(purpose: string | undefined, kv: HostKvApi): Promise<Books> {
  if (purpose === "eval" || process.env.XERO_RECONCILE_MODE === "demo") return demoBooks();
  if (!xeroConfigured()) return unconfiguredBooks();
  const live: XeroBooks = await fetchXeroBooks(kv);
  return { source: "xero", ...live };
}
