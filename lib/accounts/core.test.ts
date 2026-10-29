import { test } from "node:test";
import assert from "node:assert/strict";
import { attribute, bucket, fill, readTemplates } from "./core";

test("templates", () => {
  const t = readTemplates({ collections: { templates: [{ key: "friendly", name: "Mine", subject: "S {invoice}", message: "M" }, { key: "bad key!", name: "x", subject: "y", message: "z" }] } });
  assert.equal(t.find((x) => x.key === "friendly")?.name, "Mine");
  assert.ok(t.some((x) => x.key === "final"));
  assert.equal(fill("Hi {first_name}, {invoice} {nope}", { first_name: "Sam", invoice: "INV-1" }), "Hi Sam, INV-1 {nope}");
});

test("ageing", () => {
  assert.equal(bucket("2026-10-30", "2026-10-27"), "current");
  assert.equal(bucket("2026-10-01", "2026-10-27"), "1-30");
  assert.equal(bucket("2026-06-01", "2026-10-27"), "90+");
});

test("recovered money goes to the latest email before each payment", () => {
  const e = [
    { id: "a", invoice_id: "i1", sent_at: "2026-10-01T00:00:00Z", template: "friendly", opened_at: null, clicked_at: null },
    { id: "b", invoice_id: "i1", sent_at: "2026-10-10T00:00:00Z", template: "overdue", opened_at: null, clicked_at: null },
  ];
  const r = attribute(e, [
    { invoice_id: "i1", amount: 100, paid_at: "2026-10-05T00:00:00Z" },
    { invoice_id: "i1", amount: 50, paid_at: "2026-10-12T00:00:00Z" },
    { invoice_id: "i1", amount: 9, paid_at: "2026-09-01T00:00:00Z" },
    { invoice_id: "i2", amount: 70, paid_at: "2026-10-12T00:00:00Z" },
  ]);
  assert.equal(r.get("a"), 100); assert.equal(r.get("b"), 50);
});

import { callNext, feeDue, readFees, feeRateFor, fillTerms, DEFAULT_TERMS } from "./core";

test("account-keeping fee: grace period, then each month or part month, less what's been charged", () => {
  assert.deepEqual(feeDue({ balance: 1000, due_date: "2026-08-01" }, "2026-08-25", 2, 30, 0), { months: 0, amount: 0, monthsOverdue: 0 });
  assert.deepEqual(feeDue({ balance: 1000, due_date: "2026-08-01" }, "2026-09-01", 2, 30, 0), { months: 1, amount: 20, monthsOverdue: 1 });
  assert.deepEqual(feeDue({ balance: 1000, due_date: "2026-08-01" }, "2026-10-29", 2, 30, 1), { months: 1, amount: 20, monthsOverdue: 2 });
  assert.equal(feeDue({ balance: 1000, due_date: "2026-08-01" }, "2026-10-29", 0, 30, 0).amount, 0);
});

test("fee settings: a customer's own rate (0 = never) and sane limits", () => {
  const f = readFees({ collections: { fees: { enabled: true, percent: "2.5", grace_days: 14, overrides: { "11111111-1111-1111-1111-111111111111": 0, bad: 3 } } } });
  assert.equal(f.percent, 2.5);
  assert.equal(feeRateFor(f, "11111111-1111-1111-1111-111111111111"), 0);
  assert.equal(feeRateFor(f, "22222222-2222-2222-2222-222222222222"), 2.5);
  assert.equal(Object.keys(f.overrides).length, 1);
  assert.equal(readFees({ collections: { fees: { percent: 99 } } }).percent, 2);
});

test("terms are filled in with the fee and payment terms", () => {
  const t = fillTerms(DEFAULT_TERMS, { business: "Bean Culture", payment_terms: 14, fees: readFees({ collections: { fees: { percent: 2, grace_days: 30 } } }), email: "a@b.c", phone: null });
  assert.match(t, /account-keeping fee of 2% /);
  assert.match(t, /due within 14 days/);
  assert.doesNotMatch(t, /\{/);
});

test("call next: contacted today and flagged drop off; broken promises first", () => {
  const base = { owing: 100, overdue: 100, oldestDays: 10, lastTouch: null, brokenPromise: null, stepDue: false, flagged: false };
  const rows = [
    { ...base, id: "today", lastTouch: "2026-10-29T01:00:00Z" },
    { ...base, id: "quiet", lastTouch: "2026-10-01T01:00:00Z" },
    { ...base, id: "never" },
    { ...base, id: "broke", lastTouch: "2026-10-28T01:00:00Z", brokenPromise: "2026-10-27" },
    { ...base, id: "flag", flagged: true },
    { ...base, id: "paid", overdue: 0 },
  ];
  assert.deepEqual(callNext(rows, "2026-10-29").map((r) => r.id), ["broke", "never", "quiet"]);
});
