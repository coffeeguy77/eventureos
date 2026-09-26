import { priceJob, type PricedService, type PackageRules } from "./engine";
const S = (id: string, price: number, unit = "each"): PricedService => ({ id, code: id, name: id, description: null, unit, unit_price: price, tax_rate: 10 });
const services = [S("CartHire", 400), S("CartSetup", 250), S("BaristaHire", 75, "hour"), S("CartCoffee", 3, "cup"), S("VanHire", 400), S("VanCoffee", 5, "cup")];
const extra = { serves_over: 100, max_service_hours: 3 };
const cart: PackageRules = { hire: { service_id: "CartHire" }, delivery: { service_id: "CartSetup" },
  staff: { service_id: "BaristaHire", setup_minutes: 30, min_hours: 3, round_to_hours: 0.5, label: "barista" }, per_serve: { service_id: "CartCoffee" }, extra_staff: extra };
const van: PackageRules = { hire: { service_id: "VanHire" },
  staff: { service_id: "BaristaHire", included_hours: 1, included_applies_to: "first", round_to_hours: 0.5, label: "barista" }, per_serve: { service_id: "VanCoffee" }, extra_staff: extra };
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// User's van example: 1 hr, 100 coffees = $440 hire + $550 coffee (inc GST)
let r = priceJob(van, services, { start_minutes: 600, end_minutes: 660, serves: 100, staff_count: 1 });
eq("van 1h subtotal", r.subtotal, 900); eq("van 1h total", r.total, 990); eq("van 1h no staff line", r.lines.some((l) => l.kind === "staff"), false);
// Van 3 h: 2 paid hours
r = priceJob(van, services, { start_minutes: 600, end_minutes: 780, serves: 100, staff_count: 1 });
eq("van 3h staff hrs", r.paid_staff_hours, 2);
// User's cart example: hire + delivery + 3 hrs barista + 100 × $3
r = priceJob(cart, services, { start_minutes: 600, end_minutes: 750, serves: 100, staff_count: 1 });
eq("cart 2.5h subtotal", r.subtotal, 400 + 250 + 225 + 300); eq("cart total inc GST", r.total, 1292.5);
// Short cart job hits the 3 h minimum
r = priceJob(cart, services, { start_minutes: 600, end_minutes: 660, serves: 50, staff_count: 1 });
eq("cart min 3h", r.paid_staff_hours, 3);
// NPC: 8–11am, 200 coffees → 2 baristas suggested; 2 × 3.5 h
r = priceJob(cart, services, { start_minutes: 480, end_minutes: 660, serves: 200, staff_count: 1 });
eq("npc suggests 2", r.suggested_staff, 2); eq("npc note", r.notes.length, 1);
r = priceJob(cart, services, { start_minutes: 480, end_minutes: 660, serves: 200, staff_count: 2 });
eq("npc 2 baristas hrs", r.paid_staff_hours, 7); eq("npc subtotal", r.subtotal, 400 + 250 + 525 + 600);
// All-day 200 coffees → 1 barista fine
r = priceJob(cart, services, { start_minutes: 480, end_minutes: 960, serves: 200, staff_count: 1 });
eq("all day 1 barista", r.suggested_staff, 1); eq("all day hrs", r.paid_staff_hours, 8.5);
// Rounding up to half hours: 3h40 service + 30 min = 4h10 → 4.5
r = priceJob(cart, services, { start_minutes: 600, end_minutes: 820, serves: 0, staff_count: 1 });
eq("cart 4h10 → 4.5h", r.paid_staff_hours, 4.5);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
