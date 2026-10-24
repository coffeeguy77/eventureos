import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INPUT, DRINKS, packageResult, pointAt, toCsv, type CalcInput } from "./calc";
import { packagePrices, readRoast } from "./config";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const withIn = (patch: Partial<CalcInput>): CalcInput => ({ ...DEFAULT_INPUT, ...patch });

test("acceptance: two hours and the eight-hour day on the 45 kg Giesen", () => {
  const two = packageResult(DEFAULT_INPUT, "two"), day = packageResult(DEFAULT_INPUT, "day");
  assert.equal(two.batches, 8); assert.equal(day.batches, 32);
  assert.equal(two.greenKg, 240); assert.equal(day.greenKg, 960);
  assert.equal(r2(two.roastedKg), 204); assert.equal(r2(day.roastedKg), 816);
  assert.equal(two.hire, 800); assert.equal(day.hire, 1600);
  assert.equal(r2(two.hirePerKg), 3.92); assert.equal(r2(day.hirePerKg), 1.96);
  assert.equal(r2(two.coreCostPerKg), 22.57); assert.equal(r2(day.coreCostPerKg), 20.61);
  assert.equal(two.units.full, 204); assert.equal(day.units.full, 816);
});

test("acceptance: a 30-minute break in the day", () => {
  const d = packageResult({ ...DEFAULT_INPUT, breakMin: 30 }, "day");
  assert.equal(d.batches, 30); assert.equal(d.greenKg, 900); assert.equal(r2(d.roastedKg), 765);
  assert.equal(d.hire, 1600); assert.equal(r2(d.hirePerKg), 2.09); assert.equal(r2(d.coreCostPerKg), 20.74);
  const b = packageResult(DEFAULT_INPUT, "dayBreak");
  assert.equal(b.batches, 30);
  // two-hour sessions never take the break
  assert.equal(packageResult({ ...DEFAULT_INPUT, breakMin: 30 }, "two").batches, 8);
});

test("acceptance: the four-hour marker counts completed slots only", () => {
  const day = packageResult(DEFAULT_INPUT, "day");
  const p = pointAt(day, 240);
  assert.equal(p.batches, 16); assert.equal(p.greenKg, 480); assert.equal(r2(p.roastedKg), 408);
  assert.equal(pointAt(day, 14.9).batches, 0);
  assert.equal(pointAt(day, 15).batches, 1);
  assert.equal(pointAt(day, 29).batches, 1, "no fractional batches between markers");
  // the whole package fee is committed from the start
  assert.equal(pointAt(day, 0).cost, 1600);
});

test("acceptance: day-rate cost composition per roasted kg", () => {
  const d = packageResult(DEFAULT_INPUT, "day");
  assert.equal(r2(d.costs.green / d.roastedKg), 17.65);
  assert.equal(r2(d.costs.hire / d.roastedKg), 1.96);
  assert.equal(r2(d.costs.packaging / d.roastedKg), 1);
  assert.equal(r2(d.costPerKg), 20.61);
});

test("chart totals match the cards", () => {
  for (const key of ["two", "day", "dayBreak"] as const) {
    const r = packageResult(DEFAULT_INPUT, key);
    const last = r.points[r.points.length - 1];
    assert.equal(last.batches, r.batches); assert.equal(r2(last.cost), r2(r.costs.total)); assert.equal(r2(last.sales), r2(r.revenue));
    assert.ok(r.points.every((p, k) => k === 0 || p.t >= r.points[k - 1].t), "time only moves forward");
    assert.ok(last.t <= r.hours * 60);
  }
});

test("productivity stretches the session but never invents batches", () => {
  const d = packageResult({ ...DEFAULT_INPUT, productivity: 80 }, "day");
  assert.equal(d.batches, Math.floor((480 * 0.8) / 15));
  assert.ok(d.points[d.points.length - 2].t <= 480);
});

test("zero output, zero revenue and bad numbers don't divide by zero", () => {
  const z = packageResult({ ...DEFAULT_INPUT, roastMin: 0, turnMin: 0 }, "day");
  assert.equal(z.batches, 0); assert.equal(z.hirePerKg, null); assert.equal(z.costPerKg, null); assert.equal(z.marginPct, null);
  assert.equal(z.contribution, -1600, "the hire is still owed");
  const nan = packageResult({ ...DEFAULT_INPUT, batchKg: Number.NaN, productivity: -20 }, "two");
  assert.equal(nan.batches, 0); assert.equal(nan.greenKg, 0);
  const free = packageResult({ ...DEFAULT_INPUT, bags: { ...DEFAULT_INPUT.bags, price: 0 } }, "day");
  assert.equal(free.revenue, 0); assert.equal(free.marginPct, null); assert.ok(free.contribution < 0);
});

test("negative contribution is shown, not hidden", () => {
  const cheap = packageResult({ ...DEFAULT_INPUT, bags: { ...DEFAULT_INPUT.bags, price: 10 } }, "day");
  assert.ok(cheap.contribution < 0); assert.ok((cheap.marginPct ?? 0) < 0); assert.ok((cheap.markupPct ?? 0) < 0);
});

