import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTheme, colourRole, readTheme, themeCss } from "./theme";

test("businesses from before themes keep the classic look; new ones start modern", () => {
  assert.equal(readTheme({}, true).preset, "classic");
  assert.equal(readTheme({}, false).preset, "modern");
  assert.equal(readTheme({ site_theme: { preset: "bold" } }, true).preset, "bold");
  assert.equal(readTheme({ site_theme: { preset: "bold" } }, true).nav, "dark");
});

test("odd values fall back to the preset's own choices", () => {
  const t = cleanTheme({ preset: "soft", accent: "red", heading: "comic", corners: "sharp", nav: "brand" });
  assert.deepEqual(t, { preset: "soft", accent: null, heading: "display", corners: "sharp", nav: "brand" });
  assert.equal(cleanTheme({ accent: "#0a2150" }).accent, "#0A2150");
});

test("classic changes nothing", () => {
  assert.equal(themeCss(readTheme({}, true), "#FB6F92"), "");
});

test("warm greys are redrawn, the old pink becomes the brand colour, real colours stay", () => {
  assert.equal(colourRole("#5E5853"), "neutral");
  assert.equal(colourRole("#FCFAF7"), "neutral");
  assert.equal(colourRole("#FF3D8A"), "accent");
  assert.equal(colourRole("#B42318"), "keep");
  const css = themeCss(readTheme({}, false), "#0A2150");
  assert.match(css, /text-\\\[\\#5E5853\\\]\{color:hsl\(220 /);
  assert.match(css, /shop-serif/);
  assert.doesNotMatch(css, /B42318/);
});
