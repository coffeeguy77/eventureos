import { test } from "node:test";
import assert from "node:assert/strict";
import { awardHours, estimateCost, flatHours, readRules, roundTime, weekOf, workedHours, DEFAULT_RULES, FAST_FOOD_RULES } from "./award";

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

test("weekly overtime after 38 hours: first 2 hours of each day at the first rate; Sunday never converts", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d) => ({ start: `${d}T07:00`, finish: `${d}T15:00`, breakMinutes: 0 })); // 40 h
  days.push({ start: "2026-11-07T07:00", finish: "2026-11-07T10:00", breakMinutes: 0 }); // Sat 3h → all overtime
  days.push({ start: "2026-11-08T07:00", finish: "2026-11-08T10:00", breakMinutes: 0 }); // Sun stays Sunday
  const m = awardHours(days, "full_time", none);
  assert.equal(m.get("2026-11-06")!.ordinary, 6);
  assert.equal(m.get("2026-11-06")!.overtime_150, 2);
  assert.equal(m.get("2026-11-07")!.overtime_150, 2);
  assert.equal(m.get("2026-11-07")!.overtime_200, 1);
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

test("Sunday hours count towards the 38 but stay Sunday", () => {
  const m = awardHours([
    { start: "2026-11-02T07:00", finish: "2026-11-02T15:00", breakMinutes: 0 }, // Mon 8
    { start: "2026-11-03T07:00", finish: "2026-11-03T15:00", breakMinutes: 0 },
    { start: "2026-11-04T07:00", finish: "2026-11-04T15:00", breakMinutes: 0 },
    { start: "2026-11-05T07:00", finish: "2026-11-05T15:00", breakMinutes: 0 }, // 32
    { start: "2026-11-08T07:00", finish: "2026-11-08T12:00", breakMinutes: 0 }, // Sun 5 → 37
  ], "full_time", new Set());
  // Sunday comes after Thursday chronologically; add a Friday that pushes past 38 before Sunday instead
  assert.equal(m.get("2026-11-08")!.sunday, 5);
  const m2 = awardHours([
    { start: "2026-11-01T07:00", finish: "2026-11-01T15:00", breakMinutes: 0 }, // Sun 1 Nov (previous week)
    { start: "2026-11-08T07:00", finish: "2026-11-08T15:00", breakMinutes: 0 }, // Sun 8 Nov counts in week of 2 Nov
    ...["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d) => ({ start: `${d}T07:00`, finish: `${d}T15:00`, breakMinutes: 0 })),
  ], "full_time", new Set());
  assert.equal(m2.get("2026-11-05")!.ordinary, 8); // 32 by Thursday; Sunday 8 Nov is after Thursday
});

test("public holiday hours count towards the week, so a later weekday goes into overtime", () => {
  const days = ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"].map((d) => ({ start: `${d}T07:00`, finish: `${d}T15:00`, breakMinutes: 0 }));
  const m = awardHours(days, "full_time", new Set(["2026-12-28", "2027-01-01"]));
  assert.equal(m.get("2026-12-28")!.public_holiday, 8);
  assert.equal(m.get("2026-12-31")!.ordinary, 8); // 32 so far
  assert.equal(m.get("2027-01-01")!.public_holiday, 8); // holiday stays holiday even past 38
  const n = awardHours([...days.slice(0, 4), { start: "2027-01-02T07:00", finish: "2027-01-02T15:00", breakMinutes: 0 }], "full_time", new Set(["2026-12-28"]));
  assert.equal(n.get("2027-01-02")!.saturday, 6);
  assert.equal(n.get("2027-01-02")!.overtime_150, 2);
});

test("Fast Food: 10pm–midnight and midnight–6am are paid at their own rate (replace), 3-hour casual minimum, daily overtime after 11", () => {
  const m = awardHours([{ start: "2026-11-06T05:00", finish: "2026-11-06T10:00", breakMinutes: 0 }], "casual", new Set(), FAST_FOOD_RULES);
  const h = m.get("2026-11-06")!;
  assert.equal(h.late_night, 1);
  assert.equal(h.ordinary, 4);
  assert.equal(workedHours(h, FAST_FOOD_RULES), 5);
  assert.equal(awardHours([{ start: "2026-11-03T09:00", finish: "2026-11-03T11:00", breakMinutes: 0 }], "casual", new Set(), FAST_FOOD_RULES).get("2026-11-03")!.ordinary, 3);
  const long = awardHours([{ start: "2026-11-03T06:00", finish: "2026-11-03T19:00", breakMinutes: 30 }], "part_time", new Set(), FAST_FOOD_RULES).get("2026-11-03")!;
  assert.equal(long.ordinary, 11);
  assert.equal(long.overtime_150, 1.5);
  assert.equal(estimateCost(m, "casual", 30, FAST_FOOD_RULES), 30 * (4 * 1.25 + 1 * 1.4));
});

test("flat rate: every hour ordinary", () => {
  const f = flatHours([{ start: "2026-11-07T06:30", finish: "2026-11-07T14:00", breakMinutes: 0 }]);
  assert.equal(f.get("2026-11-07")!.ordinary, 7.5);
  assert.equal(f.get("2026-11-07")!.saturday, 0);
});
