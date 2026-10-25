import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeMenu, cleanSaved, idFromHref, internalHref, toSaved, visibleMenu, type MenuNode } from "./menus";

const auto: MenuNode[] = [
  { id: "events", label: "Events", href: "/hire/x", icon: "events" },
  { id: "lessons", label: "Barista lessons", href: "/x", icon: "lessons", children: [
    { id: "home", label: "Hands-on classes", href: "/x" }, { id: "academy", label: "Academy", href: "/academy/x" }, { id: "jobs", label: "Job board", href: "/jobs/x" },
  ] },
  { id: "shop", label: "Shop", href: "/shop/x" },
];

test("with nothing saved the menu is the automatic one", () => {
  const m = arrangeMenu(auto);
  assert.deepEqual(m.map((i) => i.id), ["events", "lessons", "shop"]);
  assert.deepEqual(m[1].children.map((c) => c.id), ["home", "academy", "jobs"]);
});

test("order, names, hiding, phone/computer and custom links are applied; new sections land at the end", () => {
  const saved = cleanSaved([
    { id: "shop", label: "Buy coffee" },
    { id: "lessons", children: [{ id: "jobs" }, { id: "home", hidden: true }, { id: "c-1", custom: true, label: "Franchise", href: "/site/x/franchise" }] },
    { id: "gone" },
    { id: "c-2", custom: true, label: "Bad", href: "javascript:alert(1)" },
  ], 0);
  const m = arrangeMenu(auto, saved);
  assert.deepEqual(m.map((i) => i.id), ["shop", "lessons", "events"]);
  assert.equal(m[0].label, "Buy coffee");
  assert.deepEqual(m[1].children.map((c) => c.id), ["jobs", "home", "c-1", "academy"]);
  const v = visibleMenu(m);
  assert.deepEqual(v[1].children.map((c) => c.label), ["Job board", "Franchise", "Academy"]);
});

test("hidden headings hide their links; phone-only items stay off the computer menu", () => {
  const m = arrangeMenu(auto, [{ id: "events", desktop: false }, { id: "lessons", hidden: true }]);
  assert.deepEqual(visibleMenu(m, "desktop").map((i) => i.id), ["shop"]);
  assert.deepEqual(visibleMenu(m, "mobile").map((i) => i.id), ["events", "shop"]);
});

test("saving only stores what changed", () => {
  const m = arrangeMenu(auto);
  m[0].label = "Coffee carts";
  const s = toSaved(m);
  assert.deepEqual(s[0], { id: "events", label: "Coffee carts", children: [] });
  assert.deepEqual(s[2], { id: "shop", children: [] });
  assert.deepEqual(arrangeMenu(auto, cleanSaved(s, 0)).map((i) => i.label), ["Coffee carts", "Barista lessons", "Shop"]);
});

test("addresses and ids", () => {
  assert.equal(internalHref("x", "/franchise-canberra"), "/site/x/franchise-canberra");
  assert.equal(internalHref("x", "/hire/quote"), "/hire/x/quote");
  assert.equal(internalHref("x", "/book/x/course"), "/book/x/course");
  assert.equal(idFromHref("/cafe/x/roasting-club#equipment", "x"), "cafe/roasting-club.equipment");
  assert.equal(idFromHref("/x", "x"), "home");
});
