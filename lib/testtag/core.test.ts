import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, guessColumns, labelZpl, nextCode, readDate, readResult, tagStatus } from "./core";

test("retest dates and status", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-06", 12), "2027-11-06");
  const t = "2026-11-06";
  assert.equal(tagStatus({ status: "active", last_result: "pass", next_due: "2026-11-01" }, t), "overdue");
  assert.equal(tagStatus({ status: "active", last_result: "pass", next_due: "2026-11-20" }, t), "due_soon");
  assert.equal(tagStatus({ status: "active", last_result: "pass", next_due: "2027-06-01" }, t), "ok");
  assert.equal(tagStatus({ status: "active", last_result: "fail", next_due: "2027-06-01" }, t), "failed");
  assert.equal(tagStatus({ status: "active", last_result: null, next_due: null }, t), "untested");
});

test("codes, results, dates, columns", () => {
  assert.equal(nextCode("bc", ["BC-000009", "BC-000010", "XX-000999"]), "BC-000011");
  assert.equal(readResult("PASS"), "pass");
  assert.equal(readResult("F"), "fail");
  assert.equal(readResult("?"), null);
  assert.equal(readDate("06/11/2026 10:15"), "2026-11-06");
  assert.equal(readDate("2026-11-06T00:00"), "2026-11-06");
  assert.equal(readDate("6.3.26"), "2026-03-06");
  const g = guessColumns(["Appliance ID", "Description", "Date", "Status", "Rpe [Ohm]", "Riso [MOhm]", "Isub [mA]", "User"]);
  assert.equal(g.code, "Appliance ID");
  assert.equal(g.result, "Status");
  assert.equal(g.earth, "Rpe [Ohm]");
  assert.equal(g.insulation, "Riso [MOhm]");
  assert.equal(g.tester, "User");
});

test("label ZPL", () => {
  const z = labelZpl({ result: "pass", business: "Bean Culture", licence: "12345", phone: "02 6223 2200", owner: null, code: "BC-000001", item: "Coffee grinder ^bad~", tested: "2026-11-06", nextDue: "2027-11-06", tester: "Shaun", url: "https://example.com/t/BC-000001" });
  assert.match(z, /^\^XA/);
  assert.match(z, /\^PW800/);
  assert.match(z, /Next test due: 06\/11\/2027/);
  assert.doesNotMatch(z, /\^bad|~\s*\^FS/);
  assert.match(z, /\^BQN,2,5\^FDLA,https:\/\/example\.com/);
  assert.match(z, /\^XZ$/);
});
