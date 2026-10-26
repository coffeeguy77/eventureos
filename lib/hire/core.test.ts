import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UNITS, bestPrice, bondFor, bookingTotal, chargeableHours, checkStock, cleanRates, cleanUnits, holdsFrom, peakUse,
  priceItem, readHireSettings, stockNeeds, usageGrid, weekendDaysBetween, type HireItem, type Hold,
} from "./core";

const H = 3_600_000;
const item = (o: Partial<HireItem> & { id: string }): HireItem => ({
  name: o.id, code: null, kind: "hire", category: null, quantity: 1, out_of_service: 0, rates: [], bond: 0, buffer_hours: null,
  companions: [], package_lines: [], active: true, ...o,
});
const map = (...xs: HireItem[]) => new Map(xs.map((x) => [x.id, x]));

test("settings default and clean", () => {
  const s = readHireSettings(null);
  assert.equal(s.enabled, false);
  assert.equal(s.units.length, 4);
  const t = readHireSettings({ hire: { enabled: true, bufferHours: "3", bondMode: "max", defaultStart: "25:00", units: [{ label: "Day", hours: 24 }, { label: "day", hours: 8 }, { label: "" }] } });
  assert.equal(t.enabled, true); assert.equal(t.bufferHours, 3); assert.equal(t.bondMode, "max"); assert.equal(t.defaultStart, "09:00");
  assert.deepEqual(t.units, [{ key: "day", label: "Day", hours: 24 }]);
  assert.deepEqual(cleanUnits("x"), DEFAULT_UNITS);
});

test("rates keep known units only", () => {
  assert.deepEqual(cleanRates([{ unit: "day", price: "90" }, { unit: "fortnight", price: 5 }, { unit: "day", price: 1 }, { unit: "week", price: -2 }], DEFAULT_UNITS), [{ unit: "day", price: 90 }]);
});

test("cheapest combination of rates", () => {
  const rates = [{ unit: "half_day", price: 50 }, { unit: "day", price: 90 }, { unit: "week", price: 300 }];
  assert.equal(bestPrice(rates, DEFAULT_UNITS, 3).each, 50);
  assert.equal(bestPrice(rates, DEFAULT_UNITS, 8).each, 90);     // a day beats two half days
  assert.equal(bestPrice(rates, DEFAULT_UNITS, 48).each, 180);
  const six = bestPrice(rates, DEFAULT_UNITS, 24 * 6);
  assert.equal(six.each, 300); assert.equal(six.note, "1 × week");  // a week beats 6 days
  const nine = bestPrice(rates, DEFAULT_UNITS, 24 * 9);
  assert.equal(nine.each, 480); assert.equal(nine.note, "1 × week + 2 × day");
  assert.equal(bestPrice([{ unit: "each", price: 25 }], DEFAULT_UNITS, 100).each, 25);
  assert.equal(bestPrice([], DEFAULT_UNITS, 10).note, "No price set");
});

test("chargeable hours: grace and weekends", () => {
  assert.equal(chargeableHours(0, 8 * H, { graceHours: 1 }), 8);
  assert.equal(chargeableHours(0, 24.5 * H, { graceHours: 1 }), 24);
  assert.equal(chargeableHours(0, 26 * H, { graceHours: 1 }), 26);
  assert.equal(chargeableHours(0, 24 * 5 * H, { graceHours: 0, weekendDays: 2 }), 72);
  assert.equal(weekendDaysBetween("2026-10-30", "2026-11-03"), 2); // Fri → Tue: Sat + Sun
  assert.equal(weekendDaysBetween("2026-10-31", "2026-11-01"), 0); // the hire days themselves still count
});

test("packages: price and stock", () => {
  const chair = item({ id: "chair", quantity: 100, rates: [{ unit: "day", price: 5 }] });
  const table = item({ id: "table", quantity: 10, rates: [{ unit: "day", price: 15 }] });
  const pack = item({ id: "pack", kind: "package", package_lines: [{ item_id: "chair", qty: 8 }, { item_id: "table", qty: 1 }] });
  const items = map(chair, table, pack);
  assert.equal(priceItem(pack, items, DEFAULT_UNITS, 24).each, 55);
  const need = stockNeeds([{ itemId: "pack", qty: 3 }, { itemId: "chair", qty: 2 }], items);
  assert.equal(need.get("chair"), 26); assert.equal(need.get("table"), 3);
});

