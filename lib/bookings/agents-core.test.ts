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

test("certificate: skills keep whole items, badge words fit, settings default safely", async () => {
  const { wrapItems, approxWidth, readDesign, layout } = await import("./certificate");
  const lines = wrapItems(["Espresso extraction & dialling in", "Milk texturing", "Latte art basics", "Grinder calibration", "Machine cleaning & hygiene"], "body", 10.5, 374);
  for (const l of lines) assert.ok(approxWidth(l, "body", 10.5) <= 374, l);
  assert.ok(lines.every((l) => !/(^|· )calibration/.test(l) || /Grinder calibration/.test(l)));
  const d = readDesign({});
  assert.equal(d.emailAuto, false);
  assert.deepEqual(d.skills, {});
  // Swoosh: the rosette, date and signature never overlap
  const items = layout(readDesign({ signerName: "Shaun Matthews", signerTitle: "Director", signature: "data:image/png;base64,AAAA" }),
    { name: "Sarah Soukieh", course: "Looking For Work Course", date: "3 October 2026", hours: "4 hours", number: "C-1", business: "Bean Culture", verifyUrl: "https://x", points: ["A", "B"] }, { logo: true });
  const sig = items.find((i) => i.t === "image" && i.src === "signature") as { x: number };
  const ribbonXs = items.filter((i) => i.t === "path").map((p) => (p as { d: string }).d).filter((p) => p.startsWith("M4")).flatMap((p) => [...p.matchAll(/[ML](\d+(?:\.\d+)?),/g)].map((m) => Number(m[1])));
  assert.ok(ribbonXs.length > 0 && Math.max(...ribbonXs) < sig.x, "badge stays left of the signature");
});
