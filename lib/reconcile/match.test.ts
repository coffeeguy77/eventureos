import { test } from "node:test";
import assert from "node:assert/strict";
import type { BankLine } from "./core";
import { isDeposit, matchDeposits, matchPayouts, payoutLines, type OpenInvoice, type Payout } from "./match";

const L = (k: string, date: string, amount: number, narrative: string, account = "A"): BankLine => ({ key: k, account, date, narrative, amount, transfer: /\bTFR\b/.test(narrative) });
const I = (id: string, balance: number, issueDate: string, customer: string, number: string | null = null): OpenInvoice => ({ id, xeroId: `x${id}`, number, customer, company: null, balance, issueDate, dueDate: null, org: "o" });

test("deposits exclude transfers, card settlements, interest and dishonours", () => {
  assert.ok(isDeposit(L("1", "2026-10-01", 50, "DEPOSIT-OSKO PAYMENT 123 JOHN SMITH")));
  assert.ok(!isDeposit(L("2", "2026-10-01", 50, "DEPOSIT ONLINE 1 TFR Westpac Bus")));
  assert.ok(!isDeposit(L("3", "2026-10-01", 50, "DEPOSIT STRIPE PAYMENTS")));
  assert.ok(!isDeposit(L("4", "2026-10-01", 50, "DEPOSIT SQUARE AU PTY LT")));
  assert.ok(!isDeposit(L("5", "2026-10-01", 50, "DIRECT DEBIT DISHONOURED 12")));
  assert.ok(!isDeposit(L("6", "2026-10-01", -50, "WITHDRAWAL")));
});

test("one invoice of that amount → suggested (to confirm); named → trusted; outside the date window → none", () => {
  const m = matchDeposits([L("1", "2026-10-10", 330, "DEPOSIT-OSKO PAYMENT 99 ACME")], [I("a", 330, "2026-10-01", "Somebody"), I("b", 330, "2025-01-01", "Old")]);
  assert.equal(m.length, 1);
  assert.equal(m[0].invoice?.id, "a");
  assert.equal(m[0].unsure, true);
  const n = matchDeposits([L("1", "2026-10-10", 330, "DEPOSIT-OSKO PAYMENT 99 SOMEBODY")], [I("a", 330, "2026-10-01", "Somebody")]);
  assert.equal(n[0].unsure, false);
});

test("several of the same amount: the named one wins; otherwise you choose", () => {
  const inv = [I("a", 165, "2026-10-01", "Kate Jones"), I("b", 165, "2026-10-02", "Peter Brown")];
  const named = matchDeposits([L("1", "2026-10-10", 165, "DEPOSIT-OSKO PAYMENT 99 PETER BROWN")], inv);
  assert.equal(named[0].invoice?.id, "b");
  assert.equal(named[0].named, true);
  const anon = matchDeposits([L("1", "2026-10-10", 165, "DEPOSIT-OSKO PAYMENT 99")], inv);
  assert.equal(anon[0].invoice, null);
  assert.equal(anon[0].unsure, true);
  assert.equal(anon[0].options.length, 2);
});

test("invoice number in the description; each invoice used once", () => {
  const inv = [I("a", 100, "2026-10-01", "X", "INV-1042"), I("b", 100, "2026-10-01", "Y", "INV-1043")];
  const m = matchDeposits([L("1", "2026-10-05", 100, "DEPOSIT ONLINE INV 1043"), L("2", "2026-10-06", 100, "DEPOSIT ONLINE INV-1042")], inv);
  assert.deepEqual(m.map((x) => x.invoice?.id), ["b", "a"]);
});

const P = (o: Partial<Payout> & { id: string; amount: number; arrival: string }): Payout => ({ gross: o.amount, fees: 0, refunds: 0, other: 0, recorded: 0, recordedRefs: [], count: 1, ...o });

test("payouts match the STRIPE line of the same amount within 3 days", () => {
  const m = matchPayouts([L("1", "2026-10-03", 97.1, "DEPOSIT STRIPE 4F3A"), L("2", "2026-10-03", 97.1, "DEPOSIT OTHER")], [P({ id: "po_1", amount: 97.1, arrival: "2026-10-01" }), P({ id: "po_2", amount: 50, arrival: "2026-10-01" })]);
  assert.equal(m.find((x) => x.payout.id === "po_1")?.line?.key, "1");
  assert.equal(m.find((x) => x.payout.id === "po_2")?.line, null);
});

test("payout lines add up to the payout: recorded → clearing, rest → income, fees negative", () => {
  const p = P({ id: "po", amount: 190.5, arrival: "2026-10-01", gross: 200, fees: 5.5, refunds: -4, recorded: 50, recordedRefs: ["pi_1"], count: 3 });
  const r = payoutLines(p, { clearing: "CLR", income: "200", incomeTax: "OUTPUT", fees: "404", feesTax: "INPUT" });
  assert.deepEqual(r.lines.map((l) => [l.account, l.amount]), [["CLR", 50], ["200", 146], ["404", -5.5]]);
  assert.equal(r.balanced, true);
});
