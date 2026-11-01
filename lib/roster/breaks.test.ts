import { test } from "node:test";
import assert from "node:assert/strict";
import { breakFlag, effectiveBreaks, shiftBreak, type BreakEntry } from "./breaks";

const R = { min: 30, after_hours: 5, max: 60, smart: false };
const e = (id: string, date: string, taken: number | null, stored: number): BreakEntry => ({ id, work_date: date, spanMinutes: 8.5 * 60, taken, stored, tracked: true });

test("a shift break: 15 taken counts as 30, 40 counts as 40, none counts as 30, short shifts none", () => {
  assert.equal(shiftBreak(510, 15, R), 30);
  assert.equal(shiftBreak(510, 40, R), 40);
  assert.equal(shiftBreak(510, null, R), 30);
  assert.equal(shiftBreak(300, null, R), 30); // exactly 5 h qualifies
  assert.equal(shiftBreak(240, null, R), 0);
  assert.equal(shiftBreak(510, null, R, 45), 45); // rostered 45
});

test("flags for managers", () => {
  assert.equal(breakFlag(510, null, R), "none");
  assert.equal(breakFlag(510, 20, R), "short");
  assert.equal(breakFlag(510, 30, R), null);
  assert.equal(breakFlag(510, 45, R), "long");
  assert.equal(breakFlag(510, 75, R), "over");
  assert.equal(breakFlag(200, null, R), null);
});

test("without smart breaks, what was saved is paid", () => {
  const m = effectiveBreaks([e("a", "2026-11-02", 20, 30), e("b", "2026-11-03", 40, 40)], R);
  assert.equal(m.get("a")!.minutes, 30);
  assert.equal(m.get("b")!.minutes, 40);
});

test("smart breaks: 3 × 20 + 2 × 40 in a week = 150, the minimum (not 170)", () => {
  const list = [e("a", "2026-11-02", 20, 30), e("b", "2026-11-03", 20, 30), e("c", "2026-11-04", 20, 30), e("d", "2026-11-05", 40, 40), e("f", "2026-11-06", 40, 40)];
  const m = effectiveBreaks(list, { ...R, smart: true });
  assert.equal([...m.values()].reduce((t, x) => t + x.minutes, 0), 150);
  assert.equal(m.get("d")!.minutes, 40);
});

test("smart breaks: long breaks beyond the minimum still count; weeks are separate; office-set breaks untouched", () => {
  const list = [e("a", "2026-11-02", 20, 30), e("b", "2026-11-03", 50, 50), e("c", "2026-11-09", 20, 30), { ...e("d", "2026-11-10", 10, 25), tracked: false }];
  const m = effectiveBreaks(list, { ...R, smart: true });
  assert.equal(m.get("a")!.minutes + m.get("b")!.minutes, 70);
  assert.equal(m.get("c")!.minutes, 30);
  assert.equal(m.get("d")!.minutes, 25);
});
