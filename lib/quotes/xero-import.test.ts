import { xeroLinesToQuoteLines } from "./xero-import";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const price = [
  { id: "b", code: "BaristaHire", name: "Barista Hire Per Hour", unit: "hour", tax_rate: 10 },
  { id: "c", code: "eventcoffee", name: "Coffee Individual", unit: "cup", tax_rate: 10 },
];
// QU-0515 (FlatRock): van call-out isn't on the price list any more, barista + coffees are
const out = xeroLinesToQuoteLines([
  { item_code: "Coffee-Van-Call-Out", description: "Coffee Van Call Out", quantity: 1, unit_amount: 400 },
  { item_code: "BaristaHire", description: "Barista Hire\n\n1HR Travel\nSetup 8:30am\nService 9am - 12pm", quantity: 4.5, unit_amount: 75 },
  { item_code: "eventcoffee", description: "$4\n\nPrice includes milk", quantity: 200, unit_amount: 4 },
  { item_code: null, description: "", quantity: 0, unit_amount: 0 },
  { item_code: null, description: "Notes:\nPower needed", quantity: 0, unit_amount: 0 },
], price);
eq("one-off line keeps its price", out[0], { service_id: null, name: "Coffee Van Call Out", description: null, quantity: 1, unit: null, unit_price: 400, tax_rate: 10 });
eq("linked to price list, Xero price kept", { id: out[1].service_id, name: out[1].name, qty: out[1].quantity, price: out[1].unit_price, unit: out[1].unit }, { id: "b", name: "Barista Hire Per Hour", qty: 4.5, price: 75, unit: "hour" });
eq("description without repeated name", out[1].description, "Barista Hire\n\n1HR Travel\nSetup 8:30am\nService 9am - 12pm");
eq("special price kept", out[2].unit_price, 4);
eq("empty line dropped, note kept", out.length, 4);
eq("note line", { name: out[3].name, desc: out[3].description, qty: out[3].quantity }, { name: "Notes:", desc: "Power needed", qty: 0 });
eq("name repeated in description is removed", xeroLinesToQuoteLines([{ item_code: "eventcoffee", description: "Coffee Individual\nPrice includes milk", quantity: 10, unit_amount: 3 }], price)[0].description, "Price includes milk");
if (fail) { console.error(`${fail} failed`); process.exit(1); }
