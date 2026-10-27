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
