import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billLines, billedHours, entryKey, fmtSpan, marginFor, splitParts, parseImport, totals, type TimeEntry } from "./projects";

const e = (o: Partial<TimeEntry>): TimeEntry => ({ id: "x", work_date: "2026-11-14", start_time: null, end_time: null, hours: 1, work: "w", kind: "ai", source: "commits", by_name: null, billable: true, billed_invoice_id: null, ...o });

test("totals: AI time multiplied by the client margin, own time as logged", () => {
  const t = totals([e({ hours: 10 }), e({ hours: 2, kind: "staff" }), e({ hours: 5, billable: false })], 150, 120);
  assert.deepEqual([t.ai, t.staff, t.hours, t.exGst], [10, 2, 27, 3240]);
  assert.equal(billedHours(e({ hours: 10 }), 150), 25);
  assert.equal(billedHours(e({ hours: 2.5, billed_hours: 18 }), 150), 18);
});

test("billLines: one line per task with its billed hours", () => {
  const b = billLines([e({ hours: 2, work_date: "2026-11-14", work: "Invoices" }), e({ hours: 1, kind: "staff", work_date: "2026-10-19", work: "Call" })], { name: "TradeUp" }, 50, 120, "200");
  assert.deepEqual(b.lines.map((l) => [l.description, l.quantity, l.unit_amount]), [["19 Oct 2026 — Call", 1, 132], ["14 Nov 2026 — Invoices", 3, 132]]);
});

test("parseImport reads the TradeUp record", () => {
  const p = parseImport(readFileSync(process.env.TRADEUP_JSON ?? "/dev/null", "utf8") || '{"project":{"name":"X"},"time_entries":[{"date":"2026-10-19","start":"0:51","end":"03:06","hours":2.75,"source":"commits","work":"a"}]}');
  assert.ok(p.project.name);
  assert.ok(p.time.length >= 1);
  assert.equal(p.time[0].kind, "ai");
  assert.equal(entryKey(p.time[0]), `${p.time[0].work_date}|${p.time[0].start_time ?? ""}|${p.time[0].hours.toFixed(2)}`);
  assert.throws(() => parseImport("nope"), /Paste the JSON/);
  assert.throws(() => parseImport('{"time_entries":[{"date":"x","hours":2,"work":"a"}]}'), /Time entry 1/);
});

test("marginFor: a draft invoice's override wins over the client margin", () => {
  const m = marginFor(150, new Map([["inv1", 100]]));
  const t = totals([e({ hours: 10, billed_invoice_id: "inv1" }), e({ hours: 10 }), e({ hours: 4, kind: "staff", billed_invoice_id: "inv1" })], m, 120);
  assert.equal(t.hours, 20 + 25 + 4);
});

test("fmtSpan and splitParts", () => {
  assert.equal(fmtSpan("2026-11-14"), "14 Nov 2026");
  assert.equal(fmtSpan("2026-11-12", "2026-11-14"), "12–14 Nov 2026");
  assert.equal(fmtSpan("2026-10-30", "2026-11-02"), "30 Oct – 2 Nov 2026");
  const s = splitParts({ hours: 4.95 }, [{ date: "2026-11-13", billed: 5.57 }, { date: "2026-11-14", billed: 5.57 }]);
  assert.deepEqual(s.map((x) => x.billed), [5.57, 5.57]);
  assert.equal(Math.round((s[0].hours + s[1].hours) * 100) / 100, 4.95);
  assert.throws(() => splitParts({ hours: 1 }, [{ date: "2026-11-13", billed: 1 }]), /at least two/);
});
