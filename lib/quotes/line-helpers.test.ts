import { cleanDetails, servesFromQuantity, servesLine, setupTime, staffLine } from "./line-helpers";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const rule = { service_id: "b", setup_minutes: 30, min_hours: 3, round_to_hours: 0.5, label: "barista" };

// Shaun's example: service 8am–11am, setup 30 min before → 7:30–11 = 3.5 hrs × $75
let r = staffLine({ kind: "staff", start: "08:00", end: "11:00", staff: 1, setup_minutes: 30 }, rule, "barista");
eq("3.5 hrs", r?.quantity, 3.5);
eq("description", r?.description, "Setup 7:30am\nService 8am – 11am");
eq("setup time", setupTime({ start: "08:00", setup_minutes: 30 }), "07:30");
r = staffLine({ kind: "staff", start: "08:00", end: "11:00", staff: 2, setup_minutes: 30 }, rule, "barista");
eq("2 baristas = 7 hrs", r?.quantity, 7);
eq("2 baristas description", r?.description, "Setup 7:30am\nService 8am – 11am\n2 baristas × 3.5 hrs");
r = staffLine({ kind: "staff", start: "09:00", end: "10:00", staff: 1, setup_minutes: 30 }, rule, "barista");
eq("3 hr minimum", r?.quantity, 3);
eq("incomplete times", staffLine({ kind: "staff", start: "08:00", end: null, staff: 1, setup_minutes: 30 }, rule), null);

// Drinks: 200 total → 200 hot; add 50 cold → 250; type hot/cold directly
eq("200 hot", servesLine({ kind: "serves", hot: 200, cold: 0 }, null), { quantity: 200, description: "200 Hot drinks" });
eq("200 hot + 50 cold", servesLine({ kind: "serves", hot: 200, cold: 50 }, "Price includes milk"), { quantity: 250, description: "200 Hot + 50 Cold drinks\n\nPrice includes milk" });
eq("qty typed keeps cold", servesFromQuantity({ kind: "serves", hot: 200, cold: 50 }, 300), { kind: "serves", hot: 250, cold: 50 });
eq("qty below cold", servesFromQuantity({ kind: "serves", hot: 0, cold: 50 }, 20), { kind: "serves", hot: 0, cold: 20 });
eq("clean staff", cleanDetails({ kind: "staff", start: "8:00", end: "11:00", staff: "2", setup_minutes: 30 }), { kind: "staff", start: "08:00", end: "11:00", staff: 2, setup_minutes: 30 });
eq("clean junk", cleanDetails({ kind: "x" }), null);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
