import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, periodPrices, planSchedule } from "./plan";

test("equal payments, the last evens out the cents", () => {
  const s = planSchedule(1000, "fortnightly", "2026-11-02", { count: 3 });
  assert.deepEqual(s.map((x) => x.amount), [333.33, 333.33, 333.34]);
  assert.deepEqual(s.map((x) => x.date), ["2026-11-02", "2026-11-16", "2026-11-30"]);
});

test("a set amount each week, the last is what's left", () => {
  const s = planSchedule(1000, "weekly", "2026-11-02", { amount: 150 });
  assert.equal(s.length, 7);
  assert.equal(s[6].amount, 100);
  assert.equal(s.reduce((a, x) => a + x.amount, 0), 1000);
});

test("payments go on the oldest invoice first", () => {
  assert.deepEqual(allocate(250, [{ id: "a", balance: 100 }, { id: "b", balance: 300 }]), [{ id: "a", amount: 100 }, { id: "b", amount: 150 }]);
});

test("quarterly costs 20% more than yearly", () => {
  const p = periodPrices(440, 20);
  assert.equal(p.quarterly, 132);
  assert.equal(p.quarterlyPerYear, 528);
  assert.equal(p.yearlySaves, 88);
});
