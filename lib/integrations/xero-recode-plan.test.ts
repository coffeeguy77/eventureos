import { cleanRecodeMap, recodeLines, sameExceptAccounts, targetAccount } from "./xero-recode-plan";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const map = cleanRecodeMap({ CartHire: "209", CartSetup: "207", BaristaHire: "211", bad: "not an account!", "": "200" });
eq("clean map", map, { CartHire: "209", CartSetup: "207", BaristaHire: "211" });
eq("target", targetAccount({ ItemCode: "CartHire", AccountCode: "773" }, map), "209");
eq("already right", targetAccount({ ItemCode: "CartHire", AccountCode: "209" }, map), null);
eq("unmapped item", targetAccount({ ItemCode: "eventcoffee", AccountCode: "773" }, map), null);
eq("no item", targetAccount({ AccountCode: "200" }, map), null);
eq("no account ($0 heading) left alone", targetAccount({ ItemCode: "CartHire", AccountCode: null }, map), null);

const lines = [
  { LineItemID: "a", Description: "Coffee Cart Hire", Quantity: 1, UnitAmount: 400, ItemCode: "CartHire", AccountCode: "773", TaxType: "OUTPUT", TaxAmount: 40, LineAmount: 400, Tracking: [] },
  { LineItemID: "b", Description: "Transport", Quantity: 1, UnitAmount: 250, ItemCode: "CartSetup", AccountCode: "776", TaxType: "OUTPUT", TaxAmount: 25, LineAmount: 250 },
  { LineItemID: "c", Description: "Coffees", Quantity: 300, UnitAmount: 3, ItemCode: "eventcoffee", AccountCode: "773", TaxType: "OUTPUT", TaxAmount: 90, LineAmount: 900 },
];
const r = recodeLines(lines, map)!;
eq("changes", r.changes, [{ item: "CartHire", from: "773", to: "209" }, { item: "CartSetup", from: "776", to: "207" }]);
eq("all lines sent back", r.lines.map((l) => l.LineItemID), ["a", "b", "c"]);
eq("only account changed", { ...r.lines[0], AccountCode: "773" }, lines[0]);
eq("unmapped untouched", r.lines[2], lines[2]);
eq("nothing to do", recodeLines([lines[2]], map), null);
let threw = false; try { recodeLines([{ ...lines[0], LineItemID: undefined }], map); } catch { threw = true; }
eq("no line IDs → refuse", threw, true);

const before = { SubTotal: 1550, TotalTax: 155, Total: 1705, LineItems: lines };
eq("verified", sameExceptAccounts(before, { ...before, LineItems: r.lines }, map), null);
eq("total changed", sameExceptAccounts(before, { ...before, Total: 1700, LineItems: r.lines }, map), "totals changed (1705 → 1700)");
eq("wrong account", sameExceptAccounts(before, { ...before, LineItems: lines }, map), `line "Coffee Cart Hire" is on 773, expected 209`);
eq("description changed", sameExceptAccounts(before, { ...before, LineItems: r.lines.map((l, i) => (i === 2 ? { ...l, Description: "x" } : l)) }, map), `line "Coffees" changed`);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
