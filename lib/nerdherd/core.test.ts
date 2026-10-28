import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDomain, monthly, paymentProfile, planCategory, timeLine } from "./core";

test("cleanDomain", () => {
  assert.equal(cleanDomain(" https://www.Example.com.au/contact "), "example.com.au");
  assert.equal(cleanDomain("shop.example.com:8080"), "shop.example.com");
});

test("monthly", () => {
  assert.equal(monthly(330, 12, "month"), 27.5);
  assert.equal(monthly(132, 3, "month"), 44);
});

test("planCategory", () => {
  assert.equal(planCategory({ category: "hosting" }), "hosting");
  assert.equal(planCategory({ category: "other", creates_ticket: true }), "maintenance");
  assert.equal(planCategory({ category: "other", name: "Scheduled Regular Website Maintenance Check" }), "maintenance");
});

test("paymentProfile", () => {
  const inv = [
    { status: "paid", issue_date: "2026-01-01", due_date: "2026-01-15", total: 100, balance: 0 },
    { status: "paid", issue_date: "2026-02-01", due_date: "2026-02-15", total: 100, balance: 0 },
    { status: "overdue", issue_date: "2026-09-01", due_date: "2026-09-15", total: 132, balance: 132 },
    { status: "void", issue_date: "2026-03-01", due_date: "2026-03-15", total: 50, balance: 50 },
  ];
  const pays = [
    { invoice_issue: "2026-01-01", invoice_due: "2026-01-15", paid_at: "2026-01-10T02:00:00Z", amount: 100 },
    { invoice_issue: "2026-02-01", invoice_due: "2026-02-15", paid_at: "2026-03-03T02:00:00Z", amount: 100 },
  ];
  const p = paymentProfile(inv, pays, "2026-10-28");
  assert.equal(p.invoices, 3);
  assert.equal(p.lifetimePaid, 200);
  assert.equal(p.overdue, 132);
  assert.equal(p.oldestOverdueDays, 43);
  assert.equal(p.onTimeRate, 0.5);
  assert.equal(p.avgDaysToPay, 20);
  assert.equal(p.rating, "slow");
});

test("timeLine rounds to quarter hours, GST inclusive", () => {
  const l = timeLine(50, 120, "Support", "6664");
  assert.equal(l.quantity, 0.75);
  assert.equal(l.unit_amount, 132);
});
