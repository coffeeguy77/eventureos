import { test } from "node:test";
import assert from "node:assert/strict";
import { freeSlots, isFree, readApptSettings, zonedMs, icsFor } from "./core";

const TZ = "Australia/Sydney";
const s = readApptSettings({ appointments: { notice_hours: 24, buffer: 15, step: 30, horizon_days: 7, weekly: { "1": [["09:00", "12:00"]], "2": [["09:00", "12:00"]] }, blocked: [{ from: "2026-11-10", to: "2026-11-10", reason: "Away" }] } });

test("defaults read sensibly", () => {
  const d = readApptSettings({});
  assert.equal(d.notice_hours, 24);
  assert.deepEqual(d.durations, [30, 60]);
  assert.equal(d.weekly["0"].length, 0);
  assert.equal(d.weekly["1"][0][0], "09:00");
});

test("zonedMs converts Sydney local time to UTC (AEDT +11 in November)", () => {
  assert.equal(new Date(zonedMs("2026-11-09", "09:00", TZ)).toISOString(), "2026-11-08T22:00:00.000Z");
});

test("24 hours' notice, weekly hours, blocked days and busy times with a buffer", () => {
  const now = zonedMs("2026-11-08", "10:00", TZ); // Sunday 10am
  const busy = [{ start: zonedMs("2026-11-09", "10:00", TZ), end: zonedMs("2026-11-09", "10:30", TZ) }];
  const days = freeSlots(s, { today: "2026-11-08", tz: TZ, now, duration: 30, busy, days: 7 });
  const mon = days.find((d) => d.date === "2026-11-09")!;
  // Monday 9:00 and 9:30 are within 24 h of Sunday 10am → gone; 10:00 busy, 9:30–10:00 and 10:30 blocked by the 15 min buffer
  assert.deepEqual(mon.times, ["11:00", "11:30"]);
  assert.equal(days.find((d) => d.date === "2026-11-10")!.times.length, 0); // blocked Tuesday
  assert.equal(days.find((d) => d.date === "2026-11-11")!.times.length, 0); // Wednesday not in weekly hours
});

test("isFree double-checks", () => {
  const now = zonedMs("2026-11-08", "10:00", TZ);
  assert.match(isFree(s, { tz: TZ, now, start: now + 3_600_000, end: now + 5_400_000, busy: [] })!, /24 hours/);
  assert.equal(isFree(s, { tz: TZ, now, start: now + 30 * 3_600_000, end: now + 31 * 3_600_000, busy: [] }), null);
});

test("ics file", () => {
  const t = icsFor({ id: "x", title: "Meeting, with care", start: 0, end: 1_800_000, location: null, description: "Line1\nLine2", organiser: "Web Culture" });
  assert.match(t, /SUMMARY:Meeting\\, with care/);
  assert.match(t, /DTSTART:19700101T000000Z/);
});
