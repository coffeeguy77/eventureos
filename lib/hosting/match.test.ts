import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAccounts, matchRecurring, mentions } from "./match";

test("mentions a domain only as itself", () => {
  assert.ok(mentions("hosting for www.abc.com.au - monthly", "abc.com.au"));
  assert.ok(mentions("HOSTING | abc.com.au".toLowerCase(), "abc.com.au"));
  assert.ok(mentions("site abc.com.au.", "abc.com.au"));
  assert.equal(mentions("hosting xabc.com.au", "abc.com.au"), false);
  assert.equal(mentions("hosting abc.com.au.nz", "abc.com.au"), false);
  assert.equal(mentions("hosting shop.abc.com.au", "abc.com.au"), false);
});
test("strong match from a repeating invoice; weak name-only suggestion", () => {
  const accounts = [{ id: "a1", domain: "smithplumbing.com.au", server_email: null, customer_id: null }, { id: "a2", domain: "joescafe.com", server_email: null, customer_id: null }];
  const customers = [{ id: "c1", name: "Smith Plumbing", company: null, email: "bob@gmail.com" }, { id: "c2", name: "Joes Cafe", company: null, email: null }];
  const rec = [{ id: "r1", customer_id: "c1", text: "Web hosting - smithplumbing.com.au", category: "hosting", hosting_account_id: null, status: "paused" }];
  const m = matchAccounts(accounts, customers, [], rec);
  assert.equal(m[0].best?.customerId, "c1"); assert.equal(m[0].strong, true);
  assert.equal(m[1].best?.customerId, "c2"); assert.equal(m[1].strong, true); // exact name, nobody else
  const r = matchRecurring([{ ...accounts[0], customer_id: "c1" }, { ...accounts[1], customer_id: "c2" }], rec);
  assert.equal(r.get("r1")?.accountId, "a1");
});
test("two clients equally likely is not strong", () => {
  const m = matchAccounts([{ id: "a", domain: "x.com.au", server_email: null, customer_id: null }],
    [{ id: "c1", name: "A", company: null, email: "a@x.com.au" }, { id: "c2", name: "B", company: null, email: "b@x.com.au" }], [], []);
  assert.equal(m[0].strong, false);
});
