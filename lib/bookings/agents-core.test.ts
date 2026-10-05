import { test } from "node:test";
import assert from "node:assert/strict";
import { listName, maskEmail, parseCaseManagerList } from "./agents-core";

test("pick-list names show first name and last initial", () => {
  assert.equal(listName("Jason Bell"), "Jason B.");
  assert.equal(listName("Mary Anne de Silva"), "Mary S.");
  assert.equal(listName("Cher"), "Cher");
});

test("masked email shows which inbox without the address", () => {
  assert.equal(maskEmail("jason.bell@sureway.com.au"), "j•••••@sureway.com.au");
  assert.equal(maskEmail("jo@x.au"), "j••@x.au");
});

test("pasted list: commas, tabs, header row, quotes, junk", () => {
  const { rows, skipped } = parseCaseManagerList([
    "Name,Email,Phone,Office",
    "Jason Bell, jason.bell@sureway.com.au, 0412 345 678, Belconnen",
    "Priya Shah\tpriya.shah@sureway.com.au\t\tWoden",
    '"Lee, Sam",sam.lee@sureway.com.au,,',
    "just a note without an email",
    "x@y.com",
  ].join("\n"));
  assert.deepEqual(rows[0], { name: "Jason Bell", email: "jason.bell@sureway.com.au", phone: "0412 345 678", site: "Belconnen" });
  assert.deepEqual(rows[1], { name: "Priya Shah", email: "priya.shah@sureway.com.au", phone: null, site: "Woden" });
  assert.equal(rows[2].name, "Lee, Sam");
  assert.equal(rows.length, 3);
  assert.equal(skipped.length, 2);
});
