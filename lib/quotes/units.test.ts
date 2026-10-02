import { pluralUnit, qtyUnit } from "./units";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
eq("1 Day Hire", qtyUnit(1, "Day Hire"), "1 Day Hire");
eq("3 Days Hire", qtyUnit(3, "Day Hire"), "3 Days Hire");
eq("2 Carts", qtyUnit(2, "Cart"), "2 Carts");
eq("1 Event", qtyUnit(1, "Event"), "1 Event");
eq("7 hours", qtyUnit(7, "hour"), "7 hours");
eq("3.5 hours", qtyUnit(3.5, "hour"), "3.5 hours");
eq("each stays", qtyUnit(200, "each"), "200 each");
eq("hrs stays", qtyUnit(4, "hrs"), "4 hrs");
eq("per hour stays", pluralUnit("per hour", 3), "per hour");
eq("party → parties", pluralUnit("party", 2), "parties");
eq("person → people", pluralUnit("Person", 20), "People");
eq("no unit", qtyUnit(5, null), "5");
if (fail) { console.error(`${fail} failed`); process.exit(1); }
