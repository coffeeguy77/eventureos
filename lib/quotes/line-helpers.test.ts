import { cleanDetails, longDay, nextShiftDay, servesFromQuantity, servesLine, setupTime, shiftDays, staffLine, type StaffDetails } from "./line-helpers";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const rule = { service_id: "b", setup_minutes: 30, min_hours: 3, round_to_hours: 0.5, label: "barista" };
const day = (o: Partial<StaffDetails["days"][number]>) => ({ date: null, start: "08:00", end: "11:00", setup_minutes: 30, units: 1, per_unit: 1, ...o });

// Single day (Shaun's example): service 8am–11am, setup 30 min before → 3.5 hrs
let r = staffLine({ kind: "staff", days: [day({})] }, rule, "barista");
eq("3.5 hrs", r?.quantity, 3.5);
eq("single-day description", r?.description, "Setup 7:30am\nService 8am – 11am");
r = staffLine({ kind: "staff", days: [day({ per_unit: 2 })] }, rule, "barista");
eq("2 baristas = 7 hrs", r?.quantity, 7);
eq("2 baristas description", r?.description, "Setup 7:30am\nService 8am – 11am\n2 baristas × 3.5 hrs");
eq("3 hr minimum", staffLine({ kind: "staff", days: [day({ start: "09:00", end: "10:00" })] }, rule)?.quantity, 3);
eq("incomplete", staffLine({ kind: "staff", days: [day({ end: null })] }, rule), null);
eq("legacy single-day shape", staffLine({ kind: "staff", start: "08:00", end: "11:00", staff: 2, setup_minutes: 30, days: [] }, rule, "barista")?.quantity, 7);
eq("setup time", setupTime({ start: "08:00", setup_minutes: 30 }), "07:30");

// QU-0489: 3 days, 2 carts — Mon 1/cart, Tue & Wed 2/cart = 19 + 38 + 34 = 91 hrs
const qu: StaffDetails = { kind: "staff", unit_label: "cart", days: [
  day({ date: "2025-11-24", start: "07:30", end: "16:30", setup_minutes: 30, units: 2, per_unit: 1 }),
  day({ date: "2025-11-25", start: "07:30", end: "16:30", setup_minutes: 30, units: 2, per_unit: 2 }),
  day({ date: "2025-11-26", start: "07:00", end: "15:00", setup_minutes: 30, units: 2, per_unit: 2 }),
] };
r = staffLine(qu, rule, "barista");
eq("QU-0489 total 91 hrs", r?.quantity, 91);
eq("QU-0489 day 1 block", r?.description.split("\n\n")[0], "Monday 24th November – 9.5hrs x2 (19hrs)\nSetup 7am\nService 7:30am – 4:30pm – 1 barista / per cart");
eq("QU-0489 day 3 block", r?.description.split("\n\n")[2], "Wednesday 26th November – 8.5hrs x4 (34hrs)\nSetup 6:30am\nService 7am – 3pm – 2 baristas / per cart");

// Adding days: dated → next date (from the last day, even if overridden); undated → Day N
eq("next after 11.11", nextShiftDay([day({ date: "2026-11-11" })]).date, "2026-11-12");
eq("next after override 11.13", nextShiftDay([day({ date: "2026-11-11" }), day({ date: "2026-11-13" })]).date, "2026-11-14");
eq("undated stays undated", nextShiftDay([day({})]).date, null);
eq("copies hours", nextShiftDay([day({ start: "06:00", end: "14:00", per_unit: 3 })]), day({ start: "06:00", end: "14:00", per_unit: 3 }));
r = staffLine({ kind: "staff", days: [day({}), day({ start: "09:00", end: "12:00" })] }, rule, "barista");
eq("undated multi-day labels", r?.description, "Day 1 – 3.5hrs\nSetup 7:30am\nService 8am – 11am\n\nDay 2 – 3.5hrs\nSetup 8:30am\nService 9am – 12pm");
eq("long day", longDay("2026-11-11"), "Wednesday 11th November");
eq("legacy → days", shiftDays({ kind: "staff", start: "08:00", end: "11:00", staff: 2, setup_minutes: 30, days: [] }).length, 1);

// Drinks
eq("200 hot", servesLine({ kind: "serves", hot: 200, cold: 0 }, null), { quantity: 200, description: "200 Hot drinks" });
eq("200 hot + 50 cold", servesLine({ kind: "serves", hot: 200, cold: 50 }, "Price includes milk"), { quantity: 250, description: "200 Hot + 50 Cold drinks\n\nPrice includes milk" });
eq("qty typed keeps cold", servesFromQuantity({ kind: "serves", hot: 200, cold: 50 }, 300), { kind: "serves", hot: 250, cold: 50 });
eq("clean legacy staff → days", cleanDetails({ kind: "staff", start: "8:00", end: "11:00", staff: "2", setup_minutes: 30 }),
  { kind: "staff", days: [{ date: null, start: "08:00", end: "11:00", setup_minutes: 30, units: 1, per_unit: 2 }] });
eq("clean junk", cleanDetails({ kind: "x" }), null);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
