import { clashes, fmtHours, jobShift, plannedShift, shiftPay } from "./shifts";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const ev = { event_date: "2026-10-17", setup_time: "08:30:00", start_time: "09:00:00", finish_time: "12:00:00" };
eq("setup to finish", plannedShift(ev), { start: "08:30", finish: "12:00", hours: 3.5 });
eq("no setup → start", plannedShift({ ...ev, setup_time: null }).hours, 3);
eq("past midnight", plannedShift({ ...ev, setup_time: "21:00", finish_time: "01:00" }).hours, 4);
eq("missing finish", plannedShift({ ...ev, finish_time: null }).hours, null);
eq("pay at org rate", shiftPay({ event: ev, orgRate: 30 }), { base: 3.5, extra: 0, hours: 3.5, rate: 30, amount: 105 });
eq("person rate + approved extra", shiftPay({ event: ev, orgRate: 30, memberRate: 32, approvedExtra: 1 }).amount, 144);
eq("shift override wins", shiftPay({ event: ev, orgRate: 30, memberRate: 32, rateOverride: 40, hoursOverride: 5 }).amount, 200);
eq("clash same day overlapping", clashes(ev, { event_date: "2026-10-17", setup_time: "11:00", start_time: null, finish_time: "14:00" }), true);
eq("no clash back to back", clashes(ev, { event_date: "2026-10-17", setup_time: "12:00", start_time: null, finish_time: "14:00" }), false);
eq("different day", clashes(ev, { ...ev, event_date: "2026-10-18" }), false);
eq("hours label", [fmtHours(3.5), fmtHours(1), fmtHours(4)], ["3.5 hrs", "1 hr", "4 hrs"]);
eq("3 hour minimum tops up a short shift", shiftPay({ event: { ...ev, setup_time: "09:00", finish_time: "11:00" }, orgRate: 30, minHours: 3 }).hours, 3);
eq("minimum doesn't shorten a long shift", shiftPay({ event: ev, orgRate: 30, minHours: 3 }).hours, 3.5);
eq("office override beats the minimum", shiftPay({ event: ev, orgRate: 30, minHours: 3, hoursOverride: 2 }).hours, 2);

// Josh's job: Thu 9am–1pm, Fri 9am–4:30pm, 30 min setup, 2 hrs driving each way
const josh = jobShift([{ date: "2026-10-22", setup: "08:30", start: "09:00", finish: "13:00" }, { date: "2026-10-23", setup: "08:30", start: "09:00", finish: "16:30" }], 120);
eq("travel shift days", josh.days, [{ date: "2026-10-22", start: "06:30", finish: "15:00", hours: 8.5 }, { date: "2026-10-23", start: "06:30", finish: "18:30", hours: 12 }]);
eq("travel shift total", josh.hours, 20.5);
eq("travel shift pay", shiftPay({ event: ev, orgRate: 30, minHours: 3, plan: josh }).hours, 20.5);
eq("min applies per day", jobShift([{ date: "2026-10-22", setup: null, start: "09:00", finish: "10:00" }, { date: "2026-10-23", setup: null, start: "09:00", finish: "10:00" }]).paidHours(3), 6);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
