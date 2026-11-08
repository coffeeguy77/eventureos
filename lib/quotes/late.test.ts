import { test } from "node:test";
import assert from "node:assert/strict";
import { canStillAccept, isLateAcceptance, quoteExpiryFor } from "./late";

test("expiry is at least 3 days before the event", () => {
  assert.equal(quoteExpiryFor("2026-11-09", "2026-11-21"), "2026-11-18");
  assert.equal(quoteExpiryFor("2026-11-09", "2027-02-01"), "2026-11-23");
  assert.equal(quoteExpiryFor("2026-11-09", null), "2026-11-23");
  assert.equal(quoteExpiryFor("2026-11-09", "2026-11-10"), "2026-11-09"); // short notice: expires today
});

test("late acceptance", () => {
  assert.equal(isLateAcceptance("2026-11-15", "2026-11-18", "2026-11-21"), false);
  assert.equal(isLateAcceptance("2026-11-19", "2026-11-18", "2026-11-21"), true);
  assert.equal(isLateAcceptance("2026-11-09", "2026-11-09", "2026-11-10"), true);
  assert.equal(canStillAccept("2026-11-19", "2026-11-18", "2026-11-21"), true);
  assert.equal(canStillAccept("2026-11-22", "2026-11-18", "2026-11-21"), false);
});
