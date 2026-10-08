import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLine, cafePages, cleanAppUrl, cleanHandle, hoursRows, openDates, readCafe, slotsFor, surchargeRows, toggleOption, unmetGroups, webMenu, zonedIso, type MenuItem } from "./core";

test("readCafe: defaults, clean values, prices hidden until set", () => {
  const d = readCafe({});
  assert.equal(d.enabled, false);
  assert.equal(d.appUrl, "");
  const c = readCafe({ cafe: {
    enabled: true, appUrl: "app.example.com.au/some/path", ordering: true, instagram: "@my.cafe",
    clubTiers: [{ name: "Hobby", price: "", unit: "month", features: ["A", "", "B"] }, { name: "Pro", price: "149.5", unit: "bogus" }, { name: "" }],
    heroImage: "javascript:alert(1)", clubImage: "/media/x.jpg",
  } });
  assert.equal(c.appUrl, "https://app.example.com.au");
  assert.equal(c.instagram, "my.cafe");
  assert.equal(c.clubTiers.length, 2);
  assert.equal(c.clubTiers[0].price, null);
  assert.deepEqual(c.clubTiers[0].features, ["A", "B"]);
  assert.equal(c.clubTiers[1].price, 149.5);
  assert.equal(c.clubTiers[1].unit, "month");
  assert.equal(c.heroImage, null);
  assert.equal(c.clubImage, "/media/x.jpg");
  const p = cafePages(c);
  assert.equal(p.order, true);
  assert.equal(p.reserve, false);
  assert.equal(cafePages({ ...c, appUrl: "" }).order, false);
});

test("cleanAppUrl / cleanHandle", () => {
  assert.equal(cleanAppUrl("http://app.x.com"), "");
  assert.equal(cleanAppUrl("https://user:pw@app.x.com"), "");
  assert.equal(cleanAppUrl("https://app.x.com/"), "https://app.x.com");
  assert.equal(cleanHandle("https://www.instagram.com/bean.culture/?hl=en"), "bean.culture");
});

const weekly = { MON: [{ start: "07:00", end: "14:00" }], SAT: [{ startMin: 480, endMin: 720 }] };

test("hours rows Monday first, closed days", () => {
  const r = hoursRows(weekly);
  assert.equal(r[0].day, "Monday");
  assert.equal(r[0].text, "7am – 2pm");
  assert.equal(r[1].closed, true);
  assert.equal(r[5].text, "8am – 12pm");
});

test("slots respect hours, lead time, closures", () => {
  // 2026-10-12 is a Monday
  const now = { date: "2026-10-12", minutes: 9 * 60 + 2 };
  const s = slotsFor("2026-10-12", weekly, [], now);
  assert.equal(s[0].value, "09:30"); // 9:02 + 15 min lead → 9:30 slot
  assert.equal(s.at(-1)!.value, "13:45");
  assert.equal(slotsFor("2026-10-13", weekly, [], now).length, 0); // Tuesday closed
  assert.equal(slotsFor("2026-10-19", weekly, [{ date: "2026-10-19" }], now).length, 0);
  assert.deepEqual(openDates(weekly, [], now, 6), ["2026-10-12", "2026-10-17"]);
});

test("zonedIso converts Canberra wall time", () => {
  assert.equal(zonedIso("2026-10-12", "09:30", "Australia/Sydney"), "2026-10-11T22:30:00.000Z"); // AEDT +11
  assert.equal(zonedIso("2026-07-01", "09:30", "Australia/Sydney"), "2026-06-30T23:30:00.000Z"); // AEST +10
});

const flat: MenuItem = {
  id: "i1", name: "Latte", variations: [{ id: "v1", name: "Small", price: 450 }, { id: "v2", name: "Large", price: 550 }],
  modifierGroups: [{ id: "g1", name: "Milk", selectionType: "SINGLE", min: 1, max: 1, modifiers: [{ id: "m1", name: "Full", price: 0 }, { id: "m2", name: "Oat", price: 70 }] },
    { id: "g2", name: "Extras", selectionType: "MULTIPLE", min: 0, max: 2, modifiers: [{ id: "x1", name: "Shot", price: 60 }, { id: "x2", name: "Syrup", price: 60 }, { id: "x3", name: "Honey", price: 60 }] }],
  lockedModifierIds: ["lk"], lockedModifierNames: ["Takeaway"],
};

test("options: required groups, single choice, max", () => {
  assert.equal(unmetGroups(flat, {}).length, 1);
  assert.deepEqual(toggleOption(flat.modifierGroups![0], ["m1"], "m2"), ["m2"]);
  assert.deepEqual(toggleOption(flat.modifierGroups![1], ["x1", "x2"], "x3"), ["x1", "x2"]);
  const l = buildLine(flat, "v2", { g1: ["m2"], g2: ["x1"] }, 2, " hot ");
  assert.equal(l.unitPrice, 550 + 70 + 60);
  assert.deepEqual(l.modifierIds, ["m2", "x1", "lk"]);
  assert.equal(l.note, "hot");
  assert.equal(l.variationName, "Large");
});

test("webMenu drops combos and empty sections", () => {
  const m = webMenu({ categories: [
    { category: "Coffee", items: [flat, { id: "c", name: "Combo", variations: [{ id: "combo-price-a", name: "", price: 900 }] }] },
    { category: "Empty", items: [] },
  ] });
  assert.equal(m.length, 1);
  assert.equal(m[0].items.length, 1);
});

test("surcharge estimate: weekend then card on top", () => {
  const rows = surchargeRows(1000, { weekend: { activeToday: true, percent: 10 }, card: { enabled: true, percent: 1.5 } }, null);
  assert.deepEqual(rows.map((r) => r.cents), [100, 17]);
  assert.equal(surchargeRows(1000, { weekend: { activeToday: true, percent: 10, locations: ["other"] } }, "main").length, 0);
});
