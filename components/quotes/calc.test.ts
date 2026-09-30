// Mirrors build_quote_snapshot — expected values taken from the database (migration 0037) for the same inputs.
import { lineTotal, quoteTotals } from "./calc";
let fail = 0;
const c = (n: string, ok: boolean, i?: unknown) => { if (!ok) { fail++; console.log("FAIL", n, i ?? ""); } else console.log("ok  ", n); };
const items = [
  { section_id: "s", quantity: 100, unit_price: 0, discount_percent: 0, discount_amount: 0, tax_rate: 10, is_optional: false },
  { section_id: "s", quantity: 3, unit_price: 75, discount_percent: 0, discount_amount: 0, tax_rate: 10, is_optional: false },
  { section_id: "s", quantity: 1, unit_price: 250, discount_percent: 0, discount_amount: 0, tax_rate: 10, is_optional: false },
  { section_id: "s", quantity: 1, unit_price: 400, discount_percent: 0, discount_amount: 25.5, tax_rate: 10, is_optional: false },
];
c("dollar line discount", lineTotal(items[3]) === 374.5);
const t = quoteTotals(items, new Set(), { type: "percent", value: 12.5 });
c("lines subtotal", t.linesSubtotal === 849.5, t);
c("quote discount 12.5%", t.quoteDiscount === 106.19, t);
c("subtotal", t.subtotal === 743.31, t);
c("gst", t.tax === 74.33, t);
c("total", t.total === 817.64, t);
const none = quoteTotals(items, new Set());
c("no quote discount", none.total === 934.45 && none.quoteDiscount === 0, none);
const amt = quoteTotals(items, new Set(), { type: "amount", value: 50 });
c("$50 off", amt.subtotal === 799.5 && amt.tax === 79.95 && amt.total === 879.45, amt);
c("amount capped at subtotal", quoteTotals(items, new Set(), { type: "amount", value: 5000 }).total === 0);
c("line discount can't go negative", lineTotal({ quantity: 1, unit_price: 20, discount_percent: 0, discount_amount: 50 }) === 0);
c("negative (credit) line unaffected by $", lineTotal({ quantity: 1, unit_price: -20, discount_percent: 0, discount_amount: 5 }) === -20);
if (fail) process.exit(1);
