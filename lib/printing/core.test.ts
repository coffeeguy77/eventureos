import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRINT, priceJob, readPrinting } from "./core";

test("print job prices", () => {
  const r = DEFAULT_PRINT;
  // one 1m banner, setup only: 120 + 40 = 160 + GST
  let p = priceJob({ items: [{ description: "Banner", width_m: 1, length_m: 1, qty: 1 }], setup: true, cut: false }, r);
  assert.equal(p.exGst, 160); assert.equal(p.gst, 16); assert.equal(p.total, 176);
  // 3 × 2m: 6 lineal metres → 120 + 5×20 = 220, + setup 40 + cut 40 = 300
  p = priceJob({ items: [{ description: "Signs", width_m: 0.9, length_m: 2, qty: 3 }], setup: true, cut: true }, r);
  assert.equal(p.metres, 6); assert.equal(p.exGst, 300);
  // half a metre still pays the first metre
  assert.equal(priceJob({ items: [{ description: "", width_m: 0.5, length_m: 0.5, qty: 1 }], setup: false, cut: false }, r).exGst, 120);
  // too wide for the roll
  assert.equal(priceJob({ items: [{ description: "", width_m: 1.5, length_m: 1, qty: 1 }], setup: true, cut: false }, r).tooWide.length, 1);
  // rounding up to 0.1 m
  assert.equal(priceJob({ items: [{ description: "", width_m: 1, length_m: 1.23, qty: 1 }], setup: false, cut: false }, { ...r, rounding: "0.1" }).exGst, 126);
  assert.equal(readPrinting({ printing: { firstMetre: "100" } }).firstMetre, 100);
});