test("peak use counts overlap, not total", () => {
  const holds: Hold[] = [
    { itemId: "a", qty: 3, start: 0, end: 10 * H, bookingId: "1", label: "H-1", status: "booked" },
    { itemId: "a", qty: 4, start: 12 * H, end: 20 * H, bookingId: "2", label: "H-2", status: "booked" },
  ];
  assert.equal(peakUse(holds, 0, 24 * H, 0), 4);
  assert.equal(peakUse(holds, 0, 24 * H, 3 * H), 7); // the 3h turnaround after H-1 runs into H-2
  assert.equal(peakUse(holds, 21 * H, 30 * H, 0), 0);
});

test("clash check: free-from time and alternatives", () => {
  const a = item({ id: "a", name: "Marquee 3x3", quantity: 2, category: "Marquees" });
  const b = item({ id: "b", name: "Marquee 3x6", quantity: 1, category: "Marquees" });
  const items = map(a, b);
  const holds: Hold[] = [{ itemId: "a", qty: 2, start: 0, end: 10 * H, bookingId: "x", label: "H-1001", status: "booked" }];
  const r = checkStock([{ itemId: "a", qty: 1 }], items, holds, 5 * H, 15 * H, 2);
  assert.equal(r.length, 1);
  assert.equal(r[0].short, 1);
  assert.equal(r[0].clashes[0].label, "H-1001");
  assert.equal(r[0].freeFrom, 12 * H); // after H-1001 is back plus the 2h turnaround
  assert.deepEqual(r[0].alternatives.map((x) => x.id), ["b"]);
  // starts right after the turnaround: fine
  assert.equal(checkStock([{ itemId: "a", qty: 2 }], items, holds, 12 * H, 20 * H, 2).length, 0);
  // out of service units don't count
  assert.equal(checkStock([{ itemId: "b", qty: 1 }], map(a, { ...b, out_of_service: 1 }), [], 0, H, 0).length, 1);
});

test("holds: returned items free up early; grid", () => {
  const a = item({ id: "a", quantity: 5 });
  const items = map(a);
  const holds = holdsFrom([{ booking_id: "1", item_id: "a", quantity: 4, qty_returned: 3, label: "H-1", status: "out", start: 0, end: 48 * H }], items);
  assert.equal(holds[0].qty, 1);
  const g = usageGrid([a], holds, [[0, 24 * H], [24 * H, 48 * H], [48 * H, 72 * H]], 0);
  assert.deepEqual(g.get("a"), [1, 1, 0]);
});

test("bond and totals", () => {
  const items = map(item({ id: "a", bond: 200 }), item({ id: "b", bond: 50 }));
  assert.equal(bondFor([{ itemId: "a", qty: 2 }, { itemId: "b", qty: 1 }], items, "sum"), 450);
  assert.equal(bondFor([{ itemId: "a", qty: 2 }, { itemId: "b", qty: 1 }], items, "max"), 200);
  assert.deepEqual(bookingTotal([{ line_total: 100 }, { line_total: 50 }], 60, 10), { items: 150, total: 200, gst: 18.18 });
});

test("brands, delivery area and shop settings", async () => {
  const { brandOf, bookingBrand } = await import("./core");
  const s = readHireSettings({ hire: {
    brands: [{ key: "main", name: "Hire & Events" }, { name: "Capital Pinball" }, { key: "x", name: "" }],
    itemBrands: { "11111111-1111-1111-1111-111111111111": "capital-pinball", bad: "main" },
    deliveryZone: { label: "ACT", fee: 195, states: ["ACT", "nsw"] }, shop: { enabled: true, instantBook: true, intro: " Hi " },
  } });
  assert.deepEqual(s.brands.map((b) => b.key), ["main", "capital-pinball"]);
  assert.deepEqual(Object.keys(s.itemBrands), ["11111111-1111-1111-1111-111111111111"]);
  assert.deepEqual(s.deliveryZone, { label: "ACT", fee: 195, states: ["ACT"] });
  assert.deepEqual(s.shop, { enabled: true, instantBook: true, intro: "Hi" });
  assert.equal(brandOf(s, "11111111-1111-1111-1111-111111111111")?.name, "Capital Pinball");
  assert.equal(brandOf(s, null)?.key, "main");
  assert.equal(bookingBrand(s, [{ item_id: "11111111-1111-1111-1111-111111111111", line_total: 500 }, { item_id: null, line_total: 40 }])?.key, "capital-pinball");
  assert.equal(brandOf(readHireSettings(null), "x"), null);
});
