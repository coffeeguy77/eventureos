import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, couponProblem, DEFAULT_SHOP, gramsOf, grindLabel, nextDispatch, prepaidDeliveries, priceCart, readShop, unitPrice, type Coupon, type Product } from "./core";

const S = readShop({ shop: { ...DEFAULT_SHOP, enabled: true, flatRate: 10, freeOver: 80, subDiscount: 15, dispatchDays: [4, 5], prepaid: [{ months: 3, discount: 5 }] } });
const P: Product[] = [{
  id: "p1", slug: "parliament", name: "Parliament", kind: "coffee", category: null, short: null, description: null, tasting_notes: null, origin: null, roast: null, best_for: null,
  image_url: null, images: [], grinds: ["Whole beans", "Espresso"], subscribable: true, featured: false, status: "active", position: 0,
  variants: [{ id: "v200", product_id: "p1", label: "200g", grams: 200, price: 18, active: true, position: 0 }, { id: "v1k", product_id: "p1", label: "1kg", grams: 1000, price: 68, active: true, position: 1 }],
}, {
  id: "p2", slug: "box", name: "Box", kind: "coffee", category: null, short: null, description: null, tasting_notes: null, origin: null, roast: null, best_for: null,
  image_url: null, images: [], grinds: [], subscribable: false, featured: false, status: "active", position: 1,
  variants: [{ id: "vbox", product_id: "p2", label: "4 × 200g", grams: 800, price: 65, active: true, position: 0 }],
}];
const coupon = (o: Partial<Coupon> = {}): Coupon => ({ id: "c", code: "TEN", description: null, kind: "percent", value: 10, applies_to: "all", product_ids: [], min_spend: null, first_order_only: false, subscription_cycles: null, max_uses: null, per_customer: null, uses: 0, starts_on: null, ends_on: null, active: true, ...o });

test("subscription price takes the subscriber discount (matches WooCommerce: $68 → $57.80)", () => {
  assert.equal(unitPrice(68, "subscription", S), 57.8);
  assert.equal(unitPrice(68, "one_off", S), 68);
  assert.equal(unitPrice(68, "prepaid", S, 5), 54.91);
});

test("one-off order under the free-shipping amount pays flat rate; over it ships free", () => {
  const a = priceCart({ lines: [{ variantId: "v200", grind: "Espresso", adjust: 1, qty: 2 }], products: P, mode: "one_off", settings: S, delivery: "post" });
  assert.equal(a.subtotal, 36); assert.equal(a.shipping, 10); assert.equal(a.total, 46); assert.equal(a.freeShippingGap, 44);
  assert.equal(a.lines[0].grind, "Espresso"); assert.equal(a.lines[0].adjust, 1);
  const b = priceCart({ lines: [{ variantId: "v1k", grind: "Espresso", adjust: 0, qty: 2 }], products: P, mode: "one_off", settings: S, delivery: "post" });
  assert.equal(b.shipping, 0); assert.equal(b.total, 136);
  const c = priceCart({ lines: [{ variantId: "v200", grind: null, adjust: 0, qty: 1 }], products: P, mode: "one_off", settings: S, delivery: "pickup" });
  assert.equal(c.shipping, 0);
});

test("an unknown grind falls back to the first grind, whole beans can't be fine-tuned", () => {
  const a = priceCart({ lines: [{ variantId: "v200", grind: "Cold drip", adjust: 2, qty: 1 }], products: P, mode: "one_off", settings: S, delivery: "post" });
  assert.equal(a.lines[0].grind, "Whole beans");
  assert.equal(grindLabel("Whole beans", 2), "Whole beans");
  assert.equal(grindLabel("Espresso", -1), "Espresso (a little finer)");
});

test("subscription: per-delivery price with discount; non-subscribable products are flagged", () => {
  const a = priceCart({ lines: [{ variantId: "v1k", grind: "Espresso", adjust: 0, qty: 1 }], products: P, mode: "subscription", settings: S, delivery: "post" });
  assert.equal(a.subtotal, 57.8); assert.equal(a.saved, 10.2); assert.equal(a.shipping, 10); assert.equal(a.perDelivery, 67.8);
  const b = priceCart({ lines: [{ variantId: "vbox", grind: null, adjust: 0, qty: 1 }], products: P, mode: "subscription", settings: S, delivery: "post" });
  assert.ok(b.problems.length > 0);
});

test("prepaid 3 months fortnightly = 6 deliveries, paid up front with the extra discount", () => {
  assert.equal(prepaidDeliveries(3, { unit: "week", count: 2 }), 6);
  assert.equal(prepaidDeliveries(12, { unit: "week", count: 1 }), 52);
  assert.equal(prepaidDeliveries(6, { unit: "month", count: 1 }), 6);
  const a = priceCart({ lines: [{ variantId: "v1k", grind: "Espresso", adjust: 0, qty: 1 }], products: P, mode: "prepaid", settings: S, delivery: "post", prepaidMonths: 3, interval: { unit: "week", count: 2 } });
  assert.equal(a.deliveries, 6); assert.equal(a.perDelivery, round(54.91 + 10)); assert.equal(a.total, round((54.91 + 10) * 6));
});
const round = (n: number) => Math.round(n * 100) / 100;

