import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, applyAutomatically, type Snapshot } from "./guard";

const snap = (): Snapshot => ({
  campaigns: [
    { resource: "customers/1/campaigns/10", id: "10", name: "Weddings", status: "ENABLED", budget: "customers/1/campaignBudgets/100", dailyBudget: 20, shared: false },
    { resource: "customers/1/campaigns/11", id: "11", name: "Corporate", status: "ENABLED", budget: "customers/1/campaignBudgets/101", dailyBudget: 10, shared: false },
    { resource: "customers/1/campaigns/12", id: "12", name: "Old", status: "PAUSED", budget: "customers/1/campaignBudgets/102", dailyBudget: 50, shared: false },
  ],
  keywords: [
    { resource: "kw1", text: "coffee cart hire", match: "PHRASE", status: "ENABLED", adGroup: "ag1", campaign: "customers/1/campaigns/10", campaignName: "Weddings", adGroupName: "Carts", cpc: 2, conversions: 3, cost: 50, clicks: 40 },
    { resource: "kw2", text: "free coffee", match: "BROAD", status: "ENABLED", adGroup: "ag1", campaign: "customers/1/campaigns/10", campaignName: "Weddings", adGroupName: "Carts", cpc: 1.5, conversions: 0, cost: 30, clicks: 25 },
    { resource: "kw3", text: "barista", match: "BROAD", status: "ENABLED", adGroup: "ag2", campaign: "customers/1/campaigns/11", campaignName: "Corporate", adGroupName: "Solo", cpc: null, conversions: 0, cost: 12, clicks: 9 },
  ],
  negatives: [{ campaign: "customers/1/campaigns/10", text: "jobs", match: "PHRASE" }],
  monthSpend: 300,
});
const lim = { monthlyCap: 1000, maxChanges: 10, mode: "auto" as const };

test("budget within 20% and under the cap is allowed", () => {
  const [d] = decide([{ kind: "set_budget", target: "customers/1/campaignBudgets/100", value: 22, reason: "converting well" }], snap(), lim);
  assert.equal(d.ok, true);
  assert.deepEqual(d.after, { daily: 22 });
});

test("budget step over 20% is blocked", () => {
  const [d] = decide([{ kind: "set_budget", target: "customers/1/campaignBudgets/100", value: 30, reason: "x" }], snap(), lim);
  assert.equal(d.ok, false);
});

test("budgets can't add up past the monthly cap (paused campaigns don't count)", () => {
  // (20+10)*30.4 = 912; raising 101 from 10 to 12 → 973.6 ok; then 100 from 20 to 22 → 1034.4 over
  const ds = decide([
    { kind: "set_budget", target: "customers/1/campaignBudgets/101", value: 12, reason: "x" },
    { kind: "set_budget", target: "customers/1/campaignBudgets/100", value: 22, reason: "x" },
  ], snap(), lim);
  assert.equal(ds[0].ok, true);
  assert.equal(ds[1].ok, false);
  assert.match(ds[1].why!, /cap/);
});

test("no cap: budgets can't go up, but can go down", () => {
  const ds = decide([
    { kind: "set_budget", target: "customers/1/campaignBudgets/100", value: 22, reason: "x" },
    { kind: "set_budget", target: "customers/1/campaignBudgets/101", value: 9, reason: "x" },
  ], snap(), { ...lim, monthlyCap: null });
  assert.equal(ds[0].ok, false);
  assert.equal(ds[1].ok, true);
});

test("cap reached this month: only decreases", () => {
  const s = snap(); s.monthSpend = 1000;
  const ds = decide([
    { kind: "set_budget", target: "customers/1/campaignBudgets/100", value: 21, reason: "x" },
    { kind: "set_keyword_bid", target: "kw2", value: 1.6, reason: "x" },
    { kind: "set_keyword_bid", target: "kw2", value: 1.4, reason: "y" },
  ], s, lim);
  assert.equal(ds[0].ok, false);
  assert.equal(ds[1].ok, false);
});

test("paused campaign's budget can't be changed", () => {
  const [d] = decide([{ kind: "set_budget", target: "customers/1/campaignBudgets/102", value: 45, reason: "x" }], snap(), lim);
  assert.equal(d.ok, false);
});

test("converting keywords are never paused; last keyword in an ad group isn't paused", () => {
  const ds = decide([
    { kind: "pause_keyword", target: "kw1", reason: "x" },
    { kind: "pause_keyword", target: "kw3", reason: "x" },
    { kind: "pause_keyword", target: "kw2", reason: "wasted spend" },
  ], snap(), lim);
  assert.deepEqual(ds.map((d) => d.ok), [false, false, true]);
});

test("bids: ±25%, not under $0.10, not for automated bidding", () => {
  const ds = decide([
    { kind: "set_keyword_bid", target: "kw2", value: 1.8, reason: "x" },
    { kind: "set_keyword_bid", target: "kw1", value: 2.4, reason: "x" },
    { kind: "set_keyword_bid", target: "kw3", value: 1, reason: "x" },
  ], snap(), lim);
  assert.deepEqual(ds.map((d) => d.ok), [true, true, false]);
  assert.equal(decide([{ kind: "set_keyword_bid", target: "kw2", value: 2, reason: "x" }], snap(), lim)[0].ok, false);
});

test("negatives: not duplicates, never blocking a converting keyword", () => {
  const ds = decide([
    { kind: "add_negative", target: "customers/1/campaigns/10", text: "jobs", match: "PHRASE", reason: "x" },
    { kind: "add_negative", target: "customers/1/campaigns/10", text: "cart", match: "PHRASE", reason: "x" },
    { kind: "add_negative", target: "customers/1/campaigns/10", text: "free", match: "PHRASE", reason: "x" },
    { kind: "add_negative", target: "customers/1/campaigns/99", text: "x", match: "EXACT", reason: "x" },
  ], snap(), lim);
  assert.deepEqual(ds.map((d) => d.ok), [false, false, true, false]);
});

test("max changes per run and unknown kinds", () => {
  const ds = decide([
    { kind: "add_negative", target: "customers/1/campaigns/10", text: "free", match: "EXACT", reason: "x" },
    { kind: "add_negative", target: "customers/1/campaigns/10", text: "diy", match: "EXACT", reason: "x" },
    // @ts-expect-error not allowed
    { kind: "enable_campaign", target: "customers/1/campaigns/12", reason: "x" },
  ], snap(), { ...lim, maxChanges: 1 });
  assert.deepEqual(ds.map((d) => d.ok), [true, false, false]);
});

test("auto applies only with a cap", () => {
  assert.equal(applyAutomatically(lim), true);
  assert.equal(applyAutomatically({ ...lim, monthlyCap: null }), false);
  assert.equal(applyAutomatically({ ...lim, mode: "suggest" }), false);
});
