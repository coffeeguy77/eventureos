import { test } from "node:test";
import assert from "node:assert/strict";
import { abaFile } from "./aba";

const H = { bank: "CBA", userName: "BEAN CULTURE PTY LTD", userId: "301500", description: "WAGES", date: "2026-11-02", bsb: "062-000", account: "12345678", remitter: "BEAN CULTURE" };

test("ABA lines are 120 characters with the right records and totals", () => {
  const f = abaFile(H, [{ bsb: "123456", account: "987654321", name: "Sam Example", cents: 25075, reference: "Wages 2 Nov" }, { bsb: "111-222", account: "4321", name: "Jo", cents: 10000, reference: "Wages" }]);
  const lines = f.split("\r\n").slice(0, -1);
  assert.equal(lines.length, 4);
  for (const l of lines) assert.equal(l.length, 120);
  assert.equal(lines[0].slice(0, 1), "0");
  assert.equal(lines[0].slice(20, 23), "CBA");
  assert.equal(lines[0].slice(56, 62), "301500");
  assert.equal(lines[0].slice(74, 80), "021126");
  assert.equal(lines[1].slice(1, 8), "123-456");
  assert.equal(lines[1].slice(8, 17), "987654321");
  assert.equal(lines[1].slice(18, 20), "53");
  assert.equal(lines[1].slice(20, 30), "0000025075");
  assert.equal(lines[2].slice(8, 17), "     4321");
  assert.equal(lines[3].slice(20, 30), "0000035075");
  assert.equal(lines[3].slice(74, 80), "000002");
});

test("bad details are refused", () => {
  assert.throws(() => abaFile(H, []));
  assert.throws(() => abaFile(H, [{ bsb: "123", account: "1234", name: "x", cents: 100, reference: "" }]));
  assert.throws(() => abaFile(H, [{ bsb: "123456", account: "1234", name: "x", cents: 0, reference: "" }]));
});
