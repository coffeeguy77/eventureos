/**
 * Roast Culture profitability model — the one calculation behind every card, chart, tooltip and export. Pure.
 *
 * Fixed packages (two-hour minimum, eight-hour day):
 *   cycle      = roast + turnaround
 *   usable     = max(0, hours × 60 − break)
 *   production = usable × productivity / 100
 *   batches    = floor(production / cycle)          (complete batches only)
 *   green      = batches × batch kg
 *   roasted    = green × (1 − roast loss / 100)
 * Output is credited at the end of each complete roast + changeover slot (conservative). The whole package fee is a
 * commitment from the first minute. Everything is calculated at full precision and rounded only for display.
 */
import { PACKAGES } from "./config";

const EPS = 1e-9;
const num = (v: unknown, min = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export type Channel = "bags" | "drinks";
export type TaxMode = "cash" | "business";
export type CostLine = "hire" | "green" | "packaging" | "extras" | "milk" | "cups";

export interface CalcInput {
  hourly: number;
  batchKg: number; roastMin: number; turnMin: number;
  /** % of usable time spent roasting (100 = back-to-back) */
  productivity: number;
  /** a break taken in the eight-hour day (two-hour sessions never have one) */
  breakMin: number;
  lossPct: number; greenPerKg: number;
  channel: Channel;
  bags: { packaging: boolean; bagKg: number; costPerBag: number; price: number; sellPct: number; wastePct: number };
  drinks: { doseG: number; drinksPerDose: number; price: number; dialInPct: number; sellPct: number; milkBottle: number; drinksPerBottle: number; milk: boolean; cupLid: number; packaging: boolean };
  extras: {
    enabled: boolean;
    labourPerHour: number; labourHours: number; setupCost: number;
    consumablesPerKg: number; freightPerKg: number; overheadPerSession: number;
    /** membership spread over the month's roasting: $/month ÷ expected roasted kg per month (0 = leave out) */
    membershipMonthly: number; monthlyKg: number;
  };
  tax: { mode: TaxMode; gst: Record<CostLine | "sales", boolean> };
}

export const DEFAULT_INPUT: CalcInput = {
  hourly: 400, batchKg: 30, roastMin: 12, turnMin: 3, productivity: 100, breakMin: 0, lossPct: 15, greenPerKg: 15,
  channel: "bags",
  bags: { packaging: true, bagKg: 1, costPerBag: 1, price: 40, sellPct: 100, wastePct: 0 },
  drinks: { doseG: 20, drinksPerDose: 2, price: 5, dialInPct: 0, sellPct: 100, milkBottle: 3.3, drinksPerBottle: 13, milk: true, cupLid: 0.055, packaging: false },
  extras: { enabled: false, labourPerHour: 0, labourHours: 0, setupCost: 0, consumablesPerKg: 0, freightPerKg: 0, overheadPerSession: 0, membershipMonthly: 99, monthlyKg: 0 },
  // Starting GST settings — the business confirms them with their accountant
  tax: { mode: "cash", gst: { hire: true, green: false, packaging: true, extras: true, milk: false, cups: true, sales: false } },
};

/** The two drink examples (before wastage). The large drink's milk yield is an assumption to set. */
export const DRINKS = {
  small: { label: "6 oz", doseG: 20, drinksPerDose: 2, price: 5, drinksPerBottle: 13 },
  large: { label: "12 oz", doseG: 20, drinksPerDose: 1, price: 6, drinksPerBottle: 6.5 },
} as const;

export interface Point {
  /** minutes into the session */
  t: number; batches: number; greenKg: number; roastedKg: number;
  /** committed cost so far: the whole package fee from minute 0, plus coffee and packing as batches finish */
  cost: number;
  /** potential sales value of the output so far (not sales made) */
  sales: number;
  contribution: number;
}

export interface PackageResult {
  key: "two" | "day" | "dayBreak"; label: string; hours: number; breakMin: number;
  batches: number; greenKg: number; roastedKg: number;
  hire: number; hirePerKg: number | null;
  costs: Record<CostLine, number> & { total: number };
  costPerKg: number | null;
  /** green + hire + packaging per roasted kg */
  coreCostPerKg: number | null;
  units: { full: number; leftoverKg: number; label: string };
  sold: number; revenue: number; contribution: number;
  contributionPerKg: number | null; marginPct: number | null; markupPct: number | null; breakEvenPrice: number | null;
  /** completed batches only — one point per finished slot, plus the start and the end of the session */
  points: Point[];
  excluded: string[];
}

function clean(i: CalcInput): CalcInput {
  return {
    ...i,
    hourly: num(i.hourly, 0, 100000), batchKg: num(i.batchKg, 0, 1000), roastMin: num(i.roastMin, 0, 600), turnMin: num(i.turnMin, 0, 600),
    productivity: num(i.productivity, 0, 100), breakMin: num(i.breakMin, 0, 480), lossPct: num(i.lossPct, 0, 100), greenPerKg: num(i.greenPerKg, 0, 10000),
    bags: { ...i.bags, bagKg: num(i.bags.bagKg, 0, 1000), costPerBag: num(i.bags.costPerBag, 0, 10000), price: num(i.bags.price, 0, 100000), sellPct: num(i.bags.sellPct, 0, 100), wastePct: num(i.bags.wastePct, 0, 100) },
    drinks: { ...i.drinks, doseG: num(i.drinks.doseG, 0, 1000), drinksPerDose: num(i.drinks.drinksPerDose, 0, 10), price: num(i.drinks.price, 0, 1000), dialInPct: num(i.drinks.dialInPct, 0, 100), sellPct: num(i.drinks.sellPct, 0, 100), milkBottle: num(i.drinks.milkBottle, 0, 1000), drinksPerBottle: num(i.drinks.drinksPerBottle, 0, 1000), cupLid: num(i.drinks.cupLid, 0, 100) },
    extras: { ...i.extras, labourPerHour: num(i.extras.labourPerHour, 0, 10000), labourHours: num(i.extras.labourHours, 0, 24), setupCost: num(i.extras.setupCost, 0, 100000), consumablesPerKg: num(i.extras.consumablesPerKg, 0, 10000), freightPerKg: num(i.extras.freightPerKg, 0, 10000), overheadPerSession: num(i.extras.overheadPerSession, 0, 100000), membershipMonthly: num(i.extras.membershipMonthly, 0, 100000), monthlyKg: num(i.extras.monthlyKg, 0, 1e7) },
  };
}

/** A line as the chosen tax view sees it: cash (as paid, GST-inclusive) or business (GST taken out where it applies). */
const taxed = (i: CalcInput, line: CostLine | "sales", v: number) => (i.tax.mode === "business" && i.tax.gst[line] ? v / 1.1 : v);

/** What the session's output turns into: full bags (leftover kept separate) or drinks. */
function sellable(i: CalcInput, roastedKg: number) {
  if (i.channel === "bags") {
    const kg = roastedKg * (1 - i.bags.wastePct / 100);
    const full = i.bags.bagKg > 0 ? Math.floor(kg / i.bags.bagKg + EPS) : 0;
    const leftoverKg = Math.max(0, kg - full * i.bags.bagKg);
    const sold = Math.floor(full * i.bags.sellPct / 100 + EPS);
    return { full, leftoverKg, label: "bags", sold, packUnits: i.bags.packaging ? full : 0, packCost: i.bags.costPerBag, milk: 0, cups: 0 };
  }
  const d = i.drinks;
  const kg = roastedKg * (1 - d.dialInPct / 100);
  const doses = d.doseG > 0 ? Math.floor((kg * 1000) / d.doseG + EPS) : 0;
  const full = Math.floor(doses * d.drinksPerDose + EPS);
  const leftoverKg = Math.max(0, kg - (doses * d.doseG) / 1000);
  const sold = Math.floor(full * d.sellPct / 100 + EPS);
  const bags = d.packaging && i.bags.bagKg > 0 ? Math.floor(roastedKg / i.bags.bagKg + EPS) : 0;
  return { full, leftoverKg, label: "drinks", sold, packUnits: bags, packCost: i.bags.costPerBag,
    milk: d.milk && d.drinksPerBottle > 0 ? sold * d.milkBottle / d.drinksPerBottle : 0, cups: sold * d.cupLid };
}

function costsFor(i: CalcInput, greenKg: number, roastedKg: number, hire: number) {
  const s = sellable(i, roastedKg);
  const x = i.extras;
  const extras = x.enabled
    ? x.labourPerHour * x.labourHours + x.setupCost + (x.consumablesPerKg + x.freightPerKg) * roastedKg + x.overheadPerSession
      + (x.monthlyKg > 0 ? (x.membershipMonthly / x.monthlyKg) * roastedKg : 0)
    : 0;
  const c = {
    hire: taxed(i, "hire", hire),
    green: taxed(i, "green", greenKg * i.greenPerKg),
    packaging: taxed(i, "packaging", s.packUnits * s.packCost),
    extras: taxed(i, "extras", extras),
    milk: taxed(i, "milk", s.milk),
    cups: taxed(i, "cups", s.cups),
  };
  const price = i.channel === "bags" ? i.bags.price : i.drinks.price;
  return { c, total: c.hire + c.green + c.packaging + c.extras + c.milk + c.cups, s, revenue: taxed(i, "sales", s.sold * price) };
}

export function packageResult(input: CalcInput, key: PackageResult["key"]): PackageResult {
  const i = clean(input);
  const hours = key === "two" ? PACKAGES.minHours : PACKAGES.dayHours;
  const breakMin = key === "dayBreak" ? Math.max(i.breakMin, 30) : key === "day" ? i.breakMin : 0;
  const cycle = i.roastMin + i.turnMin;
  const usable = Math.max(0, hours * 60 - breakMin);
  const production = usable * i.productivity / 100;
  const batches = cycle > 0 ? Math.floor(production / cycle + EPS) : 0;
  const greenKg = batches * i.batchKg;
  const roastedKg = greenKg * (1 - i.lossPct / 100);
  const hireCash = key === "two" ? i.hourly * PACKAGES.minHours : i.hourly * PACKAGES.dayHours * (1 - PACKAGES.dayDiscountPct / 100);
  const all = costsFor(i, greenKg, roastedKg, hireCash);
  const contribution = all.revenue - all.total;

  // The session, batch by batch: when each slot finishes (productivity stretches it; a break in the middle pauses it)
  const breakStart = usable / 2;
  const points: Point[] = [];
  const at = (t: number, k: number): Point => {
    const g = k * i.batchKg, r = g * (1 - i.lossPct / 100);
    const p = costsFor(i, g, r, hireCash);
    // fixed per-session extras are part of the commitment from the start, like the hire
    return { t, batches: k, greenKg: g, roastedKg: r, cost: p.total, sales: p.revenue, contribution: p.revenue - p.total };
  };
  points.push(at(0, 0));
  for (let k = 1; k <= batches; k++) {
    const base = i.productivity > 0 ? (k * cycle) / (i.productivity / 100) : Infinity;
    points.push(at(Math.min(hours * 60, base + (breakMin > 0 && base > breakStart + EPS ? breakMin : 0)), k));
  }
  if (points[points.length - 1].t < hours * 60) points.push({ ...points[points.length - 1], t: hours * 60 });

  const excluded = [
    !i.extras.enabled ? "Labour, setup and cleanup time" : null,
    !i.extras.enabled || !i.extras.freightPerKg ? "Freight" : null,
    !i.extras.enabled || !i.extras.overheadPerSession ? "Overheads (rent, insurance, marketing)" : null,
    !i.extras.enabled || !i.extras.monthlyKg ? "Membership ($/month)" : null,
    !i.extras.enabled || !i.extras.consumablesPerKg ? "Consumables (valves, labels, tape)" : null,
    i.channel === "bags" && !i.bags.packaging ? "Bags and labels" : null,
    i.channel === "drinks" ? "Staff wages, rent and equipment for serving drinks" : null,
    "Printing, storage, training and other facilities (quoted separately)",
  ].filter((x): x is string => !!x);

  return {
    key, label: key === "two" ? "Two-hour hire" : key === "day" ? (breakMin > 0 ? `Eight-hour day (${breakMin} min break)` : "Eight-hour day") : `Eight-hour day with ${breakMin} min break`,
    hours, breakMin, batches, greenKg, roastedKg,
    hire: all.c.hire, hirePerKg: div(all.c.hire, roastedKg),
    costs: { ...all.c, total: all.total }, costPerKg: div(all.total, roastedKg),
    coreCostPerKg: div(all.c.green + all.c.hire + all.c.packaging, roastedKg),
    units: { full: all.s.full, leftoverKg: all.s.leftoverKg, label: all.s.label },
    sold: all.s.sold, revenue: all.revenue, contribution,
    contributionPerKg: div(contribution, roastedKg),
    marginPct: all.revenue > 0 ? (contribution / all.revenue) * 100 : null,
    markupPct: all.total > 0 ? (contribution / all.total) * 100 : null,
    breakEvenPrice: all.s.sold > 0 ? all.total / all.s.sold * (input.tax.mode === "business" && input.tax.gst.sales ? 1.1 : 1) : null,
    points, excluded,
  };
}

/** The point on the timeline at a given minute (the last completed slot — never a fraction of a batch). */
export function pointAt(r: PackageResult, minute: number): Point {
  let p = r.points[0];
  for (const q of r.points) { if (q.t <= minute + EPS) p = q; else break; }
  return { ...p, t: minute };
}

/** Each machine with its own starting batch and the same times — for an explicit, labelled comparison. */
export function machineComparison(input: CalcInput, machines: { id: string; short: string; hourly: number; batchKg: number }[]) {
  return machines.map((m) => ({ id: m.id, name: m.short, batchKg: m.batchKg, r: packageResult({ ...input, hourly: m.hourly, batchKg: m.batchKg }, "day") }));
}

/** Spreadsheet rows for the export: the summary of each package, then the selected timeline. */
export function toCsv(input: CalcInput, results: PackageResult[], timeline: PackageResult) {
  const q = (v: unknown) => { const s = v === null || v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows: unknown[][] = [
    ["Roast Culture — production and cost plan", input.tax.mode === "business" ? "Business view (GST removed where set)" : "Cash view (GST-inclusive prices)"],
    [],
    ["Package", "Batches", "Green kg", "Roasted kg", "Hire $", "Hire $/kg", "Green $", "Packaging $", "Milk $", "Cups $", "Other $", "Total cost $", "Cost $/kg", "Units", "Leftover kg", "Sold", "Potential revenue $", "Contribution $", "Contribution $/kg", "Margin %", "Markup %", "Break-even price $"],
    ...results.map((r) => [r.label, r.batches, r.greenKg, r.roastedKg, r.hire, r.hirePerKg, r.costs.green, r.costs.packaging, r.costs.milk, r.costs.cups, r.costs.extras, r.costs.total, r.costPerKg, `${r.units.full} ${r.units.label}`, r.units.leftoverKg, r.sold, r.revenue, r.contribution, r.contributionPerKg, r.marginPct, r.markupPct, r.breakEvenPrice]),
    [],
    [`Timeline — ${timeline.label}`],
    ["Minute", "Completed batches", "Green kg", "Roasted kg", "Committed cost $", "Potential sales $", "Contribution $"],
    ...timeline.points.map((p) => [p.t, p.batches, p.greenKg, p.roastedKg, p.cost, p.sales, p.contribution]),
    [],
    ["Not included", timeline.excluded.join("; ")],
    ["Assumptions", `Batch ${input.batchKg} kg; roast ${input.roastMin} min + turnaround ${input.turnMin} min; productivity ${input.productivity}%; roast loss ${input.lossPct}%; green $${input.greenPerKg}/kg`],
  ];
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
