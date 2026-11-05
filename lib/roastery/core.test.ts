import { test } from "node:test";
import assert from "node:assert/strict";
import { greenFor, lossByCoffee, lossFor, parseRecorderIndex, stockByCoffee } from "./core";

// Bean Culture's weighed 30 kg batches (3 Nov 2026)
const W = [25.8, 25.95, 25.95, 25.95].map((r) => ({ coffee_id: "brazil", green_kg: 30, roasted_kg: r }))
  .concat([25.85, 25.3].map((r) => ({ coffee_id: "png", green_kg: 30, roasted_kg: r })))
  .concat([24.55, 24.8].map((r) => ({ coffee_id: "col", green_kg: 30, roasted_kg: r })));

test("loss per coffee and overall", () => {
  const l = lossByCoffee(W);
  assert.equal(l.coffees.get("brazil")!.lossPct.toFixed(2), "13.62");
  assert.equal(l.coffees.get("png")!.lossPct.toFixed(2), "14.75");
  assert.equal(l.coffees.get("col")!.lossPct.toFixed(2), "17.75");
  assert.equal(l.all!.lossPct.toFixed(2), "14.94");
  assert.equal(lossFor("ethiopia", l)!.own, false);
  assert.equal(lossByCoffee([{ coffee_id: "x", green_kg: 30, roasted_kg: null }]).all, null);
});

test("green needed for roasted", () => {
  const g = greenFor(100, 13.625, 30);
  assert.equal(g.green.toFixed(1), "115.8");
  assert.equal(g.full, 3);
  assert.equal(g.part.toFixed(1), "25.8");
  assert.equal(g.fullBatches, 4);
  assert.equal(greenFor(51.15, 14.75, 30).part, 0);
});

test("stock and value", () => {
  const s = stockByCoffee([
    { coffee_id: "a", kind: "received", kg: 60, cost_per_kg: 10 },
    { coffee_id: "a", kind: "received", kg: 30, cost_per_kg: 13 },
    { coffee_id: "a", kind: "roasted", kg: -30, cost_per_kg: null },
    { coffee_id: "a", kind: "adjusted", kg: -0.5, cost_per_kg: null },
  ]).get("a")!;
  assert.equal(s.onHand, 59.5);
  assert.equal(s.avgCost, 11);
  assert.equal(s.value, 654.5);
});

test("recorder index.csv", () => {
  const csv = 'name,charge,coffee,batch_kg,followed,drop_target_c,dtr_target_pct,charge_bean_c,charge_air_c,turning_point_s,turning_point_bean_c,first_crack_s,first_crack_bean_c,end_s,drop_bean_c,development_s,dtr_pct,auto_burner_changes,end_source,roasted_kg,weight_loss_pct,score,notes,tasted_at,csv\r\n' +
    'W45A_2026-11-03_20.02.11,2026-11-03T20:02:11,,,,,,206.88,,163,94.4,809,,972,,163,16.8,,manual,,,,,,\r\n' +
    'W45A_2026-11-03_20.50.02_PNG_30kg,2026-11-03T20:50:02,PNG,30.0,Plan: median of 2 roasts,210.0,18.6,210.55,207.89,134,99.51,699,195.25,800,211.97,101,12.6,22,manual,25.6,14.7,86,"choc, plum",,x.csv\r\n';
  const p = parseRecorderIndex(csv);
  assert.equal(p.skipped, 1);
  assert.equal(p.rows.length, 1);
  assert.deepEqual([p.rows[0].coffee, p.rows[0].batch_kg, p.rows[0].roasted_kg, p.rows[0].first_crack_s, p.rows[0].notes], ["PNG", 30, 25.6, 699, "choc, plum"]);
  assert.throws(() => parseRecorderIndex("a,b\n1,2"));
});
