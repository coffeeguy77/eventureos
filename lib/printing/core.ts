/**
 * Printing (pure): settings and the price of a print job.
 * Default rates (ex GST): printing $120 a lineal metre (flat), rolls up to 1.2 m wide, $40 setup per job;
 * cutting (plotter) $50 for the first metre cut and $20 for each metre after. Metres are added up across the job.
 */
export interface PrintRates { printMetre: number; setup: number; cutFirst: number; cutMetre: number; rollWidth: number; rounding: "exact" | "0.1" | "1"; gstPct: number }
export interface PrintSettings extends PrintRates { enabled: boolean; intro: string | null; /** the printers and cutters, shown on the page */ equipment: string[] }
export const DEFAULT_PRINT: PrintSettings = { enabled: false, printMetre: 120, setup: 40, cutFirst: 50, cutMetre: 20, rollWidth: 1.2, rounding: "exact", gstPct: 10, intro: null, equipment: [] };

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function readPrinting(settings: unknown): PrintSettings {
  const p = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).printing : null) ?? {}) as Record<string, unknown>;
  return {
    enabled: p.enabled === true,
    printMetre: num(p.printMetre, 0, 100_000, DEFAULT_PRINT.printMetre), setup: num(p.setup, 0, 100_000, DEFAULT_PRINT.setup),
    cutFirst: num(p.cutFirst, 0, 100_000, DEFAULT_PRINT.cutFirst), cutMetre: num(p.cutMetre, 0, 100_000, DEFAULT_PRINT.cutMetre),
    rollWidth: num(p.rollWidth, 0.1, 10, DEFAULT_PRINT.rollWidth), rounding: p.rounding === "0.1" || p.rounding === "1" ? p.rounding : "exact",
    gstPct: num(p.gstPct, 0, 30, DEFAULT_PRINT.gstPct), intro: typeof p.intro === "string" && p.intro.trim() ? p.intro.trim().slice(0, 800) : null,
    equipment: Array.isArray(p.equipment) ? p.equipment.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 6) : [],
  };
}

export interface PrintItem { description: string; width_m: number; length_m: number; qty: number; /** cut to shape on the plotter */ cut?: boolean; /** special printing price per metre (ex GST) for this job, instead of the standard rate */ rate?: number }
export interface Extra { description: string; amount: number }

export function cleanItems(raw: unknown): PrintItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const width_m = Math.round(num(o.width_m, 0, 100, 0) * 1000) / 1000, length_m = Math.round(num(o.length_m, 0, 1000, 0) * 1000) / 1000;
    const qty = Math.round(num(o.qty, 1, 10_000, 1));
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
    const rate = o.rate === null || o.rate === undefined || o.rate === "" ? NaN : Number(o.rate);
    return length_m > 0 ? [{ description, width_m, length_m, qty, ...(typeof o.cut === "boolean" ? { cut: o.cut } : {}), ...(Number.isFinite(rate) && rate >= 0 ? { rate: Math.round(Math.min(rate, 100_000) * 100) / 100 } : {}) }] : [];
  });
}
export function cleanExtras(raw: unknown): Extra[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
    const amount = Math.round(num(o.amount, -100_000, 100_000, 0) * 100) / 100;
    return description && amount ? [{ description, amount }] : [];
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PriceLine { description: string; amount: number }
export interface PrintPrice { metres: number; cutMetres: number; lines: PriceLine[]; exGst: number; gst: number; total: number; tooWide: PrintItem[] }

const fmtM = (m: number) => m.toFixed(2).replace(/\.?0+$/, "");

/**
 * The price of a job: printing at a flat rate per lineal metre (prints × length × qty), setup once per job,
 * then cutting for the prints that are cut — first metre at one rate, each metre after at another — and extras.
 * `job.cut` (older jobs, one tick for the whole job) means every print is cut unless a print says otherwise.
 */
export function priceJob(job: { items: PrintItem[]; setup: boolean; cut: boolean; extras?: Extra[] }, r: PrintRates): PrintPrice {
  const round = (raw: number) => raw <= 0 ? 0 : r.rounding === "1" ? Math.ceil(raw - 1e-9) : r.rounding === "0.1" ? Math.ceil(raw * 10 - 1e-9) / 10 : Math.round(raw * 100) / 100;
  const metres = round(job.items.reduce((a, i) => a + i.length_m * i.qty, 0));
  const cutMetres = round(job.items.filter((i) => i.cut ?? job.cut).reduce((a, i) => a + i.length_m * i.qty, 0));
  const lines: PriceLine[] = [];
  // printing, one line per price per metre (a job can carry a special price instead of the standard rate)
  const byRate = new Map<number, number>();
  for (const i of job.items) { const k = i.rate ?? r.printMetre; byRate.set(k, (byRate.get(k) ?? 0) + i.length_m * i.qty); }
  for (const [rate, raw] of byRate) {
    const m = byRate.size === 1 ? metres : round(raw);
    if (m > 0) lines.push({ description: `Printing — ${fmtM(m)} lineal metre${m === 1 ? "" : "s"} at $${rate}/m`, amount: r2(m * rate) });
  }
  if (job.setup && metres > 0) lines.push({ description: "Setup", amount: r.setup });
  if (cutMetres > 0) {
    lines.push({ description: `Cutting — first metre`, amount: r.cutFirst });
    const after = Math.max(0, Math.round((cutMetres - 1) * 100) / 100);
    if (after > 0) lines.push({ description: `Cutting — ${fmtM(after)} more metre${after === 1 ? "" : "s"} at $${r.cutMetre}/m`, amount: r2(after * r.cutMetre) });
  }
  for (const e of job.extras ?? []) lines.push({ description: e.description, amount: e.amount });
  const exGst = r2(lines.reduce((a, l) => a + l.amount, 0));
  const gst = r2((exGst * r.gstPct) / 100);
  return { metres, cutMetres, lines, exGst, gst, total: r2(exGst + gst), tooWide: job.items.filter((i) => i.width_m > r.rollWidth + 1e-9) };
}
