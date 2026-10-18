import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REMINDERS, readReminders, reminderDue, type ReminderInvoice } from "./reminder-rules";

const on = { ...structuredClone(DEFAULT_REMINDERS), enabled: true };
const inv = (o: Partial<ReminderInvoice>): ReminderInvoice => ({ status: "awaiting_payment", balance: 100, due_date: "2026-10-30", event_date: "2026-10-30", emailed: true, sent: [], ...o });

test("off, unsent, paid or void → nothing", () => {
  assert.equal(reminderDue(inv({}), DEFAULT_REMINDERS, "2026-10-25"), null);
  assert.equal(reminderDue(inv({ emailed: false }), on, "2026-10-25"), null);
  assert.equal(reminderDue(inv({ balance: 0 }), on, "2026-10-25"), null);
  assert.equal(reminderDue(inv({ status: "void" }), on, "2026-10-25"), null);
});

test("before the event: the step reached, once", () => {
  assert.equal(reminderDue(inv({}), on, "2026-10-20"), null);              // 10 days out
  assert.equal(reminderDue(inv({}), on, "2026-10-25")?.key, "pre_7");      // 5 days out
  assert.equal(reminderDue(inv({}), on, "2026-10-29")?.key, "pre_2");      // 1 day out
  assert.equal(reminderDue(inv({ sent: [{ key: "pre_7", at: "2026-10-25T09:00:00Z" }] }), on, "2026-10-26"), null); // too soon after the last
  assert.equal(reminderDue(inv({ sent: [{ key: "pre_7", at: "2026-10-23T09:00:00Z" }] }), on, "2026-10-28")?.key, "pre_2");
  assert.equal(reminderDue(inv({ sent: [{ key: "pre_2", at: "2026-10-27T09:00:00Z" }] }), on, "2026-10-29"), null);
});

test("overdue: the latest step reached, once each", () => {
  const o = inv({ due_date: "2026-10-01", event_date: "2026-09-30" });
  assert.equal(reminderDue(o, on, "2026-10-01"), null);
  assert.equal(reminderDue(o, on, "2026-10-02")?.key, "overdue_1");
  assert.equal(reminderDue(o, on, "2026-10-20")?.key, "overdue_14"); // first run long after: only the latest one
  assert.equal(reminderDue({ ...o, sent: [{ key: "overdue_1", at: "2026-10-02T09:00:00Z" }] }, on, "2026-10-08")?.key, "overdue_7");
});

test("readReminders: defaults, clean-up and switched-off steps", () => {
  assert.equal(readReminders({}).enabled, false);
  const r = readReminders({ payment_reminders: { enabled: true, pre: [{ days: 3, on: true, subject: "", message: "Hi {first_name}" }, { days: 3 }], overdue: [{ days: 0, on: false }] } });
  assert.deepEqual(r.pre.map((s) => [s.key, s.days, s.message]), [["pre_3", 3, "Hi {first_name}"]]);
  assert.equal(r.pre[0].subject, DEFAULT_REMINDERS.pre[0].subject);
  assert.deepEqual(r.overdue.map((s) => [s.key, s.on]), [["overdue_1", false]]);
});
