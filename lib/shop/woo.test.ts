import { test } from "node:test";
import assert from "node:assert/strict";
import { copiedText, decode, grindName, splitDescription } from "./woo-text";

test("WooCommerce text helpers", () => {
  assert.equal(decode("Parliament &#124; Cafe Blend &amp; more"), "Parliament | Cafe Blend & more");
  assert.equal(grindName("filter-machine"), "Filter machine");
  assert.equal(grindName("whole-beans"), "Whole beans");
  assert.equal(copiedText("Seasonal Espresso Blend", "Supreme displays a full-bodied richness"), true);
  assert.equal(copiedText("Supreme Blend", "Supreme displays a full-bodied richness"), false);
  const d = splitDescription("SUITABLE FOR Milk-based espresso ABOUT THIS COFFEE A TRADITIONAL MILK FOCUSED COFFEE TASTING NOTES AROMA Sweet ACIDITY Crisp ESPRESSO RECIPE DOSE 20g YIELD 40g MAKE THINGS EASIER WITH A SUBSCRIPTION? blah GRIND: Whole");
  assert.equal(d.bestFor, "Milk-based espresso");
  assert.match(d.description ?? "", /^A TRADITIONAL MILK FOCUSED COFFEE/);
  assert.match(d.description ?? "", /Dose: 20g/);
  assert.doesNotMatch(d.description ?? "", /SUBSCRIPTION|GRIND/);
});
