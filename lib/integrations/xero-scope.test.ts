import { test } from "node:test";
import assert from "node:assert/strict";
import { inScope, readScope } from "./xero-scope";

const web = { mode: "include", accounts: ["666"], items: ["RepairShopr"] };

test("no scope keeps everything", () => {
  assert.equal(inScope([{ AccountCode: "200" }], readScope({})), true);
});

test("include keeps only web lines", () => {
  const s = readScope({ scope: web });
  assert.equal(inScope([{ AccountCode: "6661" }], s), true);
  assert.equal(inScope([{ account_code: null, item_code: "repairshopr" }], s), true);
  assert.equal(inScope([{ AccountCode: "200", ItemCode: "Coffee" }], s), false);
});

test("exclude keeps everything else", () => {
  const s = readScope({ scope: { ...web, mode: "exclude" } });
  assert.equal(inScope([{ AccountCode: "200" }], s), true);
  assert.equal(inScope([{ AccountCode: "200" }, { AccountCode: "6664" }], s), false);
});
