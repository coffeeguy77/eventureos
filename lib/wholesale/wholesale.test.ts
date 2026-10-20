import { test } from "node:test";
import assert from "node:assert/strict";
import { currentRun, deliveryDateFor, looksLikeCoffee, nameKey, orderTotals, priceFor, runTotals, weightFromName } from "./rules";
import { parseOrdermentumEmail } from "./ordermentum-email";

test("delivery run: no cut-off, Thursday", () => {
  assert.equal(deliveryDateFor("2026-10-20", 4), "2026-10-22"); // Tue → this Thu
  assert.equal(deliveryDateFor("2026-10-21", 4), "2026-10-22"); // Wed → this Thu
  assert.equal(deliveryDateFor("2026-10-22", 4), "2026-10-29"); // Thu → next Thu
  assert.equal(deliveryDateFor("2026-10-24", 4), "2026-10-29"); // Sat → next Thu
  assert.equal(currentRun("2026-10-22", 4), "2026-10-22");
  assert.equal(currentRun("2026-10-23", 4), "2026-10-29");
});

test("weights, names, prices, totals", () => {
  assert.equal(weightFromName("Parliament Blend 1 kg"), 1);
  assert.equal(weightFromName("Decaf 250g"), 0.25);
  assert.equal(weightFromName("Chai powder"), null);
  assert.equal(nameKey("Parliament Blend 1 kg"), nameKey("parliament blend 1KG"));
  const p = { id: "a", unit_price: 35, tax_rate: 0 };
  assert.equal(priceFor(p, "Husk", [{ product_id: "a", price_group: "Husk", unit_price: 32 }]), 32);
  assert.equal(priceFor(p, "Other", [{ product_id: "a", price_group: "Husk", unit_price: 32 }]), 35);
  assert.deepEqual(orderTotals([{ quantity: 15, unit_price: 35, tax_rate: 0 }, { quantity: 2, unit_price: 32.5, tax_rate: 10 }]), { subtotal: 590, freight: 0, gst: 6.5, total: 596.5 });
  const rt = runTotals([{ name: "Parliament Blend 1 kg", quantity: 15, weight_kg: 1 }, { name: "Parliament Blend 1kg", quantity: 5, weight_kg: 1 }, { name: "Cups 8oz", quantity: 2, weight_kg: null }]);
  assert.equal(looksLikeCoffee("Seasonal Espresso Blend 1kg"), true);
  assert.equal(looksLikeCoffee("Cafetto Espresso Machine Cleaner 1Kg"), false);
  assert.deepEqual(rt.map((r) => [r.quantity, r.kg]), [[20, 20], [2, null]]);
});

// Same layout as the real emails, with made-up details
const SIMPLE = `TAX INVOICE OMI9001

To Test Cafe North
12 Example Street, Mitchell
ACT, 2911
Australia

Phone: 0400000001

From Roaster Co

Delivery Address1 Roaster Lane, Mitchell
ACT, 2911
Australia

Phone: 0400000002
ABN: 11111111111

Order number #OMO9001
Order date 20 Oct 2026
Delivery Date 22 Oct 2026

VIEW ORDER

ITEM QTY PRICE TOTAL

House Blend 1 kg
15 $35.00 $525.00
Subtotal $525.00
Freight $0.00
GST $0.00
Surcharge $0.00
Credit $-0.00
Discount $0.00
Total $525.00
Total $525.00`;

test("reads a simple order email", () => {
  const o = parseOrdermentumEmail("Invoice - Roaster Co #OMI9001", SIMPLE)!;
  assert.equal(o.invoiceNumber, "OMI9001");
  assert.equal(o.orderNumber, "OMO9001");
  assert.equal(o.orderDate, "2026-10-20");
  assert.equal(o.deliveryDate, "2026-10-22");
  assert.equal(o.customerName, "Test Cafe North");
  assert.equal(o.phone, "0400000001");
  assert.equal(o.shipTo, null);
  assert.deepEqual(o.lines, [{ name: "House Blend 1 kg", quantity: 15, unit_price: 35, line_total: 525 }]);
  assert.equal(o.total, 525);
  assert.deepEqual(o.problems, []);
});

test("delivery address for the customer, several items with GST, all on one line (HTML flattened)", () => {
  const t = `Tax Invoice OMI9002 To Example Golf Club Delivery AddressExample Golf Club, 7 Fake St, Yarralumla ACT, 2600 Australia Phone: 0400000003 From Roaster Co Delivery Address1 Roaster Lane Order number #OMO9002 Order date 5 Oct 2026 Delivery Date 8 Oct 2026 VIEW ORDER ITEM QTY PRICE TOTAL Seasonal Espresso Blend 1kg 4 $30.00 $120.00 Takeaway Cups 8oz (1000) 2 $65.00 $130.00 Decaf 250g 3 $12.50 $37.50 Subtotal $287.50 Freight $10.00 GST $14.00 Surcharge $0.00 Credit $-0.00 Discount $0.00 Total $311.50 Total $311.50`;
  const o = parseOrdermentumEmail("Invoice - Roaster Co #OMI9002", t)!;
  assert.equal(o.customerName, "Example Golf Club");
  assert.match(o.shipTo ?? "", /^Example Golf Club, 7 Fake St/);
  assert.deepEqual(o.lines.map((l) => [l.name, l.quantity, l.line_total]), [["Seasonal Espresso Blend 1kg", 4, 120], ["Takeaway Cups 8oz (1000)", 2, 130], ["Decaf 250g", 3, 37.5]]);
  assert.equal(o.freight, 10); assert.equal(o.gst, 14); assert.equal(o.total, 311.5);
  assert.deepEqual(o.problems, []);
});

test("flags what doesn't add up; ignores other emails", () => {
  const bad = SIMPLE.replace("Subtotal $525.00", "Subtotal $500.00");
  assert.ok(parseOrdermentumEmail("Invoice - Roaster Co #OMI9001", bad)!.problems.some((p) => /add up/.test(p)));
  assert.equal(parseOrdermentumEmail("Your weekly report", "Hello"), null);
});

import { matchCustomer } from "./match";
test("matching the customer on an order email", () => {
  const cs = [
    { id: "1", name: "Laneway Espresso", business_name: "Laneway Group Pty Ltd", phone: "0478 000 111", delivery_weekday: null },
    { id: "2", name: "Cafe Laneway Mitchell", business_name: null, phone: null, delivery_weekday: null },
    { id: "3", name: "CMAG Cafe", business_name: "Embrace Group Pty Limited", phone: null, delivery_weekday: null },
  ];
  assert.equal(matchCustomer({ customerName: "Cafe Laneway Mitchell", customerBlock: "", phone: null }, cs)?.id, "2");
  assert.equal(matchCustomer({ customerName: "Embrace Group Pty Limited CMAG Cafe176 London Circuit", customerBlock: "Embrace Group Pty Limited CMAG Cafe176 London Circuit", phone: null }, cs)?.id, "3");
  assert.equal(matchCustomer({ customerName: "Someone New", customerBlock: "Someone New 1 Road", phone: "+61 478 000 111" }, cs)?.id, "1");
  assert.equal(matchCustomer({ customerName: "Someone New", customerBlock: "Someone New 1 Road", phone: null }, cs), null);
});