test("coupons: percent, fixed, free shipping, product-only, rules", () => {
  const lines = [{ variantId: "v1k", grind: "Espresso", adjust: 0, qty: 1 }, { variantId: "vbox", grind: null, adjust: 0, qty: 1 }];
  const pct = priceCart({ lines, products: P, mode: "one_off", settings: S, delivery: "post", coupon: coupon(), couponOk: true });
  assert.equal(pct.discount, 13.3);
  const only = priceCart({ lines, products: P, mode: "one_off", settings: S, delivery: "post", coupon: coupon({ product_ids: ["p2"] }), couponOk: true });
  assert.equal(only.discount, 6.5);
  const fixed = priceCart({ lines, products: P, mode: "one_off", settings: S, delivery: "post", coupon: coupon({ kind: "fixed", value: 500 }), couponOk: true });
  assert.equal(fixed.discount, 133); assert.equal(fixed.total, 0);
  const ship = priceCart({ lines: [lines[1]], products: P, mode: "one_off", settings: S, delivery: "post", coupon: coupon({ kind: "free_shipping", value: 0 }), couponOk: true });
  assert.equal(ship.shipping, 0);
  const today = "2026-10-06";
  assert.equal(couponProblem(coupon({ ends_on: "2026-10-01" }), { today, mode: "one_off", subtotal: 50 }), "That code has expired.");
  assert.equal(couponProblem(coupon({ applies_to: "subscription" }), { today, mode: "one_off", subtotal: 50 }), "That code is for subscriptions.");
  assert.match(couponProblem(coupon({ min_spend: 60 }), { today, mode: "one_off", subtotal: 50 }) ?? "", /Spend at least \$60/);
  assert.equal(couponProblem(coupon({ first_order_only: true }), { today, mode: "one_off", subtotal: 50, customerOrders: 2 }), "That code is for your first order.");
  assert.equal(couponProblem(coupon({ max_uses: 3, uses: 3 }), { today, mode: "one_off", subtotal: 50 }), "That code has been fully used.");
  assert.equal(couponProblem(coupon(), { today, mode: "subscription", subtotal: 50 }), null);
});

test("delivery dates land on ship days; months keep the day of the month", () => {
  // 2026-10-06 is a Tuesday; ship days Thu/Fri; next working day after ordering
  assert.equal(nextDispatch("2026-10-06", S, 1), "2026-10-08");
  assert.equal(nextDispatch("2026-10-09", S, 1), "2026-10-15");
  assert.equal(addInterval("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(addInterval("2026-10-08", "week", 2), "2026-10-22");
});

test("gram weights from sizes", () => {
  assert.equal(gramsOf("1kg"), 1000); assert.equal(gramsOf("500g"), 500); assert.equal(gramsOf("4 × 200g"), null);
});

test("settings: bad values fall back to safe defaults", () => {
  const s = readShop({ shop: { enabled: true, flatRate: -5, subDiscount: 200, dispatchDays: [9, 4], frequencies: [{ unit: "year", count: 1 }, { unit: "week", count: 5 }] } });
  assert.equal(s.flatRate, DEFAULT_SHOP.flatRate); assert.equal(s.subDiscount, DEFAULT_SHOP.subDiscount);
  assert.deepEqual(s.dispatchDays, [4]); assert.deepEqual(s.frequencies, [{ unit: "week", count: 5 }]);
  assert.equal(readShop(null).enabled, false);
});

test("selection box: two coffees always in, two chosen (pre-selected when not chosen)", async () => {
  const { resolveBox, boxSummary, priceCart, readShop } = await import("./core");
  const mk = (id: string, name: string, kind: "coffee" | "other" = "coffee") => ({ id, slug: id, name, kind, category: null, short: null, description: null, tasting_notes: null, origin: null, roast: null, best_for: null, image_url: null, images: [], grinds: ["Whole beans"], subscribable: true, featured: false, status: "active", position: 0, variants: [{ id: id + "-v", product_id: id, label: "200g", grams: 200, price: 18, active: true, position: 0 }] });
  const U = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
  const products = [mk(U(1), "Parliament | Café Blend"), mk(U(2), "Seasonal Espresso"), mk(U(3), "Colombia"), mk(U(4), "Night Owl Decaf"), { ...mk(U(5), "Roaster Box"), variants: [{ id: "box-v", product_id: U(5), label: "4 × 200g", grams: 800, price: 65, active: true, position: 0 }] }];
  const box = { productId: U(5), included: [U(1), U(2)], slots: [{ default: U(3), options: [] }, { default: null, options: [U(3), U(4)] }], bag: "200g" };
  const r1 = resolveBox(box, undefined, products as never);
  assert.match(r1.problem!, /choose coffee 4/);
  const r2 = resolveBox(box, [U(4), U(4)], products as never);
  assert.equal(r2.problem, null);
  assert.equal(boxSummary(r2.contents), "Parliament, Seasonal Espresso, Night Owl Decaf, Night Owl Decaf");
  const r3 = resolveBox(box, ["bogus", U(1)], products as never); // not allowed in slot 2 → problem; slot 1 falls back to default
  assert.equal(r3.picks[0], U(3));
  assert.ok(r3.problem);
  const s = readShop({ shop: { enabled: true, boxes: [box] } });
  const priced = priceCart({ lines: [{ variantId: "box-v", grind: "Whole beans", adjust: 0, qty: 1, picks: [U(3), U(4)] }], products: products as never, mode: "one_off", settings: s, delivery: "post" });
  assert.equal(priced.problems.length, 0);
  assert.equal(priced.lines[0].contents?.length, 4);
  assert.equal(priced.subtotal, 65);
});
