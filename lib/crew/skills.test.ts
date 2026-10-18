import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSkills, isRosterOnly, isVanJob, staffNeededFromLines } from "./skills";

test("staff needed comes from the quote's staff lines", () => {
  assert.equal(staffNeededFromLines([{ details: { kind: "staff", days: [{ date: "2026-10-30", units: 1, per_unit: 2 }] } }]), 2);
  // several days: the busiest day
  assert.equal(staffNeededFromLines([{ details: { kind: "staff", days: [{ date: "a", units: 1, per_unit: 1 }, { date: "b", units: 1, per_unit: 3 }] } }]), 3);
  // two staff lines on the same day add up
  assert.equal(staffNeededFromLines([{ details: { kind: "staff", days: [{ date: "a", units: 1, per_unit: 1 }] } }, { details: { kind: "staff", days: [{ date: "a", units: 2, per_unit: 1 }] } }]), 3);
  assert.equal(staffNeededFromLines([{ details: null }, { details: { kind: "serves" } }]), null);
});

test("skills, roster-only and van jobs", () => {
  assert.deepEqual(cleanSkills(["driver", "nope", "driver", 3, "roster"]), ["driver", "roster"]);
  assert.deepEqual(cleanSkills(null), []);
  assert.equal(isRosterOnly(["roster"]), true);
  assert.equal(isRosterOnly(["coffee_van"]), false);
  assert.equal(isVanJob(["Coffee Van - World Teachers' Day"]), true);
  assert.equal(isVanJob(["Coffee Cart Hire | Press Club", "Caravan hire"]), false);
});
