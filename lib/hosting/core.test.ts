import { test } from "node:test";
import assert from "node:assert/strict";
import { billingReference, billingState, canAutoSuspend, canAutoUnsuspend, codeRules, hasMarker, matchInvoice, readHosting, stripMarker, withMarker, type Inv } from "./core";

const s = readHosting({});
const r = codeRules(s);
const inv = (p: Partial<Inv>): Inv => ({ id: "1", number: "INV-1", reference: "HOSTING | a.com.au", status: "awaiting_payment", total: 330, amountPaid: 0, dueDate: "2026-10-01", issueDate: "2026-09-17", itemCodes: ["AWHSD"], customerId: "c1", payToken: null, ...p });
const flags = { suspended: false, byApp: false, category: null, manual: false, disputed: false, vip: false, lastNoticeAt: null, lastNoticeType: null, extensionUntil: null };
const now = new Date("2026-10-27T00:00:00Z");

test("defaults are safe", () => { assert.equal(s.dryRun, true); assert.equal(s.autoSuspend, false); assert.equal(billingReference("https://A.com.au/"), "HOSTING | a.com.au"); });
test("marker round trip", () => { const m = withMarker("Overdue"); assert.ok(hasMarker(m)); assert.equal(stripMarker(m), "Overdue"); assert.equal(withMarker(m), m); });
test("exact reference match, overdue, no notice", () => {
  const m = matchInvoice("HOSTING | a.com.au", [inv({})], r);
  assert.equal(m.status, "Exact Reference Match");
  const st = billingState({ hasRef: true, match: m, flags, s, now });
  assert.equal(st.status, "Outside Terms"); assert.equal(st.daysOverdue, 26);
});
test("does not match a different domain that starts the same", () => {
  assert.equal(matchInvoice("HOSTING | a.com.au", [inv({ reference: "HOSTING | b.com.au" })], r).status, "No Match");
});
test("client fallback is a client match, never automated", () => {
  const m = matchInvoice("HOSTING | z.com", [inv({ reference: "Monthly hosting" })], r, "c1");
  assert.equal(m.status, "Client Match");
  assert.equal(canAutoSuspend({ suspended: false, matchStatus: m.status, billingStatus: "Suspension Eligible", daysOverdue: 30, vip: false, disputed: false, manual: false, autoCheck: true }, { autoSuspend: true, autoSuspendAfterDays: 14 }).ok, false);
});
test("backup codes only when switched on", () => {
  const m = matchInvoice("HOSTING | a.com.au", [inv({ itemCodes: ["AWBSSDP"] })], r);
  assert.equal(m.status, "Reference Match But No Hosting Item");
});
test("notice then eligible after notice period", () => {
  const m = matchInvoice("HOSTING | a.com.au", [inv({})], r);
  assert.equal(billingState({ hasRef: true, match: m, flags: { ...flags, lastNoticeAt: "2026-10-25T00:00:00Z", lastNoticeType: "suspension_warning" }, s, now }).status, "Notice Sent");
  assert.equal(billingState({ hasRef: true, match: m, flags: { ...flags, lastNoticeAt: "2026-10-20T00:00:00Z", lastNoticeType: "suspension_warning" }, s, now }).status, "Suspension Eligible");
});
test("paid after app suspension can auto-unsuspend; others can't", () => {
  const m = matchInvoice("HOSTING | a.com.au", [inv({ status: "paid", amountPaid: 330 })], r);
  const st = billingState({ hasRef: true, match: m, flags: { ...flags, suspended: true, byApp: true, category: "billing_overdue" }, s, now });
  assert.equal(st.status, "Paid After Suspension");
  const a = { suspended: true, byApp: true, category: "billing_overdue", vip: false, disputed: false, manual: false, autoUnsuspend: true, matchStatus: m.status, billingStatus: st.status, amountDue: 0 };
  assert.equal(canAutoUnsuspend(a, true).ok, true);
  assert.equal(canAutoUnsuspend({ ...a, byApp: false }, true).ok, false);
  assert.equal(canAutoUnsuspend({ ...a, matchStatus: "Multiple Matches" }, true).ok, false);
});
test("protection beats everything", () => {
  const m = matchInvoice("HOSTING | a.com.au", [inv({})], r);
  assert.equal(billingState({ hasRef: true, match: m, flags: { ...flags, vip: true }, s, now }).status, "VIP Protected");
  assert.equal(billingState({ hasRef: true, match: m, flags: { ...flags, extensionUntil: "2026-11-05" }, s, now }).status, "Extended");
});
