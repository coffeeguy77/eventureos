import { cleanSections, resolveTemplate, templateTotals } from "./templates";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const cart = "11111111-1111-1111-1111-111111111111", del = "22222222-2222-2222-2222-222222222222", bar = "33333333-3333-3333-3333-333333333333", gone = "44444444-4444-4444-4444-444444444444";
const list = [
  { id: cart, name: "Coffee Cart Hire", description: "Cart", unit: "event", unit_price: 400, tax_rate: 10 },
  { id: del, name: "Transport", description: null, unit: "event", unit_price: 250, tax_rate: 10 },
  { id: bar, name: "Barista Hire Per Hour", description: "3 hr min", unit: "hour", unit_price: 75, tax_rate: 10 },
];
const secs = cleanSections([{ title: "Coffee cart", items: [
  { service_id: cart, quantity: 1 }, { service_id: del, quantity: "1" }, { service_id: bar, quantity: 3, description: "Setup 30 min + 2.5 hr service" },
  { name: "Custom signage", unit_price: "50", tax_rate: 10, quantity: 1, optional: true }, { service_id: gone, quantity: 1 }, { name: "", quantity: 1 },
] }, { title: "Empty", items: [] }]);
eq("clean keeps 5 valid lines, drops empty section", [secs.length, secs[0].items.length], [1, 5]);
eq("custom line kept with price", secs[0].items[3], { quantity: 1, name: "Custom signage", unit: null, unit_price: 50, tax_rate: 10, optional: true });
const r = resolveTemplate(secs, list);
eq("missing service reported", r.missing, 1);
eq("lines use price list", r.sections[0].lines.map((l) => [l.name, l.quantity, l.unit_price]), [["Coffee Cart Hire", 1, 400], ["Transport", 1, 250], ["Barista Hire Per Hour", 3, 75], ["Custom signage", 1, 50]]);
eq("description override", r.sections[0].lines[2].description, "Setup 30 min + 2.5 hr service");
eq("totals exclude optional", templateTotals(secs, list), { subtotal: 875, total: 962.5 });
eq("not an array", cleanSections({}), []);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
