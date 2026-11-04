import { test } from "node:test";
import assert from "node:assert/strict";
import { accuracyWords, cleanGeo, deliveryAddress, standingDeliveries, weekOf, type DeliveryLogRow } from "./deliveries";

test("weekOf gives Monday to Sunday", () => {
  assert.deepEqual(weekOf("2026-11-05"), { from: "2026-11-02", to: "2026-11-08" }); // Thursday
  assert.deepEqual(weekOf("2026-11-02"), { from: "2026-11-02", to: "2026-11-08" }); // Monday
  assert.deepEqual(weekOf("2026-11-08"), { from: "2026-11-02", to: "2026-11-08" }); // Sunday
});

test("cleanGeo keeps good fixes and drops junk", () => {
  assert.deepEqual(cleanGeo({ lat: -35.2809123456, lng: 149.130012345, accuracy: 12.4 }), { lat: -35.280912, lng: 149.130012, accuracy: 12 });
  assert.equal(cleanGeo({ lat: 0, lng: 0 }), null);
  assert.equal(cleanGeo({ lat: 200, lng: 1 }), null);
  assert.equal(cleanGeo(null), null);
  assert.deepEqual(cleanGeo({ lat: -35, lng: 149 }), { lat: -35, lng: 149, accuracy: null });
});

test("deliveryAddress prefers the order's ship-to", () => {
  assert.equal(deliveryAddress({ text: "Back door, 5 Lane St" }, { address1: "1 Main St" }), "Back door, 5 Lane St");
  assert.equal(deliveryAddress(null, { address1: "1 Main St", suburb: "Braddon", state: "ACT", postcode: "2612" }), "1 Main St, Braddon ACT 2612");
  assert.equal(deliveryAddress(null, null), "");
});

test("accuracyWords", () => {
  assert.equal(accuracyWords(12), "within 12 m");
  assert.equal(accuracyWords(87), "within about 90 m");
  assert.match(accuracyWords(1500), /1\.5 km/);
  assert.equal(accuracyWords(null), "accuracy unknown");
});

test("standingDeliveries ignores undone ticks", () => {
  const r = (order_id: string, action: "delivered" | "undone", at: string): DeliveryLogRow => ({ order_id, action, at, by_name: "Driver", lat: null, lng: null, accuracy_m: null, geo_error: null, note: null });
  const m = standingDeliveries([r("a", "delivered", "2026-11-05T01:00:00Z"), r("a", "undone", "2026-11-05T01:05:00Z"), r("b", "delivered", "2026-11-05T02:00:00Z"), r("c", "undone", "2026-11-05T01:00:00Z"), r("c", "delivered", "2026-11-05T03:00:00Z")]);
  assert.equal(m.has("a"), false);
  assert.equal(m.get("b")?.at, "2026-11-05T02:00:00Z");
  assert.equal(m.get("c")?.at, "2026-11-05T03:00:00Z");
});
