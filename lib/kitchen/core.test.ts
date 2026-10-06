import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveriesFromEvent, production, shoppingList } from "./core";

const ev = { id: "e1", number: 7, title: "Catering", status: "quoted", event_date: "2026-11-14", start_time: null, address: "1 St", venue: null, guest_count: 20, customer_notes: null,
  catering: [{ slot: "morning", label: "Morning delivery", time: "09:30", date: "2026-11-14", items: [{ service_id: "muesli", name: "Muesli", qty: 20 }] }, { slot: "lunch", label: "Lunch delivery", time: "12:00", items: [{ service_id: "wrap", name: "Wraps", qty: 15 }] }] };

test("kitchen: deliveries, what to make, and packs to order", () => {
  const d = deliveriesFromEvent(ev);
  assert.equal(d.length, 2);
  assert.equal(d[0].firm, false);
  const recipes = [{ service_id: "muesli", ingredient_id: "oats", qty_per_serve: 60, prep_note: "Soak overnight" }, { service_id: "wrap", ingredient_id: "tort", qty_per_serve: 3, prep_note: null }];
  const ing = [{ id: "oats", name: "Oats", unit: "g", pack_size: 1000, pack_label: "1 kg bag", supplier: "A", station: null }, { id: "tort", name: "Tortillas", unit: "each", pack_size: 12, pack_label: null, supplier: "B", station: null }];
  const p = production(d, recipes);
  assert.deepEqual(p.map((x) => [x.name, x.total]), [["Muesli", 20], ["Wraps", 15]]);
  assert.deepEqual(p[0].prep, ["Soak overnight"]);
  const s = shoppingList(d, recipes, ing);
  assert.equal(s.find((x) => x.ingredient.id === "oats")!.packs, 2); // 1200 g → 2 bags
  assert.equal(s.find((x) => x.ingredient.id === "tort")!.packs, 4); // 45 → 4 × 12
});
