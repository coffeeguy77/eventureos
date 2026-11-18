import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateOrders, type SquareOrder } from "./square";

test("Square orders: ex GST, no tips, completed only, split by category on the local day", () => {
  const orders = [
    { id: "1", location_id: "L", created_at: "2026-11-17T14:30:00Z", state: "COMPLETED", // 18 Nov 1:30am Sydney
      net_amounts: { total_money: { amount: 1300 }, tax_money: { amount: 100 }, tip_money: { amount: 200 } },
      line_items: [{ name: "Latte", quantity: "2", catalog_object_id: "V1", total_money: { amount: 1100 }, total_tax_money: { amount: 100 } }] },
    { id: "2", location_id: "L", created_at: "2026-11-18T01:00:00Z", state: "CANCELED", total_money: { amount: 5000 } },
  ] as unknown as SquareOrder[];
  const r = aggregateOrders(orders, "Australia/Sydney", () => "Coffee");
  const whole = r.days.find((d) => d.category === "")!;
  assert.equal(whole.day, "2026-11-18");
  assert.equal(whole.sales, 10);   // $13 − $1 GST − $2 tip
  assert.equal(whole.gst, 1);
  assert.equal(whole.orders, 1);
  const coffee = r.days.find((d) => d.category === "Coffee")!;
  assert.equal(coffee.sales, 10);
  assert.equal(r.items[0].qty, 2);
});
