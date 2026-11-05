import { test } from "node:test";
import assert from "node:assert/strict";
import { byOrigin, cleanCountry, cleanLine, cleanProcess, greenQuery, isFeeLine, priceIndex, pricePerYear, supplierFor } from "./purchases";

const noWarn = () => assert.fail("no warning expected");

test("supplierFor maps senders to importer names", () => {
  assert.equal(supplierFor("orders@projectorigin.com.au"), "Project Origin");
  assert.equal(supplierFor("accounts_coficom@volcafe.com"), "Cofi-Com (Volcafe)");
  assert.equal(supplierFor("finance@cofinet.com.au"), "Cofinet");
  assert.equal(supplierFor("x@unknown.com", "Some Importer"), "Some Importer");
});

test("greenQuery", () => {
  assert.equal(greenQuery(["orders@projectorigin.com.au", "volcafe.com"]), "from:(orders@projectorigin.com.au OR volcafe.com) has:attachment");
  assert.equal(greenQuery([]), null);
});

test("countries and processes", () => {
  assert.equal(cleanCountry("Bra"), "Brazil");
  assert.equal(cleanCountry("PNG"), "Papua New Guinea");
  assert.equal(cleanCountry("Col"), "Colombia");
  assert.equal(cleanCountry("ETHIOPIA"), "Ethiopia");
  assert.equal(cleanCountry("Sumatra"), "Indonesia");
  assert.equal(cleanProcess("YBB Natural"), "Natural");
  assert.equal(cleanProcess("Fully washed"), "Washed");
  assert.equal(cleanProcess("Red Honey"), "Honey");
});

test("Project Origin line (kg × price)", () => {
  const l = cleanLine({ description: "[BRA-25-0097] Bra Regional Classico Minas Gerais YBB Natural 2025", code: "BRA-25-0097", country: "Bra", region: "Minas Gerais", process: "Natural", crop_year: 2025, kg: 120, price_per_kg: 14.8, amount_ex_gst: 1776 }, noWarn)!;
  assert.equal(l.country, "Brazil"); assert.equal(l.kg, 120); assert.equal(l.price_per_kg, 14.8); assert.equal(l.amount_ex_gst, 1776); assert.equal(l.crop_year, 2025);
});

test("Cofi-Com line (6 bags × 60 kg at $13.77/kg)", () => {
  const l = cleanLine({ description: "6 bags of 60 kgs net of Brazil Arabica Coffee Santos NY 2/3, Scr 17/18, SS, GC", country: "Brazil", grade: "NY 2/3, Scr 17/18", bags: 6, bag_kg: 60, price_per_kg: 13.77, amount_ex_gst: 4957.2 }, noWarn)!;
  assert.equal(l.kg, 360); assert.equal(l.price_per_kg, 13.77);
});

test("Cofinet decaf and freight", () => {
  const d = cleanLine({ description: "Decaf Mix Washed", kg: 140, price_per_kg: 12.75, amount_ex_gst: 1785 }, noWarn)!;
  assert.equal(d.decaf, true); assert.equal(d.process, "Decaf"); assert.equal(d.country, null);
  assert.equal(isFeeLine("Coffee Freight on Sales invoices"), true);
  assert.equal(isFeeLine("Peaberry - Sertao Farm Yellow Bourbon Natural"), false);
});

test("a wrong printed $/kg is replaced by amount ÷ kg", () => {
  const w: string[] = [];
  const l = cleanLine({ description: "X", kg: 100, price_per_kg: 99, amount_ex_gst: 1000 }, (m) => w.push(m))!;
  assert.equal(l.price_per_kg, 10); assert.equal(w.length, 1);
});

test("stats: by origin, $/kg per year, index", () => {
  const lines = [
    { country: "Brazil", kg: 100, price_per_kg: 8, amount_ex_gst: 800, invoice_date: "2016-03-01", decaf: false, blend: false },
    { country: "Brazil", kg: 300, price_per_kg: 12, amount_ex_gst: 3600, invoice_date: "2024-03-01", decaf: false, blend: false },
    { country: "Colombia", kg: 100, price_per_kg: 10, amount_ex_gst: 1000, invoice_date: "2016-05-01", decaf: false, blend: false },
    { country: null, kg: 50, price_per_kg: 12, amount_ex_gst: 600, invoice_date: "2024-01-01", decaf: true, blend: false },
  ];
  const o = byOrigin(lines);
  assert.equal(o[0].origin, "Brazil"); assert.equal(o[0].kg, 400); assert.equal(o[0].first, "2016-03-01");
  assert.ok(o.some((x) => x.origin === "Decaf"));
  assert.equal(pricePerYear(lines).Brazil[2024].perKg, 12);
  const idx = priceIndex(lines);
  assert.equal(idx[0].year, 2016); assert.equal(idx[0].index, 100);
  // 2016: (800+1000)/200 = 9; 2024: (3600+600)/350 = 12 → 133.3
  assert.equal(idx[1].index, 133.3);
});
