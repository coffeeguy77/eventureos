import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billLines, entryKey, parseImport, totals, type TimeEntry } from "./projects";

const e = (o: Partial<TimeEntry>): TimeEntry => ({ id: "x", work_date: "2026-11-14", start_time: null, end_time: null, hours: 1, work: "w", kind: "ai", source: "commits", by_name: null, billable: true, billed_invoice_id: null, ...o });

test("totals: margin only on AI-recorded time, shown separately", () => {
  const t = totals([e({ hours: 10 }), e({ hours: 2, kind: "staff" }), e({ hours: 5, billable: false })], 50, 120);
  assert.deepEqual([t.ai, t.margin, t.staff, t.hours, t.exGst, t.incGst], [10, 5, 2, 17, 2040, 2244]);
});

test("billLines: build time, margin line, other time", () => {
  const b = billLines([e({ hours: 10, work_date: "2026-10-19" }), e({ hours: 2, kind: "staff", work_date: "2026-11-14" })], { name: "TradeUp", margin_percent: 25, margin_label: "Planning, direction and testing" }, 120, "200");
  assert.deepEqual(b.lines.map((l) => [l.description, l.quantity, l.unit_amount]), [
    ["TradeUp — build time (19 Oct 2026 – 14 Nov 2026)", 10, 132],
    ["TradeUp — planning, direction and testing", 2.5, 132],
    ["TradeUp — other time (19 Oct 2026 – 14 Nov 2026)", 2, 132],
  ]);
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
