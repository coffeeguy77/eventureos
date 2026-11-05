import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSite, nerdJobTicket } from "./nerd-jobs";

test("cleanSite strips scheme, www and path", () => {
  assert.equal(cleanSite("https://www.LockDoctor.com.au/contact"), "lockdoctor.com.au");
  assert.equal(cleanSite("lockdoctor.com.au"), "lockdoctor.com.au");
  assert.equal(cleanSite("their old shop site"), "their old shop site");
});

test("nerdJobTicket builds subject and note", () => {
  const t = nerdJobTicket({ job: "delete_site", site: "www.example.com.au", reason: "Client has gone / business closed", note: "Spoke to Donald", title: "", by: "Rob", customer: "Lock Doctor" });
  assert.equal(t.subject, "Delete website: example.com.au");
  assert.match(t.note, /raised by Rob from Accounts for Lock Doctor/);
  assert.match(t.note, /Reason: Client has gone/);
  assert.match(t.note, /Notes: Spoke to Donald/);
  assert.equal(nerdJobTicket({ job: "other", site: "x.com", reason: "", note: "", title: "Change their email password", by: "Rob", customer: "A" }).subject, "Change their email password");
});
