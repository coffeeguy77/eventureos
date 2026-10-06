import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminder, fill, fomoLine, readReminders } from "./core";

test("reminders are off until switched on", () => {
  const r = readReminders({});
  assert.equal(r.enabled, false);
  assert.equal(Object.values(r.sections).some((s) => s.on), false);
});
test("timing: first after N hours, last call later", () => {
  const s = { ...readReminders({}).sections.events, on: true, firstAfterHours: 20, secondAfterHours: 48 };
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(dueReminder({ reminders_sent: 0, last_reminded_at: null, updated_at: "2026-11-01T12:00:00Z" }, s, now), 1);
  assert.equal(dueReminder({ reminders_sent: 0, last_reminded_at: null, updated_at: "2026-11-02T00:00:00Z" }, s, now), null);
  assert.equal(dueReminder({ reminders_sent: 1, last_reminded_at: "2026-10-30T12:00:00Z", updated_at: "2026-10-29T12:00:00Z" }, s, now), 2);
  assert.equal(dueReminder({ reminders_sent: 2, last_reminded_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-19T12:00:00Z" }, s, now), null);
});
test("words and FOMO", () => {
  assert.equal(fill("Hi {first}, {fomo} Go.", { first: "Sam", fomo: "" }), "Hi Sam, Go.");
  assert.match(fomoLine("van", "2026-11-14", 1, 1, "Coffee van"), /only coffee van is still free/);
  assert.match(fomoLine("cart", "2026-11-14", 1, 4, "Coffee cart"), /Only 1 of our 4/);
});
