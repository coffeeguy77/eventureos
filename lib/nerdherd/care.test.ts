import { test } from "node:test";
import assert from "node:assert/strict";
import { blockBalance, chargedMinutes, cmpVersion, fmtHours, packPrice, readCare, readPrefs, safeName } from "./care";

test("blocks are priced from the hourly rate with their discount", () => {
  assert.deepEqual(packPrice({ hours: 2, discountPct: 0 }, 120), { exGst: 240, incGst: 264, saved: 0 });
  assert.deepEqual(packPrice({ hours: 5, discountPct: 5 }, 120), { exGst: 570, incGst: 627, saved: 30 });
  assert.deepEqual(packPrice({ hours: 10, discountPct: 10 }, 120), { exGst: 1080, incGst: 1188, saved: 120 });
});

test("a request takes at least an hour, then rounds up to the quarter hour", () => {
  assert.equal(chargedMinutes(0), 0);
  assert.equal(chargedMinutes(12), 60);
  assert.equal(chargedMinutes(60), 60);
  assert.equal(chargedMinutes(61), 75);
  assert.equal(chargedMinutes(95), 105);
  assert.equal(chargedMinutes(20, 0.5), 30);
});

test("balance counts paid, active blocks only", () => {
  const b = blockBalance([{ hours: 5, paid: true, status: "active" }, { hours: 2, paid: false, status: "active" }, { hours: 10, paid: true, status: "void" }], [{ minutes_charged: 60 }, { minutes_charged: 75 }]);
  assert.deepEqual(b, { boughtMin: 300, usedMin: 135, leftMin: 165, pendingMin: 120 });
  assert.equal(fmtHours(165), "2 h 45 m");
  assert.equal(fmtHours(-30), "30 m over");
});

test("settings fall back to 2/5/10 hours and keep a chosen ads fee", () => {
  assert.deepEqual(readCare({}).packs.map((p) => p.hours), [2, 5, 10]);
  assert.equal(readCare({ nerdherd: { care: { ads_fee_ex_gst: 550 } } }).adsFeeExGst, 550);
  assert.equal(readCare({ nerdherd: { care: { ads_fee_ex_gst: null } } }).adsFeeExGst, null);
});

test("portal layout keeps every tile once, in the client's order", () => {
  const p = readPrefs({ order: ["sites", "sites", "nope", "block"], hidden: ["ads"] });
  assert.deepEqual(p.order.slice(0, 2), ["sites", "block"]);
  assert.equal(p.order.length, 7);
  assert.deepEqual(p.hidden, ["ads"]);
});

test("versions compare numerically; file names are made safe", () => {
  assert.equal(cmpVersion("6.10.1", "6.9"), 1);
  assert.equal(cmpVersion("8.2", "8.2.0"), 0);
  assert.equal(safeName("../../My Logo (final).PNG"), "....My-Logo-final.PNG");
  assert.doesNotMatch(safeName("a/b\\c.pdf"), /[\/\\]/);
});
