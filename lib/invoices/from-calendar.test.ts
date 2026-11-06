import { test } from "node:test";
import assert from "node:assert/strict";
import { nameFromEmail, plainText, readNotes, toTime } from "./from-calendar";

test("reads the usual event notes", () => {
  const d = readNotes("Debbie 0439 606 644\n\nSetup: 6:30am\nService 7:00am to 4.00pm. \n200 coffees\n25 Tea");
  assert.deepEqual(d, { phones: ["0439606644"], coffees: 200, setup: "06:30", serviceStart: "07:00", serviceFinish: "16:00" });
  assert.equal(readNotes("Service 8 - 3").serviceFinish, "15:00");
  assert.equal(readNotes("nothing here").coffees, null);
});

test("html notes, times, names", () => {
  assert.equal(plainText("<p>ANU</p><p><br></p><p>205 coffees<u></u></p>"), "ANU\n\n205 coffees");
  assert.equal(toTime("7.30pm"), "19:30");
  assert.equal(nameFromEmail("debbie.kaczor@act.gov.au"), "Debbie Kaczor");
  assert.equal(nameFromEmail("functions@npc.org.au"), null);
});

import { incLineFromEx } from "./lines";
test("exact GST on prices like $2.25", () => {
  const l = incLineFromEx("Coffees", 200, 2.25);
  assert.equal(l.quantity, 1);
  assert.equal(l.unit_amount, 495);
  assert.equal(incLineFromEx("Cart", 2, 400).unit_amount, 440);
});
