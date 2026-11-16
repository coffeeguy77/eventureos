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
