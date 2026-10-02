import { isFreeDay, jobDescription, jobTitle, shortTime, weekday } from "./job-invite";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

eq("9am", shortTime("09:00:00"), "9am");
eq("9:30am", shortTime("09:30"), "9:30am");
eq("12pm", shortTime("12:00"), "12pm");
eq("midnight", shortTime("00:15"), "12:15am");
eq("bad", shortTime("x"), null);

const base = { label: "Coffee Cart", eventName: "Birthday Party", customer: { name: "Kieran Pender", company: null, kind: "individual" },
  date: "2026-10-31", setupTime: "09:00:00", startTime: "09:30:00", finishTime: "12:00:00", serves: 100, servesLabel: "coffees", staffLabel: "barista", venue: null, address: null };
eq("title person", jobTitle(base), "Coffee Cart | Kieran Pender");
eq("title company", jobTitle({ ...base, customer: { name: "Tashi", company: "Press Club", kind: "company" } }), "Coffee Cart | Press Club");
eq("title fallback", jobTitle({ ...base, label: null }), "Birthday Party | Kieran Pender");
eq("description", jobDescription(base), "Setup 9am\nService 9:30am – 12pm\n100 coffees");
eq("description venue + 2 staff", jobDescription({ ...base, setupTime: null, staffCount: 2, venue: "Press Club", address: "1 Main St" }),
  "Service 9:30am – 12pm\n100 coffees\n2 baristas\n\nPress Club\n1 Main St");
eq("generic labels", jobDescription({ ...base, servesLabel: null, staffLabel: null, staffCount: 3, setupTime: null }), "Service 9:30am – 12pm\n100 serves\n3 staff");
eq("saturday", weekday("2026-10-31"), 6);
eq("free on saturday", isFreeDay("2026-10-31", [6]), true);
eq("busy on tuesday", isFreeDay("2026-10-13", [6]), false);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
