import { test } from "node:test";
import assert from "node:assert/strict";
import { billedHours, chooseMachines, cleanJobItems, jobTotal, labourLines, notServicedBrand, readMachines, type MachineModel } from "./core";

const s = readMachines({ machines: { notServiced: ["Breville"] } });

test("defaults: $275 callout incl. first hour, $150/h after, 15-minute steps, + GST", () => {
  assert.equal(s.calloutFirstHour, 275);
  assert.equal(s.hourly, 150);
  assert.equal(s.incrementMin, 15);
  assert.equal(s.ratesIncGst, false);
});

test("billed hours round up to the step", () => {
  assert.equal(billedHours(1.1, 15), 1.25);
  assert.equal(billedHours(1, 15), 1);
  assert.equal(billedHours(0, 15), 0);
  assert.equal(billedHours(2.01, 30), 2.5);
});

test("callout: first hour charged even for a short job; then hourly", () => {
  const short = labourLines(0.5, true, s);
  assert.equal(short.length, 1);
  assert.equal(short[0].unit_inc, 302.5); // 275 + GST
  const long = labourLines(2.5, true, s);
  assert.equal(long[1].qty, 1.5);
  assert.equal(long[1].unit_inc, 165);
  const t = jobTotal({ kind: "repair", hours: 2.5, callout: true, items: [] }, s);
  assert.equal(t.exGst, 275 + 225);
  assert.equal(t.total, 550);
});

test("workshop job (no callout) is all hourly; a sale has no labour", () => {
  assert.deepEqual(labourLines(1, false, s).map((l) => [l.qty, l.unit_inc]), [[1, 165]]);
  assert.equal(jobTotal({ kind: "sale", hours: 3, callout: true, items: [] }, s).total, 0);
});

test("rates that include GST aren't grossed up", () => {
  const inc = readMachines({ machines: { ratesIncGst: true } });
  assert.equal(labourLines(1, true, inc)[0].unit_inc, 275);
});

test("job items: GST inclusive, GST-free lines carry no GST", () => {
  const items = cleanJobItems([{ description: "Grinder burrs", qty: 1, unit_inc: 110 }, { description: "Freight", qty: 1, unit_inc: 20, tax_rate: 0 }, { description: "", qty: 1, unit_inc: 5 }]);
  assert.equal(items.length, 2);
  const t = jobTotal({ kind: "sale", hours: 0, callout: false, items }, s);
  assert.equal(t.total, 130);
  assert.equal(t.gst, 10);
});

test("brands you don't service are caught in any wording", () => {
  assert.equal(notServicedBrand("Breville Barista Express", s), "Breville");
  assert.equal(notServicedBrand("breville", s), "Breville");
  assert.equal(notServicedBrand("La Marzocco", s), null);
  assert.equal(notServicedBrand("", s), null);
});

const M = (o: Partial<MachineModel> & { slug: string; price: number | null }): MachineModel & { price: number | null } => ({
  cups: 50, milk: "fresh", water: "tank", steamWand: false, twoMilks: false, widthMm: 300, depthMm: 500, heightMm: 500, weightKg: 15, screen: null, bestFor: null, highlights: [], ...o,
});

test("chooser: big enough, not far too big, and the must-haves decide what fits", () => {
  const models = [M({ slug: "small", cups: 30, price: 2300 }), M({ slug: "mid", cups: 60, price: 2900, water: "both" }), M({ slug: "big", cups: 300, price: 15000, water: "both", widthMm: 500 })];
  const r = chooseMachines(models, { cups: 50, milk: "fresh", water: "any", budget: null, compact: false, twoMilks: false, steamWand: false });
  assert.equal(r[0].slug, "mid");
  assert.equal(r.find((x) => x.slug === "small")!.fits, false);
  const cheap = chooseMachines(models, { cups: 50, milk: "any", water: "any", budget: 2500, compact: false, twoMilks: false, steamWand: false });
  assert.equal(cheap.filter((x) => x.fits).length, 0);
  const plumbed = chooseMachines([M({ slug: "tank", cups: 100, price: 3000 }), M({ slug: "plumb", cups: 100, price: 3500, water: "both" })], { cups: 80, milk: "any", water: "plumbed", budget: null, compact: false, twoMilks: false, steamWand: false });
  assert.equal(plumbed[0].slug, "plumb");
});
