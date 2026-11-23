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

test("catering locks 48 hours before the event starts (business timezone)", async () => {
  const { cateringLocked } = await import("./customer-edit");
  const tz = "Australia/Sydney"; // 22 Oct 2026 is AEDT (UTC+11)
  // Event 22 Oct 7:00am Sydney = 21 Oct 20:00 UTC; locks from 19 Oct 20:00 UTC
  assert.equal(cateringLocked("2026-10-22", "07:00", tz, new Date("2026-10-19T19:59:00Z")), false);
  assert.equal(cateringLocked("2026-10-22", "07:00", tz, new Date("2026-10-19T20:01:00Z")), true);
  // No start time: from midnight at the start of the day
  assert.equal(cateringLocked("2026-10-22", null, tz, new Date("2026-10-19T12:59:00Z")), false);
  assert.equal(cateringLocked("2026-10-22", null, tz, new Date("2026-10-19T13:01:00Z")), true);
  assert.equal(cateringLocked(null, null, tz), false);
});

test("staff hours: 3-hour minimum, second cart, hours per day", async () => {
  const { cleanStaffChange, staffChangeLine, staffOptions, staffQuote, hireDescription } = await import("./customer-edit");
  const e = {
    lineId: "s", hireLineId: "h", hirePrice: 400, hireTax: 10, staffPrice: 75, staffTax: 10, hirePerDay: false,
    days: [{ date: "2027-02-19", start: "08:00", end: "15:00", setup_minutes: 30 }], carts: 1, staff: 2,
    rule: { service_id: "b", min_hours: 3, setup_minutes: 30, round_to_hours: 0.5 }, label: "barista", unitWord: "cart",
    details: { kind: "staff" as const, days: [{ date: null, start: "08:00", end: "15:00", setup_minutes: 30, units: 1, per_unit: 2 }] },
    options: staffOptions(1, 2, true),
  };
  assert.deepEqual(e.options, [{ carts: 1, staff: 2 }, { carts: 2, staff: 2 }, { carts: 2, staff: 3 }, { carts: 2, staff: 4 }]);
  // as quoted: 7 hrs + 30 min setup = 7.5 × 2
  assert.equal(staffChangeLine(e, { days: [{ start: "08:00", end: "15:00" }], carts: 1, staff: 2 }).quantity, 15);
  // 1.5 hours of service still charges the 3 hr minimum each
  const short = cleanStaffChange({ days: [{ start: "9:00", end: "10:30" }], carts: 1, staff: 2 }, e)!;
  assert.equal(staffChangeLine(e, short).quantity, 6);
  // the day gets the event date (Day 1)
  assert.equal(staffChangeLine(e, short).details.days[0].date, "2027-02-19");
  // split across two carts: +$400 hire, same hours
  const q = staffQuote(e, { days: [{ start: "08:00", end: "15:00" }], carts: 2, staff: 2 });
  assert.equal(q.hours, 15); assert.equal(q.hireCost, 400);
  // 3 staff on 2 carts is described
  assert.match(staffChangeLine(e, { days: [{ start: "08:00", end: "15:00" }], carts: 2, staff: 3 }).description, /2 carts · 3 baristas between them/);
  assert.equal(cleanStaffChange({ days: [{ start: "08:00", end: "15:00" }], carts: 1, staff: 2 }, e), null);
  assert.throws(() => cleanStaffChange({ days: [{ start: "10:00", end: "09:00" }], carts: 1, staff: 2 }, e), /after the start/);
  assert.throws(() => cleanStaffChange({ days: [{ start: "08:00", end: "15:00" }], carts: 3, staff: 2 }, e), /isn't available/);
  assert.equal(hireDescription("Coffee cart hire", true, "cart"), "Coffee cart hire\nIncludes a second cart — no extra delivery charge.");
  assert.equal(hireDescription("Coffee cart hire\nIncludes a second cart — no extra delivery charge.", false, "cart"), "Coffee cart hire");
});

test("drinks: hot and cold chosen separately", async () => {
  const { cleanChange } = await import("./customer-edit");
  const lines = [{ id: "d", name: "Coffee", quantity: 400, unit: "cup", unit_price: 3, tax_rate: 10, service_id: "c", details: { kind: "serves", hot: 400, cold: 0 } as { kind: string }, is_optional: false, section_id: "s", category: "Coffee cart" }];
  const c = cleanChange({ set: [{ id: "d", hot: 250, cold: 150 }] }, lines, [], new Set(["c"]));
  assert.deepEqual(c.set, [{ id: "d", quantity: 400, hot: 250, cold: 150 }]);
  assert.throws(() => cleanChange({ set: [{ id: "d", hot: 0, cold: 0 }] }, lines, [], new Set(["c"])), /at least one drink/);
});
