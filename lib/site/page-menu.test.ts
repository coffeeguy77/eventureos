import { test } from "node:test";
import assert from "node:assert/strict";
import { pageMenuFor, siteMenuTone } from "./page-menu";
import { applyEdits } from "./copy";

test("site default colour, per-page override and section style", () => {
  assert.equal(siteMenuTone({}), "light");
  const s = { site: { menuTone: "dark", pageMenu: { shop: { tone: "light", section: "hidden" }, home: { section: "float" } } } };
  assert.deepEqual(pageMenuFor(s, "shop"), { tone: "light", section: "hidden" });
  assert.deepEqual(pageMenuFor(s, "home"), { tone: "dark", section: "float" });
  assert.deepEqual(pageMenuFor(s, "cafe"), { tone: "dark", section: null });
});
test("the page editor can only save valid menu choices", () => {
  const out = applyEdits({}, [{ path: "site.pageMenu.cafe-roasting-club.tone", value: "dark" }, { path: "site.pageMenu.cafe-roasting-club.section", value: "hidden" }]) as { site: { pageMenu: Record<string, unknown> } };
  assert.deepEqual(out.site.pageMenu["cafe-roasting-club"], { tone: "dark", section: "hidden" });
  assert.throws(() => applyEdits({}, [{ path: "site.pageMenu.x.tone", value: "pink" }]));
  assert.throws(() => applyEdits({}, [{ path: "site.pageMenu.x.section", value: "huge" }]));
});
