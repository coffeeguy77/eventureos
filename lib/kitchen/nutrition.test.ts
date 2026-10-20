import { test } from "node:test";
import assert from "node:assert/strict";
import { allergenStatement, fmtNutrient, gramsPerUnit, ingredientList, kcal, nutritionPanel, readPer100 } from "./nutrition";
import { AFCD } from "./afcd";

const per = (key: string) => AFCD.find((f) => f.key === key)!.per100;
const ings = [
  { id: "muffin", name: "English muffin", unit: "each", grams_each: 65, nutrition: per("F005896"), allergens: ["gluten", "wheat"] },
  { id: "bacon", name: "Bacon", unit: "g", nutrition: per("F000227"), allergens: [] },
  { id: "egg", name: "Eggs", unit: "each", grams_each: 50, nutrition: per("F003729"), allergens: ["egg"] },
  { id: "bbq", name: "BBQ sauce", unit: "ml", nutrition: per("F007987"), allergens: [] },
  { id: "butter", name: "Butter", unit: "g", nutrition: per("F001973"), allergens: ["milk"] },
];
const recipe = [
  { service_id: "bem", ingredient_id: "muffin", qty_per_serve: 1, prep_note: null },
  { service_id: "bem", ingredient_id: "bacon", qty_per_serve: 50, prep_note: null },
  { service_id: "bem", ingredient_id: "egg", qty_per_serve: 1, prep_note: null },
  { service_id: "bem", ingredient_id: "bbq", qty_per_serve: 15, prep_note: null },
  { service_id: "bem", ingredient_id: "butter", qty_per_serve: 5, prep_note: null },
];

test("AFCD values are complete", () => {
  assert.ok(AFCD.length >= 60);
  for (const f of AFCD) assert.ok(readPer100(f.per100), f.key);
});

test("bacon & egg muffin panel: per serve and per 100 g", () => {
  const p = nutritionPanel("bem", recipe, ings)!;
  assert.equal(p.serveGrams, 185);
  // energy per serve = 65g×938 + 50g×1747 + 50g×533 + 15g×725 + 5g×3069, /100
  const kj = (65 * 938 + 50 * 1747 + 50 * 533 + 15 * 725 + 5 * 3069) / 100;
  assert.ok(Math.abs(p.perServe.energy_kj - kj) < 0.01);
  assert.ok(Math.abs(p.per100.energy_kj - (kj / 185) * 100) < 0.01);
  assert.deepEqual(p.allergens, ["gluten", "wheat", "milk", "egg"]);
  assert.deepEqual(p.missingNutrition, []);
  assert.equal(ingredientList(p).split(", ")[0], "English muffin (35%)");
  assert.equal(allergenStatement(p.allergens), "Contains: gluten, wheat, milk, egg.");
  assert.equal(fmtNutrient("energy_kj", 1234.6), "1235");
  assert.equal(fmtNutrient("protein", 12.345), "12.3");
  assert.equal(kcal(4184), 1000);
});

test("missing weights and nutrition are reported, not guessed", () => {
  assert.equal(gramsPerUnit({ unit: "each", grams_each: null }), null);
  const p = nutritionPanel("x", [{ service_id: "x", ingredient_id: "q", qty_per_serve: 1, prep_note: null }, { service_id: "x", ingredient_id: "b", qty_per_serve: 10, prep_note: null }],
    [{ id: "q", name: "Mini quiche", unit: "each", grams_each: null }, { id: "b", name: "Bacon", unit: "g", nutrition: null }])!;
  assert.deepEqual(p.missingWeight, ["Mini quiche"]);
  assert.deepEqual(p.missingNutrition, ["Bacon"]);
  assert.equal(nutritionPanel("none", recipe, ings), null);
});
