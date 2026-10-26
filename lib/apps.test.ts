import { test } from "node:test";
import assert from "node:assert/strict";
import { APPS, APP_KEYS, appAllowed, appForPath, cleanAppList, readAppAccess, readPlanApps } from "./apps";

test("catalogue covers every key once", () => {
  assert.deepEqual(APPS.map((a) => a.key).sort(), [...APP_KEYS].sort());
});

test("access: null means everything; a list means exactly those", () => {
  assert.equal(readAppAccess(null), null);
  const a = readAppAccess(["rentals", "nope", "store"]);
  assert.deepEqual([...a!].sort(), ["rentals", "store"]);
  assert.equal(appAllowed(null, "wholesale"), true);
  assert.equal(appAllowed(a, "wholesale"), false);
  assert.equal(appAllowed(a, "rentals"), true);
});

test("pages map to their app", () => {
  assert.equal(appForPath("/rentals/bookings/new"), "rentals");
  assert.equal(appForPath("/store"), "store");
  assert.equal(appForPath("/storefront"), null);
  assert.equal(appForPath("/events/1"), null);
});

test("plan defaults: unset plans include everything", () => {
  const p = readPlanApps({ starter: ["website", "x"] });
  assert.deepEqual(p.starter, ["website"]);
  assert.equal(p.scale.length, APP_KEYS.length);
  assert.deepEqual(cleanAppList(["store", "store", 3]), ["store"]);
});
