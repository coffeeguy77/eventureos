import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketAlertRecipients as who } from "./alert-rules";

const SHAUN = "shaun", FEI = "fei", ROB = "rob";
const base = { defaultAssignee: FEI, quiet: [ROB] };

test("Shaun creates a ticket and assigns nobody: only Shaun (and not while he's the one doing it)", () => {
  assert.deepEqual(who({ ...base, assignees: [], createdBy: SHAUN, source: "manual" }), [SHAUN]);
  assert.deepEqual(who({ ...base, assignees: [], createdBy: SHAUN, source: "manual", actor: SHAUN }), []);
});
test("Shaun assigns a ticket to Fei: only Fei, not Shaun", () => {
  assert.deepEqual(who({ ...base, assignees: [FEI], createdBy: SHAUN, source: "manual", actor: SHAUN }), [FEI]);
});
test("Fei assigns a ticket: only Fei", () => {
  assert.deepEqual(who({ ...base, assignees: [FEI], createdBy: FEI, source: "manual" }), [FEI]);
});
test("Rob creates a ticket: goes to Fei (the default), never Rob", () => {
  assert.deepEqual(who({ ...base, assignees: [], createdBy: ROB, source: "manual", actor: ROB }), [FEI]);
  assert.deepEqual(who({ ...base, assignees: [ROB], createdBy: ROB, source: "manual" }), []);
});
test("A ticket from an email: the default person only", () => {
  assert.deepEqual(who({ ...base, assignees: [], createdBy: null, source: "email" }), [FEI]);
});
test("Shaun only hears about tickets assigned to him", () => {
  assert.deepEqual(who({ ...base, assignees: [SHAUN], createdBy: FEI, source: "manual", actor: FEI }), [SHAUN]);
  assert.ok(!who({ ...base, assignees: [], createdBy: null, source: "email" }).includes(SHAUN));
});
test("no default set: an unassigned email ticket emails nobody", () => {
  assert.deepEqual(who({ assignees: [], createdBy: null, source: "email", defaultAssignee: null, quiet: [] }), []);
});
