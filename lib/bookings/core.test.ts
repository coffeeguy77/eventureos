import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTime, agencyLineDescription, bookedSeats, giftCode, icsEvent, readSettings, repeatDates, seatCount, sessionWhen, slugify, splitGst, cleanEmail, normCode, shareLink } from "./core";

test("agency invoice line matches the existing Xero layout", () => {
  const d = agencyLineDescription({ title: "Barista Training\nLooking for work course", student: "Jane Citizen", dateKey: "2026-10-10",
    po: "E0668613", site: "Belconnen - WAES", contact: "Jason Bell", contactLabel: "Sureway Contact", poLabel: "EF Purchase Order :" });
  assert.equal(d, "Barista Training\nLooking for work course\nJANE CITIZEN 10/10/2026\n\nEF Purchase Order : E0668613\nPurchasing Site Belconnen - WAES\nSureway Contact Jason Bell");
  const bare = agencyLineDescription({ title: "Course", student: "a b", dateKey: "2026-01-05", po: null, site: null, contact: null, contactLabel: "Contact" });
  assert.equal(bare, "Course\nA B 05/01/2026");
});

test("GST split", () => {
  assert.deepEqual(splitGst(300), { subtotal: 272.73, tax: 27.27, total: 300 });
  assert.deepEqual(splitGst(150), { subtotal: 136.36, tax: 13.64, total: 150 });
});

test("seats", () => {
  assert.deepEqual(seatCount(6, 4, 2), { capacity: 6, taken: 6, left: 0, full: true });
  assert.deepEqual(seatCount(6, 1, 0), { capacity: 6, taken: 1, left: 5, full: false });
  const now = Date.parse("2026-10-05T00:00:00Z");
  assert.equal(bookedSeats([
    { seats: 2, status: "confirmed", hold_expires_at: null },
    { seats: 1, status: "held", hold_expires_at: "2026-10-05T00:10:00Z" },
    { seats: 3, status: "held", hold_expires_at: "2026-10-04T23:59:00Z" },
    { seats: 1, status: "waitlist", hold_expires_at: null },
    { seats: 1, status: "attended", hold_expires_at: null },
  ], now), 4);
});

test("gift codes are readable", () => {
  const code = giftCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.match(code, /^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.doesNotMatch(code.slice(5), /[01OIL]/);
  assert.equal(normCode(" gift-7kq9 m3xa "), "GIFT-7KQ9M3XA");
});

test("settings defaults and limits", () => {
  const s = readSettings({ booking: { hold_minutes: 1, gift_expiry_months: 12, gift_amounts: [50, "100", 2, 50], social: { facebook: "http://x", instagram: "https://instagram.com/x" } } });
  assert.equal(s.hold_minutes, 30);
  assert.equal(s.gift_expiry_months, 36, "Australian gift card minimum");
  assert.deepEqual(s.gift_amounts, [50, 100]);
  assert.equal(s.social.facebook, undefined);
  assert.equal(s.social.instagram, "https://instagram.com/x");
  assert.equal(readSettings(null).enabled, true);
});

test("weekly dates", () => {
  assert.deepEqual(repeatDates("2026-10-05", "2026-10-31", 6), ["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  assert.deepEqual(repeatDates("2026-10-05", "2026-10-31", 6, 2, ["2026-10-24"]), ["2026-10-10"]);
  assert.deepEqual(repeatDates("2026-10-31", "2026-10-05", 6), []);
});

test("session times in the business's timezone", () => {
  const w = sessionWhen("2026-10-09T23:00:00Z", "2026-10-10T03:00:00Z", "Australia/Sydney");
  assert.equal(w.dateKey, "2026-10-10");
  assert.equal(w.time, "10:00am – 2:00pm");
  assert.match(w.day, /Saturday/);
});

test("calendar file", () => {
  const ics = icsEvent({ uid: "bk-1@x", start: "2026-10-09T23:00:00Z", end: "2026-10-10T03:00:00Z", title: "Barista course; Looking, for work", description: "Line 1\nLine 2 ".repeat(20), now: new Date("2026-10-05T00:00:00Z") });
  assert.match(ics, /DTSTART:20261009T230000Z\r\n/);
  assert.match(ics, /SUMMARY:Barista course\\; Looking\\, for work/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test("misc", () => {
  assert.equal(slugify("Home Barista Course (2hr)"), "home-barista-course-2hr");
  assert.equal(cleanEmail(" Jo@Example.COM "), "jo@example.com");
  assert.equal(cleanEmail("nope"), null);
  assert.match(shareLink("https://x.com/book/a", "facebook"), /utm_source=facebook&utm_medium=social/);
});

test("spreadsheet dates and times", () => {
  assert.equal(parseDate("10/10/2026"), "2026-10-10");
  assert.equal(parseDate("3/4/26"), "2026-04-03");
  assert.equal(parseDate("2026-10-10 10:00"), "2026-10-10");
  assert.equal(parseDate("Saturday 10 October 2026"), "2026-10-10");
  assert.equal(parseDate("nope"), null);
  assert.equal(parseTime("2:30 pm"), "14:30");
  assert.equal(parseTime("10am"), "10:00");
  assert.equal(parseTime("12:15am"), "00:15");
  assert.equal(parseTime("14:30"), "14:30");
  assert.equal(parseTime("2026-10-10 10:00:00"), "10:00");
  assert.equal(parseTime("Sat 10 Oct 2026, 2:30pm"), "14:30");
  assert.equal(parseTime("10/10/2026 9am"), "09:00");
  assert.equal(parseTime("2026-10-10"), null);
});
