import { test } from "node:test";
import assert from "node:assert/strict";
import type { BankLine } from "./core";
import type { OpenInvoice } from "./match";
import { batchOf, matchOrdermentum, parseRemittance } from "./ordermentum";

const CSV = `"batch","paid_at","retailer_name","invoice_number","order_numbers","invoice_total"
"OM26092414","2026-09-24T04:13:27.014Z","Café Floriade","OMI2657","[""OMO2657""]","778.00"
"OM26092414","2026-09-24T04:13:27.014Z","Dash Jolimont","OMI2664","[""OMO2664""]","280.00"`;
const L = (amount: number, narrative = "DEPOSIT 2425117 Ordermentum OM26092414"): BankLine => ({ key: "k", account: "A", date: "2026-09-24", narrative, amount, transfer: false });
const I = (number: string, balance: number): OpenInvoice => ({ id: number, xeroId: `x${number}`, number, customer: "c", company: null, balance, issueDate: "2026-09-01", dueDate: null, org: "o" });

test("remittance CSV", () => {
  const r = parseRemittance(CSV);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { batch: "OM26092414", invoice: "OMI2657", amount: 778, retailer: "Café Floriade", paidAt: "2026-09-24" });
  assert.equal(batchOf("DEPOSIT 2425117 Ordermentum OM26092414"), "OM26092414");
  assert.throws(() => parseRemittance("a,b\n1,2"), /remittance/);
});

test("ready when every invoice is open and they add up to the deposit", () => {
  const m = matchOrdermentum([L(1058)], parseRemittance(CSV), [I("OMI2657", 778), I("OMI2664", 280)]);
  assert.equal(m[0].state, "ready");
  assert.equal(m[0].rows.every((r) => r.open), true);
});

test("problems: totals differ, invoice already paid, no remittance", () => {
  assert.equal(matchOrdermentum([L(1000)], parseRemittance(CSV), [I("OMI2657", 778), I("OMI2664", 280)])[0].state, "problem");
  const paid = matchOrdermentum([L(1058)], parseRemittance(CSV), [I("OMI2657", 778)])[0];
  assert.equal(paid.state, "problem");
  assert.match(paid.rows[1].problem ?? "", /Not open/);
  assert.equal(matchOrdermentum([L(1058, "DEPOSIT 1 Ordermentum OM99999999")], parseRemittance(CSV), [])[0].state, "no-remittance");
});
