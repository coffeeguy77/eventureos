import { seriesDates, weekdayOf } from "./series";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
eq("weekday of 2026-10-08 is Thursday", weekdayOf("2026-10-08"), 4);
eq("every Thursday", seriesDates({ weekday: 4, every_weeks: 1, starts_on: "2026-10-03", ends_on: null }, "2026-10-01", "2026-10-31"), ["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
eq("fortnightly keeps its rhythm from the start", seriesDates({ weekday: 4, every_weeks: 2, starts_on: "2026-10-08", ends_on: null }, "2026-10-20", "2026-11-30"), ["2026-10-22", "2026-11-05", "2026-11-19"]);
eq("ends", seriesDates({ weekday: 4, every_weeks: 1, starts_on: "2026-10-08", ends_on: "2026-10-16" }, "2026-10-01", "2026-12-31"), ["2026-10-08", "2026-10-15"]);
eq("starts on the day itself", seriesDates({ weekday: 4, every_weeks: 1, starts_on: "2026-10-08", ends_on: null }, "2026-10-08", "2026-10-08"), ["2026-10-08"]);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
