import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptText, lastAttempts, mergePhones, nextNumber, xeroNumbers } from "./phones";

test("every number once, Xero types labelled", () => {
  const x = xeroNumbers([{ PhoneType: "MOBILE", PhoneNumber: "0412 345 678" }, { PhoneType: "DEFAULT", PhoneAreaCode: "02", PhoneNumber: "6123 4567" }, { PhoneType: "FAX", PhoneNumber: "02 9999 9999" }]);
  const all = mergePhones([{ number: "+61 412 345 678", label: "Client", source: "client" }], x);
  assert.deepEqual(all.map((p) => p.label), ["Client", "Office (Xero)"]);
  assert.equal(all[1].number, "02 6123 4567");
});

test("attempts read back, and the next number is a different one", () => {
  const notes = [
    { kind: "call", body: attemptText("CW1", "0412 345 678", "rang out"), created_at: "2026-10-29T01:00:00Z" },
    { kind: "call", body: "Spoke to Sarah", created_at: "2026-10-28T01:00:00Z" },
    { kind: "call", body: attemptText("BC", null), created_at: "2026-10-27T01:00:00Z" },
  ];
  assert.deepEqual(lastAttempts(notes).map((a) => [a.code, a.number]), [["CW1", "0412 345 678"], ["BC", null]]);
  const opts = [{ number: "0412 345 678", label: "Mobile", source: "xero" as const }, { number: "02 6123 4567", label: "Office", source: "xero" as const }];
  assert.equal(nextNumber(opts, "+61 412 345 678"), "02 6123 4567");
  assert.equal(nextNumber(opts, null), "0412 345 678");
});
