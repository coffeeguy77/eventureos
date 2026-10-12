import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLines, lineTotals, linesChangeSummary, startLines } from "./lines";

test("lineTotals: GST worked back out of inclusive prices; GST-free lines too", () => {
  assert.deepEqual(lineTotals([{ quantity: 4, unit_amount: 440, tax_rate: 10 }, { quantity: 1, unit_amount: 50, tax_rate: 0 }]), { total: 1810, subtotal: 1650, tax: 160 });
});

test("cleanLines: refuses bad input, marks lines inc", () => {
  assert.throws(() => cleanLines([]), /at least one/);
  assert.throws(() => cleanLines([{ description: "", quantity: 1, unit_amount: 1 }]), /description/);
  assert.throws(() => cleanLines([{ description: "x", quantity: 0, unit_amount: 1 }]), /quantity/);
  assert.throws(() => cleanLines([{ description: "x", quantity: 1, unit_amount: 1.234 }]), /two decimal/);
  const [l] = cleanLines([{ description: " Cart ", quantity: "2", unit_amount: "440", tax_rate: 0, service_id: "nope" }]);
  assert.deepEqual(l, { description: "Cart", quantity: 2, unit_amount: 440, tax_rate: 0, item_code: null, account_code: null, service_id: null, inc: true });
});

test("startLines: a full invoice starts from the quote's lines (inc GST)", () => {
  const items = [
    { name: "Coffee Cart Hire", description: "4 days", quantity: 4, tax_rate: 10, line_total: 1600, is_optional: false, code: "CartHire", account: "209" },
    { name: "Optional extra", description: null, quantity: 1, tax_rate: 10, line_total: 100, is_optional: true },
  ];
  const lines = startLines({ kind: "full", total: 1760, line_items: null, xero_invoice_id: null, label: "Invoice" }, items);
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].description, lines[0].quantity, lines[0].unit_amount, lines[0].item_code], ["Coffee Cart Hire\n4 days", 4, 440, "CartHire"]);
});

test("startLines: falls back to one line when the quote doesn't add up (e.g. a deposit)", () => {
  const items = [{ name: "Cart", description: null, quantity: 1, tax_rate: 10, line_total: 1000, is_optional: false }];
  assert.deepEqual(startLines({ kind: "deposit", total: 330, line_items: null, xero_invoice_id: null, label: "Deposit — Gala" }, items),
    [{ description: "Deposit — Gala", quantity: 1, unit_amount: 330, tax_rate: 10, inc: true }]);
});

test("startLines: edited lines win; Xero's own lines aren't trusted for amounts", () => {
  const edited = [{ description: "Cart", quantity: 1, unit_amount: 500, tax_rate: 10, inc: true }];
  assert.equal(startLines({ kind: "full", total: 500, line_items: edited, xero_invoice_id: "x", label: "Invoice" }, null)[0].unit_amount, 500);
  const fromXero = [{ description: "Cart", quantity: 1, unit_amount: 454.55 }];
  assert.equal(startLines({ kind: "full", total: 500, line_items: fromXero, xero_invoice_id: "x", label: "Invoice" }, null)[0].description, "Invoice");
});

test("linesChangeSummary", () => {
  const a = cleanLines([{ description: "Cart", quantity: 1, unit_amount: 500 }, { description: "Van", quantity: 1, unit_amount: 100 }]);
  const b = cleanLines([{ description: "Cart", quantity: 2, unit_amount: 500 }, { description: "Cup stickers\n50mm", quantity: 200, unit_amount: 0.5 }]);
  assert.equal(linesChangeSummary(a, b), "added ‘Cup stickers’, removed ‘Van’, changed 1 line");
});
