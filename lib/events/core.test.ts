import { test } from "node:test";
import assert from "node:assert/strict";
import { cateringProblem, cateringSections, dayStatus, hireKindFromSlug, hirePageSlug, hireSections, isTentative, readEvents, requestProblem, sectionsTotal, type HireRequest } from "./core";
import type { PackageRules, PricedService } from "../pricing/engine";

const s = readEvents({ events: { enabled: true, city: "Canberra", fleet: { cart: 4, van: 1, diy: 2 }, stickerPrice: 1 } });
const svc = (id: string, name: string, unit: string, price: number): PricedService => ({ id, code: null, name, description: null, unit, unit_price: price, tax_rate: 10 });
const services = [svc("hire", "Coffee Cart Hire", "event", 400), svc("del", "Transport", "event", 250), svc("staff", "Barista", "hour", 75), svc("cup", "Coffee", "cup", 3), svc("diy", "Equipment", "day", 250)];
const cart: PackageRules = { hire: { service_id: "hire" }, delivery: { service_id: "del" }, staff: { service_id: "staff", min_hours: 3, setup_minutes: 30, round_to_hours: 0.5 }, per_serve: { service_id: "cup" } };
const diy: PackageRules = { hire: { service_id: "diy" }, delivery: { service_id: "del", no_delivery_label: "Free pickup" } };
const contact = { name: "Sam Lee", email: "sam@example.com", phone: "", company: "" };
const base: HireRequest = { kind: "cart", units: 2, days: [{ date: "2026-11-14", start: "09:00", end: "11:00", staff: 2, serves: 150 }], eventType: "", guests: null, venue: "", address: "", delivery: true, stickers: 0, wrap: false, catering: false, notes: "", contact };

test("settings: the business's fleet and SEO slugs", () => {
  assert.equal(s.fleet.van, 1);
  assert.equal(hirePageSlug("cart", s), "coffee-cart-hire-canberra");
  assert.equal(hireKindFromSlug("coffee-van-hire-canberra"), "van");
  assert.equal(hireKindFromSlug("drinks"), null);
  assert.equal(readEvents({}).enabled, false);
});

test("availability: the only van gives a FOMO message, a full day is refused", () => {
  assert.match(dayStatus("van", "2026-11-14", 1, 0, s).message, /only coffee van is free/i);
  assert.equal(dayStatus("van", "2026-11-14", 1, 1, s).ok, false);
  assert.equal(dayStatus("cart", "2026-11-14", 3, 2, s).ok, false);
  assert.match(dayStatus("cart", "2026-11-14", 1, 3, s).message, /Only 1 of 4/);
});

test("5-day rule: under the lead time is tentative", () => {
  assert.equal(isTentative("2026-11-10", "2026-11-14", 5), true);
  assert.equal(isTentative("2026-11-09", "2026-11-14", 5), false);
});

test("request checks", () => {
  assert.equal(requestProblem(base, s, "2026-11-01"), null);
  assert.match(requestProblem({ ...base, units: 5 }, s, "2026-11-01")!, /between 1 and 4/);
  assert.match(requestProblem({ ...base, contact: { ...contact, email: "x" } }, s, "2026-11-01")!, /email/);
  assert.match(requestProblem(base, s, "2026-11-20")!, /passed/);
});

test("cart quote: hire and delivery × carts, baristas and coffees, stickers", () => {
  const { sections } = hireSections({ ...base, stickers: 150 }, cart, services, s);
  const items = sections.flatMap((x) => x.items);
  assert.equal(items.find((i) => i.service_id === "hire")!.quantity, 2);
  assert.equal(items.find((i) => i.service_id === "del")!.quantity, 2);
  assert.equal(items.find((i) => i.service_id === "staff")!.quantity, 6); // 2 baristas × 3 h minimum
  assert.equal(items.find((i) => i.service_id === "cup")!.quantity, 150);
  assert.equal(items.find((i) => /stickers/.test(i.name))!.quantity, 150);
  // 800 + 500 + 450 + 450 + 150 = 2350 ex, 2585 inc
  assert.equal(sectionsTotal(sections).total, 2585);
});

test("two-day cart: delivery charged once", () => {
  const r = { ...base, units: 1, days: [...base.days, { date: "2026-11-15", start: "09:00", end: "12:00", staff: 1, serves: 80 }] };
  const items = hireSections(r, cart, services, s).sections.flatMap((x) => x.items);
  assert.equal(items.filter((i) => i.service_id === "del").length, 1);
  assert.equal(items.filter((i) => i.service_id === "hire").length, 2);
});

test("equipment only: daily hire × days × kits; pickup is free", () => {
  const r: HireRequest = { ...base, kind: "diy", units: 2, delivery: false, days: [{ date: "2026-11-14", start: "", end: "", staff: 0, serves: 0 }, { date: "2026-11-15", start: "", end: "", staff: 0, serves: 0 }] };
  const items = hireSections(r, diy, services, s).sections.flatMap((x) => x.items);
  assert.equal(items.find((i) => i.service_id === "diy")!.quantity, 4);
  assert.ok(items.some((i) => i.name === "Free pickup" && i.unit_price === 0));
  assert.ok(items.some((i) => i.service_id === "del" && i.is_optional));
});

test("catering: grouped by delivery, validated", () => {
  const menu = [{ id: "a", name: "Muffins", description: null, group: "Morning tea", unit: "person", unit_price: 5, tax_rate: 10 }, { id: "b", name: "Wraps", description: null, group: "Lunch", unit: "person", unit_price: 12.5, tax_rate: 10 }];
  const o = { date: "2026-11-14", venue: "", address: "1 Main St", guests: 20, notes: "", contact, slots: [{ slot: "morning" as const, time: "09:30", items: [{ serviceId: "a", qty: 20 }] }, { slot: "lunch" as const, time: "12:00", items: [{ serviceId: "b", qty: 20 }] }] };
  assert.equal(cateringProblem(o, menu, "2026-11-01"), null);
  assert.match(cateringProblem({ ...o, slots: [] }, menu, "2026-11-01")!, /Add something/);
  const sec = cateringSections(o, menu);
  assert.equal(sec.length, 2);
  assert.match(sec[0].title, /^Morning delivery/);
  assert.equal(sectionsTotal(sec).total, 385);
});
