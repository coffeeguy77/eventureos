import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadBooks, type Books } from "../lib/books.js";
import { dollarsToCents, isoDate, matchLine, normalizeText, type Candidate } from "../lib/match.js";
import { XeroError } from "../lib/xero.js";

const MAX_CENTS = 100_000_000;

type ReviewLine = {
  date: string;
  amount: number;
  description: string;
  problem: string | null;
  recommended: Candidate | null;
  candidates: Candidate[];
};

type ReviewResult = {
  ok: true;
  source: Books["source"];
  organisation: string | null;
  note: string | null;
  truncated: boolean;
  needsBankAccount: boolean;
  bankAccount: Books["bankAccounts"][number] | null;
  bankAccounts: Books["bankAccounts"];
  lines: ReviewLine[];
};

export default defineTool({
  description: "Match statement lines to open Xero invoices and bills. Reads books. Does not post anything to Xero.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    lines: z.array(z.object({
      date: z.string(),
      amount: z.number(),
      description: z.string(),
    })).min(1).max(25),
    bankAccountId: z.string().min(1).max(80).optional(),
  }),
  async execute(input, ctx): Promise<ReviewResult> {
    let books: Books;
    try {
      books = await loadBooks(ctx.session.purpose, ctx.host.kv);
    } catch (error) {
      const message = error instanceof XeroError ? error.message : "Could not read the books.";
      return { ok: true, source: "unconfigured", organisation: null, note: message, truncated: false, needsBankAccount: false, bankAccount: null, bankAccounts: [], lines: [] };
    }
    if (books.source !== "unconfigured" && books.bankAccounts.length !== 1 && !input.bankAccountId) {
      return {
        ok: true,
        source: books.source,
        organisation: books.organisation,
        note: "More than one bank account is available. Ask which account this statement belongs to, then call this tool again with bankAccountId.",
        truncated: books.truncated,
        needsBankAccount: true,
        bankAccount: null,
        bankAccounts: books.bankAccounts,
        lines: [],
      };
    }
    const bank = books.bankAccounts.find((row) => row.id === input.bankAccountId) ?? books.bankAccounts[0] ?? null;
    if (books.source !== "unconfigured" && !bank) {
      return {
        ok: true,
        source: books.source,
        organisation: books.organisation,
        note: "That bankAccountId is not one of the bank accounts in these books.",
        truncated: books.truncated,
        needsBankAccount: true,
        bankAccount: null,
        bankAccounts: books.bankAccounts,
        lines: [],
      };
    }
    const docs = [...books.invoices, ...books.bills];
    const lines: ReviewLine[] = [];
    for (const line of input.lines) {
      const date = isoDate(line.date);
      const amountCents = dollarsToCents(line.amount);
      const description = normalizeText(line.description);
      if (!date || amountCents === null || amountCents === 0 || Math.abs(amountCents) > MAX_CENTS || description.length < 1 || description.length > 500) {
        lines.push({
          date: line.date,
          amount: line.amount,
          description: line.description,
          problem: "Use a YYYY-MM-DD date, a non-zero amount with at most 2 decimal places, and a description of 1 to 500 characters. The limit is 1,000,000.",
          recommended: null,
          candidates: [],
        });
        continue;
      }
      const matched = bank ? matchLine({ date, amountCents, description }, docs, bank.id) : { recommended: null, candidates: [] };
      lines.push({ date, amount: amountCents / 100, description, problem: null, recommended: matched.recommended, candidates: matched.candidates });
    }
    return {
      ok: true,
      source: books.source,
      organisation: books.organisation,
      note: books.note,
      truncated: books.truncated,
      needsBankAccount: false,
      bankAccount: bank,
      bankAccounts: books.bankAccounts,
      lines,
    };
  },
});
