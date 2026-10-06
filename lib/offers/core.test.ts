import { test } from "node:test";
import assert from "node:assert/strict";
import { discountedEach, offerBig, offerDiscount, offerPath, offerProblem, offerStatus, toOffer } from "./core";

const base = toOffer({ id: "1", code: "SPRING15", kind: "percent", value: 15, works_on: ["classes", "gifts"], course_ids: [], uses: 0, active: true });

test("old shop coupons (no works_on column) only work in the shop", () => {
  const old = toOffer({ id: "2", code: "OLD", kind: "percent", value: 10, uses: 0, active: true });
  assert.deepEqual(old.works_on, ["shop"]);
  assert.match(offerProblem(old, { today: "2026-10-07", place: "gifts", courseId: null, subtotal: 150 })!, /coffee/);
});

test("percent and fixed discounts, never more than the price", () => {
  assert.equal(offerDiscount(base, 150), 22.5);
  assert.equal(offerDiscount({ ...base, kind: "fixed", value: 200 }, 150), 150);
  assert.equal(discountedEach(150, 2, 45), 127.5);
});

test("rules: dates, uses, courses, minimum spend, per customer, first-timers", () => {
  const x = { today: "2026-10-07", place: "classes" as const, courseId: "c1", subtotal: 150 };
  assert.equal(offerProblem(base, x), null);
  assert.match(offerProblem({ ...base, ends_on: "2026-10-01" }, x)!, /expired/);
  assert.match(offerProblem({ ...base, starts_on: "2026-11-01" }, x)!, /isn't active yet/);
  assert.match(offerProblem({ ...base, max_uses: 5, uses: 5 }, x)!, /fully used/);
  assert.match(offerProblem({ ...base, course_ids: ["c2"] }, x)!, /isn't for this class/);
  assert.match(offerProblem({ ...base, min_spend: 200 }, x)!, /Spend at least \$200/);
  assert.match(offerProblem({ ...base, per_customer: 1 }, { ...x, customerUses: 1 })!, /already used/);
  assert.match(offerProblem({ ...base, first_order_only: true }, { ...x, customerOrders: 2 })!, /first-time/);
  assert.match(offerProblem({ ...base, kind: "free_shipping" }, x)!, /free shipping/);
  assert.match(offerProblem({ ...base, works_on: ["shop"] }, x)!, /coffee shop/);
});

test("labels, links and status", () => {
  assert.equal(offerBig(base), "15% OFF");
  assert.equal(offerBig({ kind: "fixed", value: 20 }), "$20 OFF");
  assert.equal(offerPath(base, "beanculture"), "/beanculture?code=SPRING15");
  assert.equal(offerPath({ ...base, works_on: ["gifts"] }, "beanculture"), "/book/beanculture/gift?code=SPRING15");
  assert.equal(offerStatus(base, "2026-10-07").label, "Running");
  assert.equal(offerStatus({ ...base, active: false }, "2026-10-07").label, "Off");
});
