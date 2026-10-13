import { test } from "node:test";
import assert from "node:assert/strict";
import { changeText, cleanChange, customerCanChange, customerCatalogue, servesDescription, type EditLine, type EditService } from "./customer-edit";

const line = (o: Partial<EditLine>): EditLine => ({ id: "x", name: "Item", quantity: 1, unit: null, unit_price: 10, tax_rate: 10, service_id: "s", details: null, is_optional: false, section_id: "sec", category: null, ...o });
const lines = [
  line({ id: "van", name: "Coffee Van Hire", service_id: "vanhire", category: "Coffee van" }),
  line({ id: "bar", name: "Barista Hire", service_id: "barista", category: "Staff", details: { kind: "staff" } }),
  line({ id: "trav", name: "Travel", service_id: "travel", category: "Coffee van", details: { kind: "travel" } }),
  line({ id: "cof", name: "Coffee Individual", quantity: 120, service_id: "coffee", category: "Coffee cart", details: { kind: "serves" } }),
  line({ id: "bun", name: "Breakfast Bun/Wrap", quantity: 60, service_id: "bun", category: "Catering · Breakfast" }),
  line({ id: "muf", name: "Muffins", quantity: 60, service_id: "muf", category: "Catering · Morning & afternoon tea" }),
];
const services: EditService[] = [
  { id: "bun", name: "Breakfast Bun/Wrap", description: null, unit: "person", unit_price: 10, tax_rate: 10, category: "Catering · Breakfast" },
  { id: "muf", name: "Muffins", description: null, unit: "person", unit_price: 5, tax_rate: 10, category: "Catering · Morning & afternoon tea" },
  { id: "wrap", name: "Lunch – Wraps", description: null, unit: "person", unit_price: 12.5, tax_rate: 10, category: "Catering · Lunch" },
  { id: "vanhire", name: "Coffee Van Hire", description: null, unit: "event", unit_price: 475, tax_rate: 10, category: "Coffee van" },
];
const perServe = new Set(["coffee"]);

test("only catering and drinks can be changed", () => {
  assert.deepEqual(lines.map((l) => customerCanChange(l, perServe)), [false, false, false, true, true, true]);
  assert.deepEqual(customerCatalogue(services).map((s) => s.id), ["bun", "muf", "wrap"]);
});

test("cleanChange: quantities, removals, adds (merged into existing lines)", () => {
  const c = cleanChange({ set: [{ id: "cof", quantity: 150 }, { id: "bun", quantity: 60 }], remove: ["muf"], add: [{ service_id: "wrap", quantity: 40 }, { service_id: "bun", quantity: 10 }] }, lines, services, perServe);
  assert.deepEqual(c, { set: [{ id: "cof", quantity: 150 }, { id: "bun", quantity: 70 }], remove: ["muf"], add: [{ service_id: "wrap", quantity: 40 }] });
  assert.equal(changeText(c, lines, services), "added 40 × Lunch – Wraps; Coffee Individual 120 → 150; Breakfast Bun/Wrap 60 → 70; took off Muffins");
});

test("cleanChange refuses the business's lines, bad numbers and items not on the menu", () => {
  assert.throws(() => cleanChange({ remove: ["van"] }, lines, services, perServe), /can't be changed/);
  assert.throws(() => cleanChange({ set: [{ id: "bar", quantity: 2 }] }, lines, services, perServe), /can't be changed/);
  assert.throws(() => cleanChange({ set: [{ id: "bun", quantity: 0 }] }, lines, services, perServe), /1 to/);
  assert.throws(() => cleanChange({ set: [{ id: "bun", quantity: 2.5 }] }, lines, services, perServe), /1 to/);
  assert.throws(() => cleanChange({ add: [{ service_id: "vanhire", quantity: 1 }] }, lines, services, perServe), /isn't available/);
  assert.throws(() => cleanChange({}, lines, services, perServe), /Nothing has changed/);
});

test("servesDescription keeps the rest of the wording", () => {
  assert.equal(servesDescription("120 Hot drinks \n(Client to provide 12oz custom cups)", 150, 0), "150 Hot drinks \n(Client to provide 12oz custom cups)");
  assert.equal(servesDescription("Custom", 10, 0), "Custom");
});
