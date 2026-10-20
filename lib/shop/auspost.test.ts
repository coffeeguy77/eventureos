import { test } from "node:test";
import assert from "node:assert/strict";
import { MYPOST_HEADERS, mypostRow, orderProblems, parcelWeightKg, readAusPost, readTrackingPaste, settingsProblems, toCsv } from "./auspost";

const s = readAusPost({ auspost: { from: { name: "Test Roasters", line1: "1 Roast St", suburb: "Fyshwick", state: "act", postcode: "2609", phone: "02 6000 0000" }, packaging: "AP_SATCHEL_M", packingGrams: 200 } });
const order = { id: "x", number: 54715, name: "Jane Citizen", email: "jane@example.com", phone: "+61400000000",
  address: { name: "Jane Citizen", company: "Example Pty Ltd", line1: "12 Example Street", line2: "Unit 3", suburb: "Bonython", state: "ACT", postcode: "2905" },
  items: [{ name: "Parliament | Cafe Blend", variant: "1kg", qty: 2 }, { name: "Decaf", variant: "200g", qty: 1 }] };

test("settings and weight", () => {
  assert.equal(s.from.state, "ACT");
  assert.equal(s.from.phone, "0260000000");
  assert.deepEqual(settingsProblems(s), []);
  assert.equal(settingsProblems(readAusPost({})).length, 1);
  assert.equal(parcelWeightKg(order.items, 200), 2.4);
  assert.equal(parcelWeightKg([{ name: "Mystery", variant: "", qty: 1 }], 200), null);
  assert.equal(parcelWeightKg([{ name: "Blend 500g", variant: "", qty: 2 }], 0), 1);
});

test("a MyPost Business row lines up with the template columns", () => {
  const row = mypostRow(order, { packaging: "AP_SATCHEL_M", service: "PP", weightKg: 2.4, length: null, width: null, height: null }, s);
  assert.equal(row.length, MYPOST_HEADERS.length);
  const get = (h: string) => row[MYPOST_HEADERS.indexOf(h as never)];
  assert.equal(get("Additional Label Information 1"), "Order #54715");
  assert.equal(get("Deliver To Business Name"), "Example Pty Ltd");
  assert.equal(get("Deliver To Postcode"), "2905");
  assert.equal(get("Deliver To Phone Number"), "0400000000");
  assert.equal(get("Item Packaging Type"), "AP_SATCHEL_M");
  assert.equal(get("Item Weight"), "2.4");
  assert.equal(get("Item Description"), "2x Parliament 1kg; 1x Decaf 200g");
  const csv = toCsv([row]);
  assert.ok(csv.startsWith("Additional Label Information 1,Send From Name,"));
  assert.equal(csv.trim().split("\r\n").length, 2);
});

test("problems: bad postcode, too heavy for a satchel", () => {
  const p = orderProblems({ ...order, address: { ...order.address, postcode: "28P5" } }, { packaging: "AP_SATCHEL_M", service: "PP", weightKg: 6, length: null, width: null, height: null });
  assert.equal(p.length, 2);
});

test("tracking numbers pasted back", () => {
  const r = readTrackingPaste("Order #54715, 33ABC1234567\n33XYZ7654321\t54718\nnonsense 123\n54999 33QQQ0000000", [54715, 54718]);
  assert.deepEqual(r, [{ number: 54715, tracking: "33ABC1234567" }, { number: 54718, tracking: "33XYZ7654321" }]);
});
