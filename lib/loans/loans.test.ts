import { test } from "node:test";
import assert from "node:assert/strict";
import { lastTwoFYs, defaultDocs } from "./docs";
import { cleanAnswers, fieldShown, labelFor, stepProgress, steps } from "./form";

test("financial years: the last two finished ones", () => {
  assert.deepEqual(lastTwoFYs("2026-11-16").map((f) => f.label), ["FY24/25", "FY25/26"]);
  assert.deepEqual(lastTwoFYs("2026-06-30").map((f) => f.label), ["FY23/24", "FY24/25"]);
  assert.equal(lastTwoFYs("2026-11-16")[1].end, "2026-06-30");
  assert.ok(defaultDocs("2026-11-16").some((d) => d.label.includes("FY24/25 & FY25/26")));
});

test("answers: only known keys, lists capped, applicants respected", () => {
  const c = cleanAnswers({ "a1.first_name": "Shaun", "a3.first_name": "x", hack: "y", vehicles: [{ make: "Hilux", owner: "Applicant 1", junk: 1 }], vehicles__none: true }, 2);
  assert.equal(c["a1.first_name"], "Shaun");
  assert.ok(!("a3.first_name" in c) && !("hack" in c));
  assert.deepEqual(c.vehicles, [{ owner: "Applicant 1", make: "Hilux", value: "" }]);
  assert.equal(c.vehicles__none, true);
});

test("questions that depend on a multi answer, and progress skips hidden ones", () => {
  const loan = steps(1).find((s) => s.key === "loan")!;
  const pt = loan.fields!.find((f) => f.key === "property_type")!;
  assert.equal(fieldShown(pt, { purpose: "Refinance" }), false);
  assert.equal(fieldShown(pt, { purpose: "Refinance|Buy a home" }), true);
  const before = stepProgress(loan, 1, {});
  assert.ok(before === 0);
  // changing an answer never removes the others: hidden questions keep their values
  const a = { purpose: "Refinance", property_type: "House" };
  assert.equal(cleanAnswers(a, 1).property_type, "House");
});

test("labels", () => {
  assert.equal(labelFor("a2.salary", 2, ["Shaun", "Cara"]), "Cara · Salary or wages (gross, yearly)");
  assert.equal(labelFor("vehicles", 1), "Motor vehicles");
});

import { summarise } from "./summary";
test("summary: income, net position, LVR", () => {
  const s = summarise({ "a1.salary": "120000", "a2.directors_wages": "80,000", amount: "600000", property_value: "800000",
    properties: [{ value: "900000", balance: "400000", rent: "500", repayment: "2500" }], cards: [{ limit: "10000", balance: "2000" }],
    savings: [{ amount: "50000" }], exp_groceries: "1200", exp_other: "800" }, 2);
  assert.equal(s.income, 120000 + 80000 + 500 * 52);
  assert.equal(s.net, 900000 + 50000 - 400000 - 2000);
  assert.equal(s.lvr, 75);
  assert.equal(s.monthlyLiving, 2000);
});

import { analyse, businessYear, repayment, taxOn } from "./analysis";
test("tax estimate (2026-27 resident rates + Medicare)", () => {
  assert.equal(taxOn(18_200), 364);
  assert.equal(taxOn(45_000), 4_020 + 900);
  assert.equal(taxOn(100_000), 4_020 + 16_500 + 2_000);
  assert.equal(taxOn(200_000), 4_020 + 27_000 + 20_350 + 4_500 + 4_000);
});
test("repayments", () => {
  assert.equal(Math.round(repayment(600_000, 6, 30)), 3597);
  assert.equal(repayment(0, 6, 30), 0);
});
test("analysis: cash flow and stress test", () => {
  const m = analyse({ "a1.salary": "150000", amount: "500000", property_value: "800000", cards: [{ limit: "10000", balance: "0" }], exp_groceries: "2000" }, 1, ["Shaun"], []);
  assert.equal(m.monthly.cardCommitment, 300);
  assert.equal(m.monthly.netIncome, Math.round((150000 - taxOn(150000)) / 12));
  assert.equal(m.monthly.surplus, m.monthly.netIncome - 2000 - 300 - m.monthly.newLoan);
  assert.equal(m.loan.lvr, 62.5);
  assert.equal(m.stress.length, 6);
  assert.ok(m.stress[0].surplus > m.stress[5].surplus);
});
test("Xero headline lines", () => {
  const pl = { name: "P&L", titles: [], rows: [{ type: "total" as const, cells: ["Total Trading Income", "250,000.00"] }, { type: "row" as const, cells: ["Net Profit", "42,500.50"] }] };
  const y = businessYear("Bean Culture", "FY25/26", pl, null);
  assert.equal(y.revenue, 250000); assert.equal(y.netProfit, 42500.5); assert.equal(y.assets, null);
});

test("loan questions follow the purpose", () => {
  const loan = steps(2).find((s) => s.key === "loan")!;
  const shown = (purpose: string) => loan.fields!.filter((f) => fieldShown(f, { purpose })).map((f) => f.key);
  const dc = shown("Debt consolidation");
  assert.ok(!dc.includes("property_value") && !dc.includes("deposit") && !dc.includes("first_home"));
  assert.ok(dc.includes("security_value") && dc.includes("consolidate_amount") && dc.includes("rate_type"));
  const buy = shown("Buy a home");
  assert.ok(buy.includes("property_value") && buy.includes("deposit") && !buy.includes("security_value"));
  const car = shown("Car or equipment");
  assert.ok(car.includes("asset_price") && !car.includes("rate_type") && !car.includes("property_value"));
  assert.ok(shown("Buy a home|Debt consolidation").includes("security_value"));
});
test("owners shown by name", async () => {
  const { ownerLabel } = await import("./form");
  assert.equal(ownerLabel("Applicant 2", ["Shaun", "Cara"]), "Cara");
  assert.equal(ownerLabel("Joint", ["Shaun", "Cara"]), "Joint (Shaun & Cara)");
});

import { mayAnswer } from "./permissions";
test("who can answer what", () => {
  assert.equal(mayAnswer(1, "a2.salary"), true);          // applicant 1 may fill in applicant 2's details
  assert.equal(mayAnswer(1, "a2.c_declaration"), false);  // but never tick their consents
  assert.equal(mayAnswer(1, "a1.c_declaration"), true);
  assert.equal(mayAnswer(1, "properties"), true);
  assert.equal(mayAnswer(2, "a2.salary"), true);
  assert.equal(mayAnswer(2, "a1.salary"), false);
  assert.equal(mayAnswer(2, "properties"), false);        // shared parts are applicant 1's
  assert.equal(mayAnswer(2, "a2.c_privacy"), true);
});
