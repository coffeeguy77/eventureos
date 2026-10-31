import { test } from "node:test";
import assert from "node:assert/strict";
import { alreadyInXero, bankDate, pairTransfers, parseCsv, parseStatement, sameAccountNumber, transferNote } from "./core";

const H = "Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial\n";
const row = (acc: string, d: string, n: string, debit: string, credit: string) => `${acc},${d},"${n}",${debit},${credit},0,PAYMENT,\n`;

test("csv with quotes and commas", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\n1,2,3'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  assert.equal(bankDate("30/10/2026"), "2026-10-30");
  assert.equal(bankDate("1/2/26"), "2026-02-01");
  assert.equal(bankDate("2026-10-30"), "2026-10-30");
  assert.equal(bankDate("nope"), null);
});

test("Westpac export: accounts, signed amounts, transfer lines", () => {
  const s = parseStatement(H + row("032730283424", "30/10/2026", "WITHDRAWAL MOBILE 1748372 TFR Westpac Bus SERVER", "120.00", "") + row("032730281701", "30/10/2026", "DEPOSIT ONLINE 2846116 TFR Westpac Bus SERVER", "", "120.00") + row("032730281701", "29/10/2026", "DEBIT CARD PURCHASE WOOLWORTHS", "55.10", ""));
  assert.equal(s.accounts.length, 2);
  assert.equal(s.lines[0].amount, -120);
  assert.equal(s.lines[1].amount, 120);
  assert.equal(s.lines.filter((l) => l.transfer).length, 2);
  assert.equal(transferNote(s.lines[0].narrative), "SERVER");
});

test("not a statement → plain message", () => {
  assert.throws(() => parseStatement("name,email\nbob,b@x.com"), /bank statement export/);
});

test("pairs: same amount, other account, closest date; identical lines kept apart", () => {
  const s = parseStatement(H
    + row("A", "01/10/2026", "WITHDRAWAL MOBILE 1 TFR Westpac Bus", "170.00", "")
    + row("A", "01/10/2026", "WITHDRAWAL MOBILE 2 TFR Westpac Bus", "170.00", "")
    + row("B", "01/10/2026", "DEPOSIT ONLINE 3 TFR Westpac Bus", "", "170.00")
    + row("B", "01/10/2026", "DEPOSIT ONLINE 4 TFR Westpac Bus", "", "170.00")
    + row("A", "05/10/2026", "WITHDRAWAL MOBILE 5 TFR Westpac Bus", "500.00", "")
    + row("C", "20/10/2026", "DEPOSIT ONLINE 6 TFR Westpac Bus", "", "500.00"));
  const p = pairTransfers(s.lines);
  assert.equal(p.pairs.length, 2);
  assert.equal(p.unpaired.length, 2); // the $500 lands 15 days later: not paired
  assert.ok(p.pairs.every((x) => x.out.account === "A" && x.in.account === "B" && !x.unsure));
});

test("unsure when the same amount went to two accounts that day", () => {
  const s = parseStatement(H
    + row("A", "01/10/2026", "WITHDRAWAL MOBILE 1 TFR Westpac Bus", "100.00", "")
    + row("B", "01/10/2026", "DEPOSIT ONLINE 2 TFR Westpac Bus", "", "100.00")
    + row("C", "01/10/2026", "DEPOSIT ONLINE 3 TFR Westpac Bus", "", "100.00"));
  const p = pairTransfers(s.lines);
  assert.equal(p.pairs.length, 1);
  assert.equal(p.pairs[0].unsure, true);
  assert.equal(p.unpaired.length, 1);
});

test("date range limits what's paired", () => {
  const s = parseStatement(H + row("A", "01/09/2026", "TFR x", "10.00", "") + row("B", "01/09/2026", "TFR x", "", "10.00") + row("A", "01/10/2026", "TFR y", "20.00", "") + row("B", "01/10/2026", "TFR y", "", "20.00"));
  assert.equal(pairTransfers(s.lines, { from: "2026-09-15" }).pairs.length, 1);
});

test("account numbers on digits", () => {
  assert.ok(sameAccountNumber("032730283424", "032-730 283424"));
  assert.ok(sameAccountNumber("032730283424", "283424"));
  assert.ok(!sameAccountNumber("032730283424", "283440"));
  assert.ok(!sameAccountNumber("", "283440"));
});

test("already in Xero: same accounts and amount within 3 days, each Xero transfer used once", () => {
  const pairs = [
    { key: "a", from: "X", to: "Y", amount: 170, date: "2026-10-01" },
    { key: "b", from: "X", to: "Y", amount: 170, date: "2026-10-01" },
    { key: "c", from: "Y", to: "X", amount: 170, date: "2026-10-01" },
  ];
  const hit = alreadyInXero(pairs, [{ id: "1", from: "X", to: "Y", amount: 170, date: "2026-10-02" }]);
  assert.deepEqual([...hit], ["a"]);
});
