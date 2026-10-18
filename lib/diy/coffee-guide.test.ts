import { test } from "node:test";
import assert from "node:assert/strict";
import { diyGuide, hasDiyHire } from "./coffee-guide";

test("100 guests, one 6oz each", () => {
  const r = diyGuide({ guests: 100, perGuest: 1, size: "6oz" });
  assert.equal(r.cups, 100);
  assert.equal(r.coffeeKg, 1);          // up to 100 × 6oz per kg
  assert.equal(r.coffeeBags, 1);
  assert.equal(r.milkLitres, 14);       // 100 / 15 × 2 = 13.3 L
  assert.deepEqual(r.alternatives.map((a) => a.litres), [2, 2, 1, 1]);
  assert.equal(r.regularLitres, 8);
});

test("12oz uses a double shot each; scaling and rounding up", () => {
  const r = diyGuide({ guests: 50, perGuest: 1, size: "12oz" });
  assert.equal(r.coffeeKg, 1);          // 50 × 12oz per kg
  assert.equal(r.milkLitres, 14);       // 50 / 7.5 × 2 = 13.3 L
  const s = diyGuide({ guests: 30, perGuest: 1.5, size: "6oz" });
  assert.equal(s.cups, 45);
  assert.equal(s.coffeeBags, 1);
  assert.deepEqual(s.alternatives.map((a) => a.litres), [1, 1, 1, 1]);
  assert.equal(diyGuide({ guests: 0, perGuest: 1, size: "6oz" }).milkLitres, 0);
});

test("DIY hire detection", () => {
  assert.equal(hasDiyHire(["Equipment Only Hire (DIY)"]), true);
  assert.equal(hasDiyHire(["Coffee Cart Hire", "Barista Hire Per Hour"]), false);
});