test("bags: full bags only, leftover kept separately, sell-through and wastage", () => {
  const r = packageResult({ ...DEFAULT_INPUT, bags: { ...DEFAULT_INPUT.bags, bagKg: 0.25, costPerBag: 0.8, price: 14, sellPct: 90, wastePct: 2 } }, "two");
  const kg = 204 * 0.98;
  assert.equal(r.units.full, Math.floor(kg / 0.25));
  assert.ok(Math.abs(r.units.leftoverKg - (kg - r.units.full * 0.25)) < 1e-9);
  assert.equal(r.sold, Math.floor(r.units.full * 0.9));
  assert.equal(r2(r.revenue), r2(r.sold * 14));
  assert.equal(r2(r.costs.packaging), r2(r.units.full * 0.8));
  assert.equal(r2(r.breakEvenPrice), r2(r.costs.total / r.sold));
  const off = packageResult({ ...DEFAULT_INPUT, bags: { ...DEFAULT_INPUT.bags, packaging: false } }, "two");
  assert.equal(off.costs.packaging, 0);
  assert.ok(off.excluded.includes("Bags and labels"));
});

test("margin and markup are different things", () => {
  const r = packageResult(DEFAULT_INPUT, "day");
  assert.equal(r2(r.marginPct), r2((r.contribution / r.revenue) * 100));
  assert.equal(r2(r.markupPct), r2((r.contribution / r.costs.total) * 100));
  assert.notEqual(r2(r.marginPct), r2(r.markupPct));
});

test("drinks: 100 small or 50 large drinks per roasted kg before wastage, milk by the bottle, cups", () => {
  const small = { ...DEFAULT_INPUT.drinks, ...DRINKS.small };
  const one: CalcInput = withIn({ channel: "drinks", drinks: small, batchKg: 1 / 0.85, roastMin: 60, turnMin: 0 });
  const r = packageResult(one, "two");
  assert.equal(r2(r.roastedKg), 2);
  assert.equal(r.units.full, 200); assert.equal(r2(r.revenue), 1000);
  assert.equal(r2(r.costs.milk), r2(200 * 3.3 / 13));
  assert.equal(r2(3.3 / 13), 0.25);
  assert.equal(r2(r.costs.cups), 11);
  assert.equal(r.costs.packaging, 0, "retail bags are off for coffee used in drinks");
  const large = packageResult({ ...one, drinks: { ...DEFAULT_INPUT.drinks, ...DRINKS.large } }, "two");
  assert.equal(large.units.full, 100); assert.equal(r2(large.revenue), 600);
  const waste = packageResult({ ...one, drinks: { ...small, dialInPct: 5 } }, "two");
  assert.equal(waste.units.full, Math.floor(Math.floor((1.9 * 1000) / 20 + 1e-9) * 2));
});

test("small sample weights are exact (50 g = 0.05 kg)", () => {
  const ik = packageResult({ ...DEFAULT_INPUT, hourly: 75, batchKg: 0.05, roastMin: 8, turnMin: 2 }, "two");
  assert.equal(ik.batches, 12); assert.ok(Math.abs(ik.greenKg - 0.6) < 1e-12); assert.equal(ik.hire, 150);
});

test("business view takes GST out only where it applies", () => {
  const cash = packageResult(DEFAULT_INPUT, "day");
  const biz = packageResult({ ...DEFAULT_INPUT, tax: { ...DEFAULT_INPUT.tax, mode: "business" } }, "day");
  assert.equal(r2(biz.hire), r2(1600 / 1.1));
  assert.equal(biz.costs.green, cash.costs.green, "green coffee set as GST-free stays the same");
  assert.equal(r2(biz.costs.packaging), r2(cash.costs.packaging / 1.1));
  assert.equal(biz.revenue, cash.revenue, "bag sales set as GST-free stay the same");
});

test("membership is spread over the month's roasting, not charged per session", () => {
  const r = packageResult({ ...DEFAULT_INPUT, extras: { ...DEFAULT_INPUT.extras, enabled: true, monthlyKg: 816 } }, "day");
  assert.equal(r2(r.costs.extras), 99);
  const half = packageResult({ ...DEFAULT_INPUT, extras: { ...DEFAULT_INPUT.extras, enabled: true, monthlyKg: 1632 } }, "day");
  assert.equal(r2(half.costs.extras), 49.5);
});

test("prices: two-hour minimum and the half-price day; settings override", () => {
  assert.deepEqual([packagePrices(75).twoHour, packagePrices(75).day], [150, 300]);
  assert.deepEqual([packagePrices(400).twoHour, packagePrices(400).day], [800, 1600]);
  assert.equal(packagePrices(400).dayEqualsHours, 4);
  const c = readRoast({ roast: { membershipMonthly: 120, rates: { g450: 420, bullet: "x" } } });
  assert.equal(c.membershipMonthly, 120); assert.equal(c.machines.find((m) => m.id === "g450")!.hourly, 420); assert.equal(c.machines.find((m) => m.id === "bullet")!.hourly, 100);
  assert.equal(readRoast({}).membershipMonthly, 99);
});

test("CSV export carries the same numbers", () => {
  const rs = (["two", "day", "dayBreak"] as const).map((k) => packageResult(DEFAULT_INPUT, k));
  const csv = toCsv(DEFAULT_INPUT, rs, rs[1]);
  assert.ok(csv.includes("Eight-hour day,32,960,816,1600"));
  assert.ok(csv.split("\n").length > 40);
});
