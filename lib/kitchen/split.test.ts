import { test } from "node:test";
import assert from "node:assert/strict";
import { itemKey, readCateringDays, splitByDay } from "./split";

const items = [
  { service_id: "egg", name: "Bacon & Egg English Muffin", qty: 80 },
  { service_id: "sand", name: "Lunch – Sandwiches", qty: 80 },
];
const fb = { date: "2026-10-22", time: "07:00" };

test("readCateringDays keeps only good days and quantities", () => {
  const p = readCateringDays({
    days: [{ date: "2026-10-23", time: "7:30" }, { date: "2026-10-22", time: "07:00" }, { date: "2026-10-22" }, { date: "bad" }],
    qty: { egg: { "2026-10-22": "30", "2026-10-23": 50, "2026-10-30": 9 }, sand: { "2026-10-22": -1 }, x: "nope" },
  });
  assert.deepEqual(p.days, [{ date: "2026-10-22", time: "07:00" }, { date: "2026-10-23", time: "07:30" }]);
  assert.deepEqual(p.qty, { egg: { "2026-10-22": 30, "2026-10-23": 50 } });
  assert.deepEqual(readCateringDays(null), { days: [], qty: {} });
});

test("no plan: everything on the job date", () => {
  const { parts, warnings } = splitByDay(items, { days: [], qty: {} }, fb);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].date, "2026-10-22");
  assert.equal(parts[0].items.length, 2);
  assert.deepEqual(warnings, []);
});

test("split over two days with times", () => {
  const plan = readCateringDays({
    days: [{ date: "2026-10-22", time: "07:30" }, { date: "2026-10-23", time: "07:30" }],
    qty: { egg: { "2026-10-22": 30, "2026-10-23": 50 }, sand: { "2026-10-22": 80 } },
  });
  const { parts, warnings } = splitByDay(items, plan, fb);
  assert.deepEqual(warnings, []);
  assert.deepEqual(parts.map((p) => [p.date, p.time, p.items.map((i) => `${i.service_id}:${i.qty}`)]), [
    ["2026-10-22", "07:30", ["egg:30", "sand:80"]],
    ["2026-10-23", "07:30", ["egg:50"]],
  ]);
});

test("unsplit items go on day one and mismatches warn", () => {
  const plan = readCateringDays({ days: [{ date: "2026-10-22" }, { date: "2026-10-23" }], qty: { egg: { "2026-10-22": 30, "2026-10-23": 40 } } });
  const { parts, warnings } = splitByDay(items, plan, fb);
  assert.equal(parts[0].items.find((i) => i.service_id === "sand")!.qty, 80);
  assert.equal(warnings.length, 2);
  assert.match(warnings.join(" "), /70 split across the days but the quote has 80/);
});

test("same item on two lines counts once; name key without a menu item", () => {
  const { parts } = splitByDay([{ service_id: "egg", name: "A", qty: 10 }, { service_id: "egg", name: "A", qty: 5 }], { days: [], qty: {} }, fb);
  assert.equal(parts[0].items[0].qty, 15);
  assert.equal(itemKey({ service_id: null, name: " Fruit Platter " }), "name:fruit platter");
});
