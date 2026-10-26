import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, cleanSenders, matchKey, matchesSearch, productWords } from "./core";
import { parsePack, unitPrice } from "./units";

test("match keys", () => {
  assert.equal(matchKey("Monin Vanilla 1L", "MON-01"), "code:mon-01");
  assert.equal(matchKey("Monin  Vanilla, 1L"), "desc:monin vanilla 1l");
});

test("gmail query", () => {
  assert.equal(buildQuery({ match_from: ["accounts@x.com.au", "@y.com", "bad address"], match_subject: "Invoice", match_exclude: ["Statement"] }, "2026-01-05"),
    'from:(accounts@x.com.au OR @y.com) subject:("Invoice") -subject:("Statement") has:attachment after:2026/01/05');
  assert.equal(buildQuery({ match_from: [], match_subject: null, match_exclude: [] }, "2026-01-01"), null);
  assert.deepEqual(cleanSenders("Accounts@X.com.au, @y.com; nope y.com.au"), ["accounts@x.com.au", "@y.com", "y.com.au"]);
});

test("search and words", () => {
  assert.ok(matchesSearch("Monin Vanilla Syrup 700ml", "syr"));
  assert.ok(matchesSearch("Monin Vanilla Syrup 700ml · Five Senses", "vanilla syrup"));
  assert.ok(!matchesSearch("Caramel sauce", "syrup"));
  assert.deepEqual(productWords("Monin Vanilla Syrup 700ml x 6"), ["monin", "vanilla", "syrup"]);
});

test("unit prices", () => {
  assert.deepEqual(parsePack("CTN (6 x 2L)"), { unit: "L", amount: 12 });
  const u = unitPrice({ unitPrice: 30.75, unit: "CTN", packSize: "CTN (6 x 2L)", description: "Milk" });
  assert.equal(u?.baseUnit, "L"); assert.equal(u?.pricePerBase, 2.5625);
  assert.equal(unitPrice({ unitPrice: 12, unit: "each", packSize: null, description: "Cups" })?.baseUnit, "ea");
});

test("pack size from the product name", () => {
  assert.deepEqual(unitPrice({ unitPrice: 14.5, unit: null, packSize: null, description: "Monin Vanilla Syrup 700ml" }), { baseUnit: "L", baseQty: 0.7, pricePerBase: 20.7143 });
  assert.equal(unitPrice({ unitPrice: 38.4, unit: null, packSize: null, description: "Oat Milk Barista 12 x 1L" })?.pricePerBase, 3.2);
});
