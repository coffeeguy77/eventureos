import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestCode, readTesting, testSubject } from "./core";

test("the test code, any case", () => {
  assert.ok(isTestCode("giftcardtest"));
  assert.ok(isTestCode(" GiftCard Test "));
  assert.ok(!isTestCode("GIFTCARD"));
  assert.ok(!isTestCode(null));
});
test("test mode is on unless switched off", () => {
  assert.equal(readTesting({}).enabled, true);
  assert.equal(readTesting({ testing: { enabled: false } }).enabled, false);
});
test("test emails say so", () => {
  assert.equal(testSubject("Booked", true), "TEST — Booked");
  assert.equal(testSubject("Booked", false), "Booked");
});
