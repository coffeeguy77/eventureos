import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, categoryFor, dueDate, linesFromXero, linesTotal, scheduleFromXero } from "./core";
const xeroDate = (v?: string | null, alt?: string | null) => { const m = v?.match(/\/Date\((-?\d+)/); if (m) return new Date(Number(m[1])).toISOString().slice(0, 10); const s = alt ?? v; return s && !Number.isNaN(Date.parse(s)) ? s.slice(0, 10) : null; };

test("monthly keeps the anchor day through short months", () => {
  assert.equal(advance("2026-01-31", 1, "month", 31), "2026-02-28");
  assert.equal(advance("2026-02-28", 1, "month", 31), "2026-03-31");
  assert.equal(advance("2026-11-15", 3, "month"), "2027-02-15");
  assert.equal(advance("2026-10-27", 2, "week"), "2026-11-10");
});
test("due dates", () => {
  assert.equal(dueDate("2026-10-27", "days_after", 14), "2026-11-10");
  assert.equal(dueDate("2026-10-27", "days_after_month_end", 7), "2026-11-07");
  assert.equal(dueDate("2026-10-27", "day_of_next_month", 20), "2026-11-20");
  assert.equal(dueDate("2026-10-27", "day_of_month", 20), "2026-10-27");
});
test("xero exclusive lines become GST inclusive", () => {
  const ls = linesFromXero({ RepeatingInvoiceID: "x", LineAmountTypes: "Exclusive", LineItems: [{ Description: "Hosting", Quantity: 1, UnitAmount: 30, LineAmount: 30, TaxAmount: 3, ItemCode: "AWHSD", AccountCode: "6661" }, { Description: "Backup", Quantity: 3, UnitAmount: 3.33, LineAmount: 9.99, TaxAmount: 1 }] });
  assert.equal(ls[0].unit_amount, 33); assert.equal(ls[0].tax_rate, 10);
  assert.equal(linesTotal(ls), 43.99);
  assert.equal(categoryFor(ls, { "6661": "Web Culture Hosting Clients" }), "hosting");
});
test("schedule from xero", () => {
  const s = scheduleFromXero({ RepeatingInvoiceID: "x", Schedule: { Period: 1, Unit: "MONTHLY", DueDate: 14, DueDateType: "DAYSAFTERBILLDATE", StartDate: "/Date(1735689600000+0000)/", NextScheduledDate: "/Date(1764547200000+0000)/" } }, xeroDate);
  assert.equal(s.unit, "month"); assert.equal(s.anchor_day, 1); assert.equal(s.next_date, "2025-12-01"); assert.equal(s.due_type, "days_after");
});
