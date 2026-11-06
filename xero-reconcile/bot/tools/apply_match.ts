import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loadBooks } from "../lib/books.js";
import { dollarsToCents, isoDate, matchLine, normalizeText, proposalId } from "../lib/match.js";
import { postBankTransaction, postPayment, xeroConfigured, XeroError } from "../lib/xero.js";

const MAX_CENTS = 100_000_000;
const lineFields = {
  date: z.string(),
  amount: z.number(),
  description: z.string(),
  bankAccountId: z.string().min(1).max(80),
  confirm: z.literal(true),
};

type ApplyResult = {
  applied: boolean;
  reason?: string;
  proposalId?: string;
  xeroId?: string;
  kind?: "payment" | "bank_transaction";
  alreadyExisted?: boolean;
};

function appliedKey(id: string): string {
  return `xero:applied:${id}`;
}

export default defineTool({
  description: "Create one confirmed Xero payment or spend/receive transaction. Does not mark a bank statement line reconciled.",
  execution: "server",
  effect: "idempotent",
  needsApproval: () => xeroConfigured() && process.env.XERO_RECONCILE_MODE !== "demo",
  dryRunResult: { applied: false, reason: "Dry run. Nothing was posted to Xero." },
  inputSchema: z.discriminatedUnion("action", [
    z.object({
      action: z.enum(["pay_invoice", "pay_bill"]),
      proposalId: z.string().regex(/^[a-f0-9]{32}$/),
      targetLabel: z.string().min(1).max(200),
      ...lineFields,
    }),
    z.object({
      action: z.enum(["spend_money", "receive_money"]),
      accountCode: z.string().min(1).max(20),
      ...lineFields,
    }),
  ]),
  async execute(input, ctx): Promise<ApplyResult> {
    const action = input.action;
    const bankAccountId = input.bankAccountId;
    const proposal = action === "pay_invoice" || action === "pay_bill" ? input.proposalId : null;
    const targetLabel = action === "pay_invoice" || action === "pay_bill" ? input.targetLabel : null;
    const accountCode = action === "spend_money" || action === "receive_money" ? input.accountCode : null;
    if (ctx.session.purpose === "eval" || process.env.XERO_RECONCILE_MODE === "demo") {
      return { applied: false, reason: "This session is using sample books. Nothing was posted to Xero." };
    }
    const date = isoDate(input.date);
    const amountCents = dollarsToCents(input.amount);
    const description = normalizeText(input.description);
    if (!date || amountCents === null || amountCents === 0 || Math.abs(amountCents) > MAX_CENTS || description.length < 1 || description.length > 500) {
      return { applied: false, reason: "Date must be YYYY-MM-DD, amount must be non-zero with at most 2 decimal places, and the description must be 1 to 500 characters. The limit is 1,000,000." };
    }
    let books;
    try {
      books = await loadBooks(ctx.session.purpose, ctx.host.kv);
    } catch (error) {
      return { applied: false, reason: error instanceof XeroError ? error.message : "Could not read the books." };
    }
    if (books.source !== "xero") return { applied: false, reason: books.note ?? "Xero is not connected." };
    const bank = books.bankAccounts.find((row) => row.id === bankAccountId);
    if (!bank) return { applied: false, reason: "That bank account is not in this Xero organisation." };

    if (action === "pay_invoice" || action === "pay_bill") {
      const matched = matchLine({ date, amountCents, description }, [...books.invoices, ...books.bills], bank.id);
      const candidate = matched.candidates.find((row) => row.proposalId === proposal && row.action === action);
      if (!candidate) return { applied: false, reason: "That proposal is no longer a safe match. Review the statement line again." };
      if (candidate.label !== targetLabel) return { applied: false, reason: `The label does not match this proposal. Use ${candidate.label}.` };
      const existing = await ctx.host.kv.get(appliedKey(candidate.proposalId));
      if (existing && typeof existing === "object" && existing !== null && "xeroId" in existing && typeof existing.xeroId === "string") {
        const kind = "kind" in existing && existing.kind === "bank_transaction" ? "bank_transaction" : "payment";
        return { applied: true, proposalId: candidate.proposalId, xeroId: existing.xeroId, kind, alreadyExisted: true };
      }
      try {
        const posted = await postPayment(ctx.host.kv, {
          invoiceId: candidate.targetId,
          bankAccountId: bank.id,
          date,
          amount: Math.abs(amountCents) / 100,
          reference: description,
          idempotencyKey: `pay-${candidate.proposalId}`,
        });
        await ctx.host.kv.put(appliedKey(candidate.proposalId), { xeroId: posted.xeroId, kind: posted.kind });
        return { applied: true, proposalId: candidate.proposalId, xeroId: posted.xeroId, kind: posted.kind, alreadyExisted: false };
      } catch (error) {
        return { applied: false, reason: error instanceof XeroError ? error.message : "Xero did not create the payment." };
      }
    }

    if (!accountCode) return { applied: false, reason: "An account code is required for spend and receive." };
    const account = books.accounts.find((row) => row.code === accountCode);
    if (!account) return { applied: false, reason: "That account code is not in the chart returned for coding." };
    if (action === "spend_money" && amountCents > 0) return { applied: false, reason: "A spend line must be a negative amount." };
    if (action === "receive_money" && amountCents < 0) return { applied: false, reason: "A receive line must be a positive amount." };
    const id = proposalId({ bankAccountId: bank.id, date, amountCents, description, action, targetId: account.code });
    const existing = await ctx.host.kv.get(appliedKey(id));
    if (existing && typeof existing === "object" && existing !== null && "xeroId" in existing && typeof existing.xeroId === "string") {
      const kind = "kind" in existing && existing.kind === "payment" ? "payment" : "bank_transaction";
      return { applied: true, proposalId: id, xeroId: existing.xeroId, kind, alreadyExisted: true };
    }
    try {
      const posted = await postBankTransaction(ctx.host.kv, {
        type: action === "spend_money" ? "SPEND" : "RECEIVE",
        bankAccountId: bank.id,
        accountCode: account.code,
        taxType: account.taxType,
        date,
        amount: Math.abs(amountCents) / 100,
        description,
        idempotencyKey: `txn-${id}`,
      });
      await ctx.host.kv.put(appliedKey(id), { xeroId: posted.xeroId, kind: posted.kind });
      return { applied: true, proposalId: id, xeroId: posted.xeroId, kind: posted.kind, alreadyExisted: false };
    } catch (error) {
      return { applied: false, reason: error instanceof XeroError ? error.message : "Xero did not create the bank transaction." };
    }
  },
});
