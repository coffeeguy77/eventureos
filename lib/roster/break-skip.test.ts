import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSkips, mealFor, skipsBreak } from "./breaks";

const CHEF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("skipsBreak: a day, a person, or a person on a day", () => {
  const rules = cleanSkips([{ day: 6, member: null }, { day: 1, member: CHEF }]);
  assert.equal(skipsBreak(rules, OTHER, "2026-11-07"), true, "anyone on Saturday");
  assert.equal(skipsBreak(rules, CHEF, "2026-11-02"), true, "chef on Monday");
  assert.equal(skipsBreak(rules, OTHER, "2026-11-02"), false, "others on Monday still get it");
  assert.equal(skipsBreak(rules, CHEF, "2026-11-03"), false, "chef on Tuesday still gets it");
  assert.equal(skipsBreak(cleanSkips([{ day: null, member: CHEF }]), CHEF, "2026-11-04"), true, "a person every day");
});

test("cleanSkips drops junk, duplicates and everyone-every-day", () => {
  assert.deepEqual(cleanSkips([{ day: 6 }, { day: 6, member: null }, { day: null, member: null }, { day: 9 }, { member: "nope" }]), [{ day: 6, member: null }]);
});

test("mealFor zeroes the minutes when skipped", () => {
  const meal = { after_hours: 5, minutes: 30, skip: [{ day: 6, member: null }] };
  assert.deepEqual(mealFor(meal, OTHER, "2026-11-07"), { after_hours: 5, minutes: 0, skipped: true });
  assert.deepEqual(mealFor(meal, OTHER, "2026-11-06"), { after_hours: 5, minutes: 30, skipped: false });
});
