import { test } from "node:test";
import assert from "node:assert/strict";
import { baristaHours, cleanSlug, dueDate, followUpDue, fromStandard, lastMonth, orderProblem, priceOrder, readRates, runsFor, segments, deliveryDay, pickupDay } from "./core";

const hotel = readRates({ cart: 400, delivery: 250 });
const venue = readRates({ cart: 400, delivery: 250, barista: 75, coffee: 2, minHours: 3, setupHours: 0.5 });

test("cart hire: a delivery per run, one run while there are no more than 2 clear days between", () => {
  // 17, 18, 19 Aug; 14 Sep; 22 Sep → 5 cart days, 3 deliveries (matches the hotel's September invoice)
  const p = priceOrder({ days: ["2026-08-17", "2026-08-18", "2026-08-19", "2026-09-14", "2026-09-22"].map((date) => ({ date, start: null, finish: null })), carts: 1, van: 0, baristas: 0, coffees: 0 }, hotel);
  assert.equal(p.lines.find((l) => l.key === "cart")!.qty, 5);
  assert.equal(p.deliveries, 3);
  assert.equal(p.subtotal, 5 * 400 + 3 * 250);
  assert.equal(p.total, 3025);
});

test("segments: Mon & Thu share a run (2 clear days), Mon & Fri don't", () => {
  assert.deepEqual(segments(["2026-11-09", "2026-11-12"]), [["2026-11-09", "2026-11-12"]]);
  assert.deepEqual(segments(["2026-11-09", "2026-11-13"]), [["2026-11-09"], ["2026-11-13"]]);
});

test("extending a cart already on site: no second delivery", () => {
  const day = (date: string) => ({ date, start: null, finish: null });
  const ext = priceOrder({ days: [day("2026-11-11")], carts: 1, van: 0, baristas: 0, coffees: 0 }, hotel, ["2026-11-10"]);
  assert.equal(ext.deliveries, 0);
  assert.deepEqual(ext.covered, [{ from: "2026-11-11", near: "2026-11-10" }]);
  const far = priceOrder({ days: [day("2026-11-14")], carts: 1, van: 0, baristas: 0, coffees: 0 }, hotel, ["2026-11-10"]);
  assert.equal(far.deliveries, 1);
});

test("standard order: 1 cart, 200 coffees, 2 baristas for 3 hours (+30 min setup each)", () => {
  const o = fromStandard({ name: "Standard", carts: 1, van: 0, baristas: 2, hours: 3, coffees: 200 }, "2026-11-20", "08:00");
  assert.equal(o.days[0].finish, "11:00");
  const p = priceOrder(o, venue);
  assert.equal(p.lines.find((l) => l.key === "barista")!.qty, 7);
  assert.equal(p.subtotal, 400 + 250 + 7 * 75 + 200 * 2);
});

test("barista minimum hours", () => {
  assert.equal(baristaHours({ date: "2026-11-20", start: "08:00", finish: "09:30" }, venue), 3);
  assert.equal(baristaHours({ date: "2026-11-20", start: "09:00", finish: "14:30" }, venue), 6);
});

test("order problems", () => {
  assert.match(orderProblem({ days: [], carts: 1, van: 0, baristas: 0, coffees: 0 }, "2026-11-06")!, /date/);
  assert.match(orderProblem({ days: [{ date: "2026-11-10", start: null, finish: null }], carts: 1, van: 0, baristas: 1, coffees: 0 }, "2026-11-06")!, /times/);
  assert.equal(orderProblem({ days: [{ date: "2026-11-10", start: null, finish: null }], carts: 1, van: 0, baristas: 0, coffees: 0 }, "2026-11-06"), null);
});

test("delivery runs across bookings, with delivery the day before and pickup the day after", () => {
  const runs = runsFor([{ days: ["2026-11-10"], carts: 1 }, { days: ["2026-11-10", "2026-11-11"], carts: 1 }, { days: ["2026-11-20"], carts: 1 }]);
  assert.deepEqual(runs, [{ starts: "2026-11-10", ends: "2026-11-11", carts: 2 }, { starts: "2026-11-20", ends: "2026-11-20", carts: 1 }]);
  assert.equal(deliveryDay(runs[0]), "2026-11-09");
  assert.equal(pickupDay(runs[0]), "2026-11-12");
});

test("follow-ups, due dates, month end, slugs", () => {
  assert.equal(followUpDue({ status: "quote", first_day: "2026-11-12", follow_up_at: null }, "2026-11-06"), true);
  assert.equal(followUpDue({ status: "quote", first_day: "2026-11-20", follow_up_at: null }, "2026-11-06"), false);
  assert.equal(followUpDue({ status: "booked", first_day: "2026-11-12", follow_up_at: null }, "2026-11-06"), false);
  assert.equal(dueDate("after_invoice", 7, "2026-12-01", null), "2026-12-08");
  assert.equal(dueDate("before_event", 7, "2026-11-06", "2026-11-30"), "2026-11-23");
  assert.equal(dueDate("before_event", 7, "2026-11-06", "2026-11-09"), "2026-11-06");
  assert.deepEqual(lastMonth("2026-12-01"), ["2026-11-01", "2026-11-30"]);
  assert.equal(cleanSlug("Hotel Realm"), "hotelrealm");
  assert.equal(cleanSlug("x"), null);
});
