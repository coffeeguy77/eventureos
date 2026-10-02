import { revenueByStream, streamFor, streamPeriods } from "./streams";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const map = { CartHire: "209", CartSetup: "207", eventcoffee: "212" };
const streams = new Set(Object.values(map));
eq("mapped item → its account", streamFor({ item_code: "CartHire", account_code: "773" }, map, streams), "209");
eq("hand-coded line on a stream account counts", streamFor({ item_code: null, account_code: "209" }, map, streams), "209");
eq("other lines ignored", streamFor({ item_code: "Misc", account_code: "200" }, map, streams), null);

const inv = (id: string, status: string, date: string, subtotal: number, lines: object[]) => ({ id, status, issue_date: date, subtotal, line_items: lines as never });
const invoices = [
  inv("a", "paid", "2026-07-29", 1550, [
    { item_code: "CartHire", account_code: "773", quantity: 1, line_amount: 400 },
    { item_code: "CartSetup", account_code: "776", quantity: 1, line_amount: 250 },
    { item_code: "eventcoffee", account_code: "773", quantity: 300, line_amount: 900 },
  ]),
  // GST-inclusive invoice: lines add to 1100 but the ex-GST subtotal is 1000
  inv("b", "overdue", "2025-03-01", 1000, [{ item_code: "CartHire", account_code: "773", quantity: 2, line_amount: 1100 }]),
  inv("c", "void", "2026-08-01", 400, [{ item_code: "CartHire", account_code: "773", quantity: 1, line_amount: 400 }]),
  inv("d", "draft", "2026-08-01", 400, [{ item_code: "CartHire", account_code: "773", quantity: 1, line_amount: 400 }]),
];
eq("all time", revenueByStream(invoices, map, { from: null, to: null }), [
  { account: "209", amount: 1400, units: 3, invoices: 2 },
  { account: "212", amount: 900, units: 300, invoices: 1 },
  { account: "207", amount: 250, units: 1, invoices: 1 },
]);
eq("period filter", revenueByStream(invoices, map, { from: "2026-07-01", to: "2026-10-03" }).map((r) => [r.account, r.amount]), [["212", 900], ["209", 400], ["207", 250]]);

const p = streamPeriods("2026-10-03");
eq("FY26/27", p[1], { key: "fy", label: "This year (FY27)", from: "2026-07-01", to: "2026-10-03" });
eq("last FY", p[2], { key: "lastfy", label: "Last year (FY26)", from: "2025-07-01", to: "2026-06-30" });
eq("12 months", p[3].from, "2025-10-04");
eq("before July", streamPeriods("2026-03-15")[1].from, "2025-07-01");
eq("calendar-year business", streamPeriods("2026-03-15", 1)[1], { key: "fy", label: "This year (2026)", from: "2026-01-01", to: "2026-03-15" });
if (fail) { console.error(`${fail} failed`); process.exit(1); }
