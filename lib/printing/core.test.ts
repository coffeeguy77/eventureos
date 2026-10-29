import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRINT, cleanItems, priceJob, readPrinting } from "./core";

const r = DEFAULT_PRINT;
test("printing is a flat $120 a metre", () => {
  // 3 m banner = 360 printing + 40 setup = 400 + GST
  const p = priceJob({ items: [{ description: "Banner", width_m: 1.2, length_m: 3, qty: 1 }], setup: true, cut: false }, r);
  assert.equal(p.lines[0].amount, 360); assert.equal(p.exGst, 400); assert.equal(p.total, 440);
});
test("cutting: $50 first metre, $20 each metre after", () => {
  // 3 m cut: 50 + 2×20 = 90; printing 360 + setup 40 → 490
  const p = priceJob({ items: [{ description: "Decals", width_m: 1.2, length_m: 3, qty: 1, cut: true }], setup: true, cut: false }, r);
  assert.equal(p.cutMetres, 3); assert.equal(p.exGst, 490);
  // 1 m cut = 50 only
  assert.equal(priceJob({ items: [{ description: "", width_m: 1, length_m: 1, qty: 1, cut: true }], setup: false, cut: false }, r).exGst, 170);
});
test("only the prints that are cut pay for cutting; old jobs' tick cuts everything", () => {
  const items = [{ description: "Banner", width_m: 1.2, length_m: 2, qty: 1 }, { description: "Stickers", width_m: 1.2, length_m: 1, qty: 2, cut: true }];
  const p = priceJob({ items, setup: true, cut: false }, r);
  assert.equal(p.metres, 4); assert.equal(p.cutMetres, 2); assert.equal(p.exGst, 480 + 40 + 50 + 20);
  assert.equal(priceJob({ items: [{ description: "", width_m: 1, length_m: 2, qty: 1 }], setup: false, cut: true }, r).cutMetres, 2);
});
test("wide prints flagged; rounding; settings", () => {
  assert.equal(priceJob({ items: [{ description: "", width_m: 1.5, length_m: 1, qty: 1 }], setup: true, cut: false }, r).tooWide.length, 1);
  assert.equal(priceJob({ items: [{ description: "", width_m: 1, length_m: 1.23, qty: 1 }], setup: false, cut: false }, { ...r, rounding: "0.1" }).exGst, 156);
  assert.equal(readPrinting({ printing: { printMetre: "100" } }).printMetre, 100);
});

test("a job's special price per metre replaces the standard rate", () => {
  const r = { ...DEFAULT_PRINT };
  const p = priceJob({ items: [{ description: "", width_m: 1.2, length_m: 3, qty: 1, rate: 100 }], setup: false, cut: false }, r);
  assert.equal(p.lines[0].amount, 300);
  assert.match(p.lines[0].description, /\$100\/m/);
  const mixed = priceJob({ items: [{ description: "", width_m: 1, length_m: 1, qty: 1, rate: 100 }, { description: "", width_m: 1, length_m: 2, qty: 1 }], setup: false, cut: false }, r);
  assert.deepEqual(mixed.lines.map((l) => l.amount), [100, 240]);
  assert.equal(cleanItems([{ length_m: 1, rate: "100" }])[0].rate, 100);
  assert.equal(cleanItems([{ length_m: 1, rate: "" }])[0].rate, undefined);
});
