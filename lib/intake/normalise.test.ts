import { normaliseIntake } from "./normalise";
let fail = 0;
const c = (n: string, ok: boolean, i?: unknown) => { if (!ok) { fail++; console.log("FAIL", n, JSON.stringify(i)); } else console.log("ok  ", n); };

const good = normaliseIntake({
  external_id: " qs_1 ", external_version: "2", customer: { name: "Sam Lee", email: "Sam@Example.com " },
  event: { date: "2026-12-05", start_time: "2:30 pm", end_time: "18:00", guests: "120" },
  items: [{ section: "Coffee cart", name: "Barista", quantity: "4", unit_price: "$95.00", tax_rate: 10 }, { name: "Travel", unit_price: 40, tax_rate: "0" }],
  totals: { total: "418.00" }, portal_url: "javascript:alert(1)",
});
c("accepts a good payload", good.ok, good);
if (good.ok) {
  const p = good.payload;
  c("trims id, parses version", p.external_id === "qs_1" && p.external_version === 2, p);
  c("lower-cases email", p.customer.email === "sam@example.com", p.customer);
  c("12h time", p.event.start_time === "14:30" && p.event.end_time === "18:00", p.event);
  c("guests number", p.event.guests === 120, p.event);
  c("price strings", p.items[0].unit_price === 95 && p.items[0].quantity === 4, p.items[0]);
  c("defaults qty 1, tax 0 kept", p.items[1].quantity === 1 && p.items[1].tax_rate === 0 && p.items[1].section === null, p.items[1]);
  c("drops non-http portal url", p.portal_url === null);
  c("stage default submitted", p.stage === "submitted");
  c("total parsed", p.totals.total === 418);
}
c("needs external_id", !normaliseIntake({ customer: { name: "A" } }).ok);
c("needs name or email", !normaliseIntake({ external_id: "x", customer: {} }).ok);
c("bad email", !normaliseIntake({ external_id: "x", customer: { email: "nope" } }).ok);
c("bad stage", !normaliseIntake({ external_id: "x", stage: "paid", customer: { name: "A" } }).ok);
c("item needs price", !normaliseIntake({ external_id: "x", customer: { name: "A" }, items: [{ name: "B" }] }).ok);
c("bad date dropped", (() => { const r = normaliseIntake({ external_id: "x", customer: { name: "A" }, event: { date: "2026-02-30" } }); return r.ok && r.payload.event.date === null; })());
c("items not a list", !normaliseIntake({ external_id: "x", customer: { name: "A" }, items: {} }).ok);
if (fail) { console.log(`${fail} failed`); process.exit(1); }
