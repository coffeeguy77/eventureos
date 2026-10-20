import { test } from "node:test";
import assert from "node:assert/strict";
import { byJob, changeLines, changeSubject, diff, readSent, signature } from "./changes";
import type { Delivery } from "./core";

const d = (over: Partial<Delivery> = {}): Delivery => ({
  event_id: "e1", event_number: "EV-12", title: "Coffee Van — Shield AI", customer: "Shield AI", status: "confirmed", firm: true,
  date: "2026-10-22", time: "07:30", label: "Catering", address: "1 Test St", venue: null, guests: 80, notes: "Dietary: 3 gluten free\nParking at rear",
  items: [{ service_id: "egg", name: "Bacon & Egg English Muffin", qty: 30 }], ...over,
});

test("signature ignores order but notices quantity, time and date changes", () => {
  const a = [d(), d({ date: "2026-10-23", items: [{ service_id: "egg", name: "Bacon & Egg English Muffin", qty: 50 }] })];
  assert.equal(signature(a), signature([...a].reverse()));
  assert.notEqual(signature(a), signature([d({ time: "08:00" }), a[1]]));
  assert.notEqual(signature(a), signature([d({ items: [{ service_id: "egg", name: "x", qty: 31 }] }), a[1]]));
});

test("diff finds new, changed and cancelled jobs", () => {
  const now = byJob([d(), d({ event_id: "e2", customer: "Other" })]);
  const changes = diff(now, [
    { id: "e2", title: "Other", status: "confirmed", sent: { sig: "old", sent_at: "x" } },
    { id: "e3", title: "Gone", status: "cancelled", sent: { sig: "s", sent_at: "x" } },
  ]);
  assert.deepEqual(changes.map((c) => [c.kind, c.eventId]), [["new", "e1"], ["changed", "e2"], ["cancelled", "e3"]]);
  const same = diff(byJob([d()]), [{ id: "e1", title: "", status: "confirmed", sent: { sig: signature([d()]), sent_at: "x" } }]);
  assert.equal(same.length, 0);
});

test("email lines show each day, where, guests and dietary notes", () => {
  const [c] = diff(byJob([d(), d({ date: "2026-10-23" })]), []);
  const lines = changeLines(c);
  assert.equal(lines[0], "NEW — Shield AI (EV-12)");
  assert.match(lines[1], /^Thu,? 22 Oct, 7:30am: 30 × Bacon & Egg English Muffin$/);
  assert.match(lines.join("\n"), /Where: 1 Test St/);
  assert.match(lines.join("\n"), /Notes: Dietary: 3 gluten free/);
  assert.equal(changeSubject([c]), "New catering job: Shield AI");
});

test("readSent", () => {
  assert.equal(readSent(null), null);
  assert.deepEqual(readSent({ sig: "a", sent_at: "b" }), { sig: "a", sent_at: "b", changed_at: null });
});
