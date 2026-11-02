import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTasks, priceFor, progress, quoteLight, splitInc, sumHours } from "./quotes";

test("price: quarter hours up, GST on top", () => {
  assert.deepEqual(priceFor(2, 120), { hours: 2, exGst: 240, gst: 24, incGst: 264 });
  assert.equal(priceFor(1.1, 100).hours, 1.25);
  assert.equal(priceFor(1.25, 100).incGst, 137.5);
  assert.equal(priceFor(0, 120).incGst, 0);
});
test("GST split", () => assert.deepEqual(splitInc(264), { subtotal: 240, tax: 24, total: 264 }));
test("lights: unpaid is red, paid is green", () => {
  assert.equal(quoteLight("accepted").light, "red");
  assert.equal(quoteLight("sent").light, "red");
  assert.equal(quoteLight("paid").light, "green");
});
test("tasks clean and sum", () => {
  const t = cleanTasks([{ label: " Fix form ", hours: "1.5" }, { label: "", hours: 3 }, { label: "Test", hours: -1 }]);
  assert.deepEqual(t, [{ label: "Fix form", hours: 1.5 }, { label: "Test", hours: 0 }]);
  assert.equal(sumHours(t), 1.5);
  assert.deepEqual(progress([{ label: "a", hours: 1, done_at: "x" }, { label: "b", hours: 1, done_at: null }]), { done: 1, total: 2, all: false });
});
