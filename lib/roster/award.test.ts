import { test } from "node:test";
import assert from "node:assert/strict";
import { awardHours, estimateCost, readRules, roundTime, weekOf, DEFAULT_RULES } from "./award";

const none = new Set<string>();

test("weekday daytime shift is ordinary, break comes off", () => {
  const h = awardHours([{ start: "2026-11-02T07:00", finish: "2026-11-02T15:30", breakMinutes: 30 }], "casual", none).get("2026-11-02")!;
  assert.equal(h.ordinary, 8);
  assert.equal(h.evening, 0);
  assert.equal(h.late_night, 0);
});

test("early start before 7am gets late-night loading on a weekday", () => {
  const h = awardHours([{ start: "2026-11-03T06:00", finish: "2026-11-03T10:00", breakMinutes: 0 }], "part_time", none).get("2026-11-03")!;
  assert.equal(h.ordinary, 4);
  assert.equal(h.late_night, 1);
});

test("evening loading after 7pm, Saturday and Sunday categories", () => {
  const m = awardHours([
    { start: "2026-11-06T17:00", finish: "2026-11-06T21:00", breakMinutes: 0 }, // Fri
    { start: "2026-11-07T08:00", finish: "2026-11-07T12:00", breakMinutes: 0 }, // Sat
    { start: "2026-11-08T08:00", finish: "2026-11-08T11:00", breakMinutes: 0 }, // Sun
  ], "casual", none);
  assert.deepEqual([m.get("2026-11-06")!.ordinary, m.get("2026-11-06")!.evening], [4, 2]);
  assert.equal(m.get("2026-11-07")!.saturday, 4);
  assert.equal(m.get("2026-11-07")!.evening, 0);
  assert.equal(m.get("2026-11-08")!.sunday, 3);
});

test("public holiday beats the weekday and gets no evening loading", () => {
  const h = awardHours([{ start: "2026-12-28T15:00", finish: "2026-12-28T20:00", breakMinutes: 0 }], "casual", new Set(["2026-12-28"])).get("2026-12-28")!;
  assert.equal(h.public_holiday, 5);
  assert.equal(h.evening, 0);
});

test("shift past midnight splits across days", () => {
  const m = awardHours([{ start: "2026-11-06T22:00", finish: "2026-11-07T02:00", breakMinutes: 0 }], "casual", none); // Fri → Sat
  assert.equal(m.get("2026-11-06")!.ordinary, 2);
  assert.equal(m.get("2026-11-06")!.evening, 2);
  assert.equal(m.get("2026-11-07")!.saturday, 2);
});

test("casual minimum engagement of 2 hours", () => {
  const h = awardHours([{ start: "2026-11-02T09:00", finish: "2026-11-02T10:00", breakMinutes: 0 }], "casual", none).get("2026-11-02")!;
  assert.equal(h.ordinary, 2);
});

test("weekly overtime after 38 hours: first 2 hours then the higher rate; Sunday never converts", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d) => ({ start: `${d}T07:00`, finish: `${d}T15:00`, breakMinutes: 0 })); // 40 h
  days.push({ start: "2026-11-07T07:00", finish: "2026-11-07T10:00", breakMinutes: 0 }); // Sat 3h → all overtime
  days.push({ start: "2026-11-08T07:00", finish: "2026-11-08T10:00", breakMinutes: 0 }); // Sun stays Sunday
  const m = awardHours(days, "full_time", none);
  assert.equal(m.get("2026-11-06")!.ordinary, 6);
  assert.equal(m.get("2026-11-06")!.overtime_150, 2);
  assert.equal(m.get("2026-11-07")!.overtime_200, 3);
  assert.equal(m.get("2026-11-07")!.saturday, 0);
  assert.equal(m.get("2026-11-08")!.sunday, 3);
});

test("week starts Monday; rounding; cost estimate", () => {
  assert.equal(weekOf("2026-11-08"), "2026-11-02");
  assert.equal(weekOf("2026-11-02"), "2026-11-02");
  assert.equal(roundTime("2026-11-02T06:53", 15), "2026-11-02T07:00");
  assert.equal(roundTime("2026-11-02T07:07", 15), "2026-11-02T07:00");
  const m = awardHours([{ start: "2026-11-07T08:00", finish: "2026-11-07T12:00", breakMinutes: 0 }], "casual", none);
  assert.equal(estimateCost(m, "casual", 30), 4 * 30 * 1.5);
});

test("rules read with defaults and keep valid overrides", () => {
  const r = readRules({ casual: { saturday: 1.6 }, weekly_overtime: null, evening_from: "18:00" });
  assert.equal(r.casual.saturday, 1.6);
  assert.equal(r.casual.sunday, DEFAULT_RULES.casual.sunday);
  assert.equal(r.weekly_overtime, null);
  assert.equal(r.evening_from, "18:00");
});
