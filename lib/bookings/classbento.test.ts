import { test } from "node:test";
import assert from "node:assert/strict";
import { isClassBentoBooking, parseClassBentoEmail, to24 } from "./classbento";

// Made-up people; the layout follows ClassBento's real "New booking" email
const ONE = `Hi Shaun
You've got a new booking
Home Barista Class
Sat 24 Oct 2026, 2:30pm - 4:30pm
Bean Culture Coffee Roasters, Vicars Street, Mitchell ACT
Pat Example
pat.example@example.com • +61400000001
You'll be paid: $136, on 26 Oct 2026 [From ClassBento's website (marketplace)]
Order (item) number: 9TDUA`;

test("one guest: name, contact, time, payout, order", () => {
  const r = parseClassBentoEmail("🎉 New booking for Home Barista Class - Sat 24 Oct at 2:30pm, from Pat Example", ONE);
  assert.equal(r.problem, null);
  assert.deepEqual(r.booking, { order: "9TDUA", listing: "Home Barista Class", date: "2026-10-24", start: "14:30", end: "16:30", name: "Pat Example", bookedBy: null,
    email: "pat.example@example.com", phone: "+61400000001", guests: 1, payout: 136 });
});

test("a gift for 2 guests, with line breaks lost", () => {
  const body = "Home Barista Class Sat 24 Oct 2026, 2:30pm - 4:30pm Bean Culture Coffee Roasters, Vicars Street, Mitchell ACT Sam Receiver (gifted to this person, booked by Alex Buyer) (2 guests) alex@example.com (purchaser's email) • 0400 000 002 You’ll be paid: $272, on 18 Oct 2026 Order (item) number: AB12C";
  const r = parseClassBentoEmail("New booking for Home Barista Class - Sat 24 Oct at 2:30pm, from Alex Buyer", body);
  assert.equal(r.booking?.name, "Sam Receiver");
  assert.equal(r.booking?.bookedBy, "Alex Buyer");
  assert.equal(r.booking?.guests, 2);
  assert.equal(r.booking?.email, "alex@example.com");
  assert.equal(r.booking?.phone, "0400000002");
  assert.equal(r.booking?.payout, 272);
});

test("the 4-hour class at 10am, year from when it was sent when the body has none", () => {
  const r = parseClassBentoEmail("New booking for Barista Class for Beginners - Sat 1 Aug at 10am, from Jo Example", "Jo Example\njo@example.com\nOrder (item) number: ZZ9", "2026-07-28T03:00:00Z");
  assert.equal(r.booking?.date, "2026-08-01");
  assert.equal(r.booking?.start, "10:00");
  assert.equal(r.booking?.end, null);
  assert.equal(r.booking?.listing, "Barista Class for Beginners");
});

test("not a booking / no order number", () => {
  assert.equal(isClassBentoBooking("Your session tomorrow (10 Oct)"), false);
  assert.equal(isClassBentoBooking("New booking for Home Barista Class - Sat 10 Oct at 2:30pm, from A B"), true);
  assert.equal(parseClassBentoEmail("New booking for X - Sat 10 Oct at 2:30pm, from A B", "no number").problem, "no order number in the email");
  assert.equal(to24("12", undefined, "p"), "12:00");
  assert.equal(to24("12", "15", "a"), "00:15");
});
