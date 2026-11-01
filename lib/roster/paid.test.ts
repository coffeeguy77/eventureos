import { test } from "node:test";
import assert from "node:assert/strict";
import { paidTimes, timesheetLines } from "./paid";
import { periodFor, periodDates } from "./period";
import { fromLocal, shiftSpan, toLocal } from "./time";
import { awardHours } from "./award";

const TZ = "Australia/Sydney";

test("local time round trip, incl. daylight saving (AEDT, +11)", () => {
  assert.equal(fromLocal("2026-11-02T07:00", TZ), "2026-11-01T20:00:00.000Z");
  assert.equal(toLocal("2026-11-01T20:00:00.000Z", TZ), "2026-11-02T07:00");
  assert.equal(fromLocal("2026-07-01T07:00", TZ), "2026-06-30T21:00:00.000Z"); // AEST, +10
});

test("shift past midnight", () => {
  assert.deepEqual(shiftSpan("2026-11-06", "22:00:00", "02:00:00"), { start: "2026-11-06T22:00", finish: "2026-11-07T02:00" });
});

test("paid times snap to the roster within grace, else round", () => {
  const shift = { shift_date: "2026-11-02", start_time: "07:00:00", finish_time: "15:00:00" };
  const p = paidTimes({ rounding: 15, grace: 10 }, TZ, fromLocal("2026-11-02T06:52", TZ), fromLocal("2026-11-02T15:06", TZ), shift);
  assert.equal(toLocal(p.start, TZ), "2026-11-02T07:00");
  assert.equal(toLocal(p.finish, TZ), "2026-11-02T15:00");
  const late = paidTimes({ rounding: 15, grace: 10 }, TZ, fromLocal("2026-11-02T07:24", TZ), fromLocal("2026-11-02T15:40", TZ), shift);
  assert.equal(toLocal(late.start, TZ), "2026-11-02T07:30");
  assert.equal(toLocal(late.finish, TZ), "2026-11-02T15:45");
});

test("timesheet lines per earnings rate per day; unmapped base hours go to Ordinary, unmapped loadings are left out", () => {
  const byDay = awardHours([
    { start: "2026-11-06T15:00", finish: "2026-11-06T21:00", breakMinutes: 0 },
    { start: "2026-11-07T08:00", finish: "2026-11-07T12:00", breakMinutes: 0 },
  ], "casual", new Set());
  const dates = periodDates("2026-11-02", "2026-11-08");
  const lines = timesheetLines(byDay, dates, { ordinary: "ORD", saturday: "SAT" });
  assert.deepEqual(lines, [
    { earningsRateId: "ORD", units: [0, 0, 0, 0, 6, 0, 0] },
    { earningsRateId: "SAT", units: [0, 0, 0, 0, 0, 4, 0] },
  ]);
  const withEve = timesheetLines(byDay, dates, { ordinary: "ORD", saturday: "SAT", evening: "EVE" });
  assert.deepEqual(withEve.find((l) => l.earningsRateId === "EVE")!.units, [0, 0, 0, 0, 2, 0, 0]);
});

test("pay periods from a Xero calendar", () => {
  const fn = { id: "c", name: "Fortnightly", type: "FORTNIGHTLY", start: "2026-10-19" };
  assert.deepEqual(periodFor(fn, "2026-11-05"), { start: "2026-11-02", end: "2026-11-15" });
  assert.deepEqual(periodFor(fn, "2026-10-30"), { start: "2026-10-19", end: "2026-11-01" });
  assert.deepEqual(periodFor({ ...fn, type: "WEEKLY" }, "2026-11-08"), { start: "2026-11-02", end: "2026-11-08" });
  assert.deepEqual(periodFor({ ...fn, type: "MONTHLY", start: "2026-01-15" }, "2026-11-05"), { start: "2026-10-15", end: "2026-11-14" });
  assert.equal(periodDates("2026-11-02", "2026-11-15").length, 14);
});
