import { test } from "node:test";
import assert from "node:assert/strict";
import { fullMonths, saleStats, suggestCoffeeCategories, categoryTotal } from "./stats";

test("full months before this month", () => {
  const m = fullMonths("2026-11-19", 12);
  assert.equal(m[0], "2025-11-01"); assert.equal(m[11], "2026-10-01");
});

test("years: coffees and coffee revenue from chosen categories, stops before the first sale", () => {
  const s = saleStats({
    today: "2026-11-19", years: 3, coffeeCategories: ["COFFEE", "Hot Bevs"],
    days: [
      { day: "2026-10-05", category: "", sales: 1000, orders: 100 }, // Monday
      { day: "2026-10-06", category: "", sales: 500, orders: 40 },
      { day: "2025-03-01", category: "", sales: 300, orders: 30 },
    ],
    items: [
      { month: "2026-10-01", item: "Latte", category: "COFFEE", qty: 80, sales: 400 },
      { month: "2026-10-01", item: "Chai", category: "hot bevs", qty: 10, sales: 50 },
      { month: "2026-10-01", item: "Toast", category: "Breakfast", qty: 20, sales: 200 },
      { month: "2026-10-01", item: "Beans 1kg", category: "Coffee Bags", qty: 5, sales: 250 },
    ],
  });
  assert.equal(s.years.length, 2); // nothing before Nov 2024 → the third year is left out
  assert.equal(s.years[0].sales, 1500); assert.equal(s.years[0].orders, 140);
  assert.equal(s.years[0].coffees, 90); assert.equal(s.years[0].coffeeSales, 450);
  assert.equal(s.years[0].bestDay?.label, "Monday");
  assert.equal(s.years[1].sales, 300); assert.equal(s.years[1].complete, false);
  assert.deepEqual(suggestCoffeeCategories(["COFFEE", "Coffee Bags", "Hot Drinks 3", "6 Oz", "Breakfast"]), ["COFFEE", "Hot Drinks 3", "6 Oz"]);
  assert.deepEqual(categoryTotal([{ month: "2026-10-01", item: "x", category: "Coffee Bags", qty: 5, sales: 250 }], ["coffee bags"], "2026-11-19"), { sales: 250, qty: 5 });
});
