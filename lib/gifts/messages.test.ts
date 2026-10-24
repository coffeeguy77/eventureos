import { test } from "node:test";
import assert from "node:assert/strict";
import { GIFT_MESSAGES, OCCASIONS, fathersDay, mothersDay, occasionFor, occasionsFor } from "./messages";

test("ten messages per occasion for each kind of gift, all fit on the card, none repeated", () => {
  const all: string[] = [];
  for (const kind of ["coffee", "lessons"] as const) for (const o of OCCASIONS) {
    const list = GIFT_MESSAGES[kind][o.id];
    assert.equal(list.length, 10, `${kind}/${o.id}`);
    for (const m of list) { assert.ok(m.length <= 200, `${m.length}: ${m}`); all.push(m); }
  }
  assert.equal(new Set(all).size, all.length);
});

test("Australian Mother's and Father's Day", () => {
  assert.equal(mothersDay(2026), "2026-05-10");
  assert.equal(fathersDay(2026), "2026-09-06");
  assert.equal(mothersDay(2027), "2027-05-09");
  assert.equal(fathersDay(2027), "2027-09-05");
});

test("the occasion for the time of year", () => {
  assert.equal(occasionFor("2026-11-30"), "birthday");
  assert.equal(occasionFor("2026-12-01"), "christmas");
  assert.equal(occasionFor("2026-12-25"), "christmas");
  assert.equal(occasionFor("2026-12-26"), "birthday");
  assert.equal(occasionFor("2027-01-31"), "valentines");
  assert.equal(occasionFor("2027-01-30"), "birthday");
  assert.equal(occasionFor("2027-02-14"), "valentines");
  assert.equal(occasionFor("2027-02-15"), "birthday");
  assert.equal(occasionFor("2026-04-26"), "mothers");
  assert.equal(occasionFor("2026-04-25"), "birthday");
  assert.equal(occasionFor("2026-08-23"), "fathers");
  assert.equal(occasionFor("2026-09-07"), "birthday");
  assert.equal(occasionsFor("2026-12-03")[0].id, "christmas");
  assert.equal(occasionsFor("2026-12-03").length, OCCASIONS.length);
});
