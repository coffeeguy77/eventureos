import { test } from "node:test";
import assert from "node:assert/strict";
import { dateRange, datesText, formDays, jobDays, parseDays, withHireDays } from "./days";

const staff = (date: string | null, start = "09:00", end = "13:00") => ({ date, start, end, setup_minutes: 30, units: 1, per_unit: 1 });

test("parseDays: sorted, unique, valid only", () => {
  assert.deepEqual(parseDays([{ date: "2026-10-21", start: "9:00" }, { date: "2026-10-20" }, { date: "2026-10-20" }, { date: "nope" }]), [
    { date: "2026-10-20", setup: null, start: null, finish: null },
    { date: "2026-10-21", setup: null, start: "09:00", finish: null },
  ]);
  assert.deepEqual(parseDays(null), []);
});

test("dateRange: inclusive, refuses backwards and over a month", () => {
  assert.deepEqual(dateRange("2026-10-20", "2026-10-23"), ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.deepEqual(dateRange("2026-10-23", "2026-10-20"), []);
  assert.deepEqual(dateRange("2026-10-01", "2026-12-01"), []);
  assert.deepEqual(dateRange("2026-12-30", "2027-01-02").length, 4);
});

test("jobDays: own days win, gaps filled from the quote's barista hours", () => {
  const ev = { event_date: "2026-10-20", setup_time: null, start_time: null, finish_time: null,
    days: [{ date: "2026-10-20", setup: "07:00", start: "07:30", finish: "12:00" }, { date: "2026-10-21" }] };
  assert.deepEqual(jobDays(ev, [staff("2026-10-21", "10:00", "14:00")]), [
    { date: "2026-10-20", setup: "07:00", start: "07:30", finish: "12:00" },
    { date: "2026-10-21", setup: "09:30", start: "10:00", finish: "14:00" },
  ]);
});

test("jobDays: dated barista hours over several days become the days", () => {
  const ev = { event_date: "2026-10-20", setup_time: null, start_time: null, finish_time: null, days: [] };
  const d = jobDays(ev, ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((x) => staff(x)));
  assert.equal(d.length, 4);
  assert.deepEqual(d[3], { date: "2026-10-23", setup: "08:30", start: "09:00", finish: "13:00" });
});

test("jobDays: one day — the job's times, else the quote's", () => {
  assert.deepEqual(jobDays({ event_date: "2026-10-19", setup_time: null, start_time: "10:00:00", finish_time: null }, [staff(null)]),
    [{ date: "2026-10-19", setup: null, start: "10:00", finish: "13:00" }]);
  assert.deepEqual(jobDays({ event_date: "2026-10-19", setup_time: null, start_time: null, finish_time: null }, [staff(null)]),
    [{ date: "2026-10-19", setup: "08:30", start: "09:00", finish: "13:00" }]);
  assert.deepEqual(jobDays({ event_date: null, setup_time: null, start_time: null, finish_time: null }), []);
});

test("formDays: website hire dates prefill the form", () => {
  const d = formDays({ event_date: "2026-11-14", setup_time: null, start_time: "08:00", finish_time: "12:00", days: [], fleet_dates: ["2026-11-14", "2026-11-15"] });
  assert.deepEqual(d.map((x) => [x.date, x.start]), [["2026-11-14", "08:00"], ["2026-11-15", "08:00"]]);
  assert.deepEqual(formDays({ event_date: "2026-11-14", setup_time: null, start_time: null, finish_time: null, days: [] }), []);
});

test("datesText", () => {
  assert.equal(datesText(["2026-10-21", "2026-10-20", "2026-10-22", "2026-10-23"]), "Tue 20, Wed 21, Thu 22 & Fri 23 October 2026");
  assert.equal(datesText(["2026-10-31", "2026-11-01"]), "Sat 31 October & Sun 1 November 2026");
  assert.equal(datesText(["2026-12-31", "2027-01-01"]), "Thu 31 December 2026 & Fri 1 January 2027");
});

test("withHireDays: multiplies, lists dates, and replaces its own line", () => {
  const four = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((date) => ({ date }));
  const a = withHireDays("Coffee cart with machine and grinder", four);
  assert.equal(a.quantity, 4);
  assert.equal(a.description, "Coffee cart with machine and grinder\n\n4 days hire – Tue 20, Wed 21, Thu 22 & Fri 23 October 2026");
  const b = withHireDays(a.description, four.slice(0, 2).map((d) => ({ ...d, units: 2 })));
  assert.equal(b.quantity, 4);
  assert.equal(b.description, "Coffee cart with machine and grinder\n\n2 days hire – Tue 20 & Wed 21 October 2026");
  // Back to one day: our line comes off and the quantity goes back to 1
  assert.deepEqual(withHireDays(b.description, [{ date: "2026-10-20" }]), { description: "Coffee cart with machine and grinder", quantity: 1 });
  // One day and never touched: leave the quantity alone
  assert.deepEqual(withHireDays("Van", [{ date: "2026-10-20" }]), { description: "Van", quantity: null });
});
