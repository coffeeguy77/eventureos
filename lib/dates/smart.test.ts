import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDate, showDMY } from "./smart";

const T = "2026-11-16";
test("no year: this year, or next year when the month is earlier", () => {
  assert.equal(resolveDate("30/11", T), "2026-11-30");
  assert.equal(resolveDate("30/1", T), "2027-01-30");
  assert.equal(resolveDate("5/12", T), "2026-12-05");
  assert.equal(resolveDate("10/11", T), "2026-11-10"); // same month stays this year
});
test("a typed year wins", () => {
  assert.equal(resolveDate("30/1/2026", T), "2026-01-30");
  assert.equal(resolveDate("30/1/27", T), "2027-01-30");
  assert.equal(resolveDate("2026-11-30", T), "2026-11-30");
});
test("words and other separators", () => {
  assert.equal(resolveDate("30 Nov", T), "2026-11-30");
  assert.equal(resolveDate("Monday 30th November", T), "2026-11-30");
  assert.equal(resolveDate("3 March", T), "2027-03-03");
  assert.equal(resolveDate("30-11", T), "2026-11-30");
  assert.equal(resolveDate("30.1", T), "2027-01-30");
});
test("not dates", () => {
  assert.equal(resolveDate("31/2", T), null);
  assert.equal(resolveDate("13/13", T), null);
  assert.equal(resolveDate("hello", T), null);
  assert.equal(resolveDate("", T), null);
});
test("shows d/m/yyyy", () => assert.equal(showDMY("2027-01-05"), "5/1/2027"));
