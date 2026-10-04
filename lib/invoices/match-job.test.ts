import { test } from "node:test";
import assert from "node:assert/strict";
import { matchInvoiceToJob, mentionsDate, rankForJob } from "./match-job";

test("names the date in the usual ways", () => {
  const d = "2026-11-07";
  for (const s of ["Stromlo Forest Anglican College on Saturday 7 November 10am-1pm", "Sat 7th Nov", "7th of November 2026", "November 7", "Nov. 7th, 2026",
    "Event 7/11", "07/11/2026", "7.11.26", "on 2026-11-07"]) assert.equal(mentionsDate(s, d), true, s);
});

test("doesn't match other dates", () => {
  const d = "2026-11-07";
  for (const s of ["17 November", "27/11", "7 December", "November 17", "Nov 70", "17/11/2026", "7/1", "$5 - 6oz", "Coffee Van Call Out", "2026-11-17"]) assert.equal(mentionsDate(s, d), false, s);
});

test("links only when exactly one of the client's jobs is named", () => {
  const inv = { id: "i", customer_id: "c", issue_date: "2026-08-17", reference: null, line_items: [{ description: "Coffee Van Call Out\nStromlo on Saturday 7 November 10am-1pm" }] };
  assert.equal(matchInvoiceToJob(inv, [{ id: "a", customer_id: "c", event_date: "2026-11-07" }, { id: "b", customer_id: "c", event_date: "2026-12-05" }]), "a");
  assert.equal(matchInvoiceToJob(inv, [{ id: "a", customer_id: "other", event_date: "2026-11-07" }]), null);
  assert.equal(matchInvoiceToJob(inv, [{ id: "a", customer_id: "c", event_date: "2026-11-07" }, { id: "b", customer_id: "c", event_date: "2026-11-07" }]), null);
});

test("ranks the invoice naming the job's date first", () => {
  const job = { id: "j", customer_id: "c", event_date: "2026-11-07" };
  const r = rankForJob(job, [
    { id: "new", customer_id: "c", issue_date: "2026-09-01", reference: null, line_items: [{ description: "Coffee" }] },
    { id: "match", customer_id: "c", issue_date: "2026-08-17", reference: null, line_items: [{ description: "Saturday 7 November" }] },
  ]);
  assert.deepEqual(r.map((x) => x.id), ["match", "new"]);
  assert.equal(r[0].namesDate, true);
});
