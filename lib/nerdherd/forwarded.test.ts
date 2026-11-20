import { test } from "node:test";
import assert from "node:assert/strict";
import { parseForwarded } from "./forwarded";

test("Gmail forward", () => {
  const f = parseForwarded("Can you look at this one?\n\n---------- Forwarded message ---------\nFrom: Jane Smith <jane@smithplumbing.com.au>\nDate: Mon, 3 Nov 2026 at 09:14\nSubject: Website contact form not working\nTo: Jay <jay@canberraweb.com.au>\n\n\nHi Jay,\nOur contact form stopped sending.\nThanks", "Fwd: Website contact form not working")!;
  assert.equal(f.fromEmail, "jane@smithplumbing.com.au"); assert.equal(f.fromName, "Jane Smith");
  assert.equal(f.subject, "Website contact form not working"); assert.match(f.body, /^Hi Jay,\nOur contact form/);
  assert.equal(f.note, "Can you look at this one?");
});
test("Outlook forward without a marker", () => {
  const f = parseForwarded("\nFrom: Bob Lee <bob@lee.com>\nSent: Monday, 3 November 2026 9:14 AM\nTo: Jay <jay@canberraweb.com.au>\nSubject: SSL expired\n\nThe padlock is gone.", "FW: SSL expired")!;
  assert.equal(f.fromEmail, "bob@lee.com"); assert.equal(f.subject, "SSL expired"); assert.equal(f.body, "The padlock is gone.");
});
test("Apple Mail forward, address only", () => {
  const f = parseForwarded("Begin forwarded message:\n\nFrom: sue@x.org\nSubject: Email down\nDate: 2 November 2026\nTo: jay@canberraweb.com.au\n\nCan't send email.", "Fwd: Email down")!;
  assert.equal(f.fromEmail, "sue@x.org"); assert.equal(f.fromName, null); assert.equal(f.body, "Can't send email.");
});
test("not a forward", () => { assert.equal(parseForwarded("Hi, just a normal email", "Hello"), null); });
