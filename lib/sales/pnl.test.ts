import { test } from "node:test";
import assert from "node:assert/strict";
import { monthList, unitPnl, yearlyCost, yearlyPay } from "./pnl";

test("crew costs: annual and hourly shifts, with super", () => {
  assert.equal(yearlyPay({ role: "Chef", headcount: 1, pay_type: "annual", annual: 85000, hourly: null, hours_per_shift: null, shifts_per_week: null, weeks_per_year: null, super_pct: null }), 85000);
  // 2 baristas × $35 × 7 h × 5 shifts × 52 weeks
  assert.equal(yearlyPay({ role: "Barista", headcount: 2, pay_type: "hourly", annual: null, hourly: 35, hours_per_shift: 7, shifts_per_week: 5, weeks_per_year: 52, super_pct: null }), 2 * 35 * 7 * 5 * 52);
  assert.equal(yearlyCost({ role: "Chef", headcount: 1, pay_type: "annual", annual: 85000, hourly: null, hours_per_shift: null, shifts_per_week: null, weeks_per_year: null, super_pct: null }, 12), 95200);
});

test("months: last 12 ending this month", () => {
  const m = monthList("2026-11-18", 12);
  assert.equal(m.length, 12); assert.equal(m[0], "2025-12-01"); assert.equal(m[11], "2026-11-01");
});

test("P&L: sales less excluded categories, xero share, manual and wages", () => {
  const p = unitPnl({
    months: ["2026-10-01", "2026-11-01"], today: "2026-11-18",
    daily: [
      { location_id: "L1", day: "2026-10-05", category: "", sales: 1000, orders: 50 },
      { location_id: "L1", day: "2026-10-05", category: "Coffee beans", sales: 200, orders: 5 },
      { location_id: "L1", day: "2026-10-05", category: "Coffee", sales: 800, orders: 45 },
      { location_id: "L1", day: "2026-11-02", category: "", sales: 600, orders: 30 },
      { location_id: "L1", day: "2025-01-01", category: "", sales: 9999, orders: 1 },
    ],
    exclude: ["coffee beans"], superPct: 12,
    staff: [{ role: "Chef", headcount: 1, pay_type: "annual", annual: 12000, hourly: null, hours_per_shift: null, shifts_per_week: null, weeks_per_year: null, super_pct: 0 }],
    expenses: [
      { kind: "cogs", source: "xero", xero_contact_id: "S1", name: "Milk", share_pct: 50, annual: null },
      { kind: "overhead", source: "manual", xero_contact_id: null, name: "Rent", share_pct: 100, annual: 1200 },
    ],
    spend: [{ contact_id: "S1", month: "2026-10-01", amount: 300 }],
  });
  assert.equal(p.months[0].sales, 800);
  assert.equal(p.months[0].cogs, 150);
  assert.equal(p.months[0].wages, 1000);
  assert.equal(p.months[0].overheads, 100);
  assert.equal(p.months[0].profit, 800 - 150 - 1000 - 100);
  assert.equal(p.months[1].partial, true);
  assert.equal(p.totals.sales, 1400);
  assert.deepEqual(p.byCategory.map((c) => c.category), ["Coffee"]);
});

test("rolling period: first and last months pro-rated, current month spend not", async () => {
  const { covered } = await import("./pnl");
  assert.equal(covered("2025-11-01", "2025-11-19", "2026-11-18"), 12 / 30);
  assert.equal(covered("2026-03-01", "2025-11-19", "2026-11-18"), 1);
  assert.equal(covered("2026-11-01", "2025-11-19", "2026-11-18"), 18 / 30);
  const p = unitPnl({
    months: ["2025-11-01", "2025-12-01"], today: "2025-12-15", from: "2025-11-16", to: "2025-12-15",
    daily: [
      { location_id: "L1", day: "2025-11-10", category: "", sales: 500, orders: 5 },
      { location_id: "L1", day: "2025-11-20", category: "", sales: 300, orders: 3 },
    ],
    exclude: [], superPct: 0, staff: [{ role: "Chef", headcount: 1, pay_type: "annual", annual: 12000, hourly: null, hours_per_shift: null, shifts_per_week: null, weeks_per_year: null, super_pct: 0 }],
    expenses: [{ kind: "cogs", source: "xero", xero_contact_id: "S1", name: "Milk", share_pct: 100, annual: null }],
    spend: [{ contact_id: "S1", month: "2025-11-01", amount: 300 }, { contact_id: "S1", month: "2025-12-01", amount: 100 }],
  });
  assert.equal(p.months[0].sales, 300);
  assert.equal(p.months[0].wages, 500);       // 15 of 30 days
  assert.equal(p.months[0].cogs, 150);
  assert.equal(p.months[1].cogs, 100);        // current month: spend so far
  assert.equal(p.months[0].partial, true);
});
