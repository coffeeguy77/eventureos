/**
 * Roastery maths: green stock on hand and its value, weight loss per coffee, and the green needed for an amount of
 * roasted coffee. Pure functions so they can be tested and used on the server and in the browser.
 */

export interface Move { coffee_id: string; kind: "received" | "roasted" | "adjusted"; kg: number; cost_per_kg: number | null }
export interface RoastRow { coffee_id: string | null; green_kg: number; roasted_kg: number | null }

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** Green on hand per coffee (sum of moves) and its value at the weighted average cost of what was received. */
export function stockByCoffee(moves: Move[]) {
  const out = new Map<string, { onHand: number; receivedKg: number; costKg: number; avgCost: number | null; value: number | null }>();
  for (const m of moves) {
    const o = out.get(m.coffee_id) ?? { onHand: 0, receivedKg: 0, costKg: 0, avgCost: null, value: null };
    o.onHand += n(m.kg);
    if (m.kind === "received" && m.cost_per_kg != null) { o.receivedKg += n(m.kg); o.costKg += n(m.kg) * n(m.cost_per_kg); }
    out.set(m.coffee_id, o);
  }
  for (const o of out.values()) {
    o.onHand = Math.round(o.onHand * 1000) / 1000;
    o.avgCost = o.receivedKg > 0 ? o.costKg / o.receivedKg : null;
    o.value = o.avgCost != null ? Math.max(0, o.onHand) * o.avgCost : null;
  }
  return out;
}

/**
 * Weight loss per coffee from roasts with a roasted weight: 1 − total roasted / total green, so heavier batches count
 * for more. Also returns the all-coffee figure, used for coffees with nothing weighed yet.
 */
export function lossByCoffee(roasts: RoastRow[]) {
  const per = new Map<string, { n: number; green: number; roasted: number; min: number; max: number }>();
  let g = 0, r = 0, count = 0;
  for (const x of roasts) {
    if (!x.roasted_kg || !x.green_kg || !x.coffee_id) continue;
    const green = n(x.green_kg), roasted = n(x.roasted_kg), loss = (green - roasted) / green * 100;
    const o = per.get(x.coffee_id) ?? { n: 0, green: 0, roasted: 0, min: Infinity, max: -Infinity };
    o.n++; o.green += green; o.roasted += roasted; o.min = Math.min(o.min, loss); o.max = Math.max(o.max, loss);
    per.set(x.coffee_id, o);
    g += green; r += roasted; count++;
  }
  const coffees = new Map<string, { n: number; lossPct: number; min: number; max: number }>();
  for (const [k, o] of per) coffees.set(k, { n: o.n, lossPct: (1 - o.roasted / o.green) * 100, min: o.min, max: o.max });
  return { coffees, all: count ? { n: count, lossPct: (1 - r / g) * 100 } : null };
}

/** The loss to use for a coffee: its own weighed batches, else the all-coffee average (own = false), else null. */
export function lossFor(id: string, loss: ReturnType<typeof lossByCoffee>) {
  const c = loss.coffees.get(id);
  if (c) return { pct: c.lossPct, n: c.n, own: true };
  return loss.all ? { pct: loss.all.lossPct, n: loss.all.n, own: false } : null;
}

/** Green needed for `roastedKg` at `lossPct`, split into batches of `batchKg` (full batches + a part batch). */
export function greenFor(roastedKg: number, lossPct: number, batchKg: number) {
  const green = roastedKg / (1 - lossPct / 100);
  const full = Math.floor(green / batchKg + 1e-9);
  const part = green - full * batchKg;
  return { green, full, part: part < 0.05 ? 0 : part, fullBatches: Math.ceil(green / batchKg - 1e-9) };
}

export const expectedRoasted = (greenKg: number, lossPct: number) => greenKg * (1 - lossPct / 100);

/** One row of the W45A roast recorder's roasts/index.csv. Only the columns the roastery uses. */
export interface RecorderRow {
  name: string; charge: string; coffee: string; batch_kg: number | null; roasted_kg: number | null;
  charge_bean_c: number | null; turning_point_s: number | null; first_crack_s: number | null; first_crack_bean_c: number | null;
  end_s: number | null; drop_bean_c: number | null; dtr_pct: number | null; score: number | null; notes: string | null; followed: string | null;
}

/** Parse the recorder's index.csv (quoted CSV, header row). Rows without a coffee or batch weight are skipped. */
export function parseRecorderIndex(text: string): { rows: RecorderRow[]; skipped: number } {
  const lines = splitCsv(text.replace(/^﻿/, ""));
  if (!lines.length) return { rows: [], skipped: 0 };
  const head = lines[0].map((h) => h.trim());
  const col = (row: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? (row[i] ?? "").trim() : ""; };
  const num = (s: string) => (s === "" ? null : Number.isFinite(Number(s)) ? Number(s) : null);
  if (!head.includes("name") || !head.includes("charge")) throw new Error("That file isn't the roast recorder's index.csv (it needs the name and charge columns).");
  const rows: RecorderRow[] = []; let skipped = 0;
  for (const r of lines.slice(1)) {
    if (!r.some((c) => c.trim())) continue;
    const coffee = col(r, "coffee"), batch = num(col(r, "batch_kg"));
    if (!coffee || !batch) { skipped++; continue; }
    rows.push({
      name: col(r, "name"), charge: col(r, "charge"), coffee, batch_kg: batch, roasted_kg: num(col(r, "roasted_kg")),
      charge_bean_c: num(col(r, "charge_bean_c")), turning_point_s: num(col(r, "turning_point_s")), first_crack_s: num(col(r, "first_crack_s")),
      first_crack_bean_c: num(col(r, "first_crack_bean_c")), end_s: num(col(r, "end_s")), drop_bean_c: num(col(r, "drop_bean_c")),
      dtr_pct: num(col(r, "dtr_pct")), score: num(col(r, "score")), notes: col(r, "notes") || null, followed: col(r, "followed") || null,
    });
  }
  return { rows, skipped };
}

function splitCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out;
}

export const mmss = (s: number | null | undefined) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/* ------------------------------------------------------------------ roast curves */

/**
 * A roast's curve, stored compactly: one sample every `step` seconds from charge (t = 0). Temperatures in °C to 0.1,
 * burner in %. `burner` is what the burner actually did; `burner_sp` what it was set to; `air_sp` the air setpoint.
 */
export interface Curve { step: number; bt: (number | null)[]; et: (number | null)[]; burner?: (number | null)[]; burner_sp?: (number | null)[]; air_sp?: (number | null)[] }

export const CURVE_MAX_S = 3600;

/** Check and tidy a curve from an import (it comes from the browser, so nothing is trusted). */
export function cleanCurve(raw: unknown): Curve | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const step = Number(o.step);
  if (!Number.isFinite(step) || step < 1 || step > 10) return null;
  const max = Math.floor(CURVE_MAX_S / step) + 1;
  const arr = (v: unknown, lo: number, hi: number, dp: number) => {
    if (!Array.isArray(v) || !v.length) return undefined;
    return v.slice(0, max).map((x) => { const n = typeof x === "number" ? x : Number(x); return x === null || x === "" || !Number.isFinite(n) || n < lo || n > hi ? null : Math.round(n * 10 ** dp) / 10 ** dp; });
  };
  const bt = arr(o.bt, -20, 400, 1);
  if (!bt || bt.filter((x) => x != null).length < 10) return null;
  const c: Curve = { step, bt, et: arr(o.et, -20, 600, 1) ?? [] };
  const b = arr(o.burner, 0, 101, 0), bs = arr(o.burner_sp, 0, 101, 0), a = arr(o.air_sp, 0, 600, 0);
  if (b) c.burner = b; if (bs) c.burner_sp = bs; if (a) c.air_sp = a;
  return c;
}

/**
 * Build a curve from a roast CSV: the W45A roast recorder's roast files (t_roast_s, bean_temp_c, air_temp_c, burner_pct,
 * burner_sp_pct, air_temp_sp_c) or the Profiler beta export (t_s, …). Samples every `step` seconds from charge.
 */
export function curveFromCsv(text: string, step = 2): Curve | null {
  const lines = splitCsv(text.replace(/^﻿/, ""));
  if (lines.length < 3) return null;
  const head = lines[0].map((h) => h.trim());
  const ix = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const iT = ix("t_roast_s", "t_s"), iB = ix("bean_temp_c"), iE = ix("air_temp_c"), iP = ix("burner_pct"), iS = ix("burner_sp_pct"), iA = ix("air_temp_sp_c");
  if (iT < 0 || iB < 0) return null;
  const at = new Map<number, string[]>(), gap = new Map<number, number>();
  for (const r of lines.slice(1)) {
    const t = Number(r[iT]);
    if (r[iT] === "" || !Number.isFinite(t) || t < 0 || t > CURVE_MAX_S) continue;
    const k = Math.round(t / step), d = Math.abs(t - k * step);
    if (!at.has(k) || d < gap.get(k)!) { at.set(k, r); gap.set(k, d); }
  }
  if (!at.size) return null;
  const last = Math.max(...at.keys());
  const pick = (i: number) => (i < 0 ? undefined : Array.from({ length: last + 1 }, (_, k) => { const r = at.get(k); const v = r ? Number(r[i]) : NaN; return r && r[i] !== "" && Number.isFinite(v) ? v : null; }));
  return cleanCurve({ step, bt: pick(iB), et: pick(iE), burner: pick(iP), burner_sp: pick(iS), air_sp: pick(iA) });
}

/** Rate of rise (°C/min) over `windowS` seconds at each sample. */
export function rorOf(c: Curve, windowS = 30): (number | null)[] {
  const k = Math.max(1, Math.round(windowS / c.step));
  return c.bt.map((v, i) => { const p = c.bt[i - k]; return i >= k && v != null && p != null ? Math.round((v - p) * (60 / (k * c.step)) * 10) / 10 : null; });
}

/** A roast for import: from the recorder (index.csv row + its roast CSV) or an import bundle (.json). */
export interface ImportRoast {
  name: string; charge: string; coffee: string; batch_kg: number; roasted_kg?: number | null; profile?: string | null;
  charge_bean_c?: number | null; turning_point_s?: number | null; first_crack_s?: number | null; first_crack_bean_c?: number | null;
  end_s?: number | null; drop_bean_c?: number | null; dtr_pct?: number | null; score?: number | null; notes?: string | null;
  curve?: Curve | null; deduct?: boolean;
}
