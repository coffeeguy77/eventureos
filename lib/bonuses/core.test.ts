import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusFigures, readBonusRates } from "./core";

test("10% of a $5,500 build ($5,000 ex GST) once paid; half when half paid", () => {
  assert.deepEqual(bonusFigures({ subtotal: 5000, total: 5500, amount_paid: 5500, status: "paid" }, 10), { exGst: 5000, full: 500, earned: 500, paidInFull: true, share: 1 });
  assert.equal(bonusFigures({ subtotal: 5000, total: 5500, amount_paid: 2750, status: "part_paid" }, 10).earned, 250);
  assert.equal(bonusFigures({ subtotal: 400, total: 440, amount_paid: 0, status: "awaiting_payment" }, 5).earned, 0);
  assert.equal(bonusFigures({ subtotal: 400, total: 440, amount_paid: 0, status: "awaiting_payment" }, 5).full, 20);
});

test("rates per person", () => {
  const r = readBonusRates({ bonuses: { people: { "103f9a25-2cd5-4327-b9d0-d9272ce802bd": { build: "10", maintenance: 5 }, junk: { build: 3 } } } });
  assert.deepEqual(r, { "103f9a25-2cd5-4327-b9d0-d9272ce802bd": { build: 10, maintenance: 5 } });
});
