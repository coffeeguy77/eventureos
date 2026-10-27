/**
 * Printing (pure): settings and the price of a print job.
 * Default rates (ex GST): $120 for the first lineal metre, $20 a metre after that, rolls up to 1.2 m wide,
 * $40 setup per job, $40 for cutting (plotter) per job. Lineal metres are added up across the job's prints.
 */
export interface PrintRates { firstMetre: number; perMetre: number; setup: number; cut: number; rollWidth: number; rounding: "exact" | "0.1" | "1"; gstPct: number }
export interface PrintSettings extends PrintRates { enabled: boolean; intro: string | null; /** the printers and cutters, shown on the page */ equipment: string[] }
export const DEFAULT_PRINT: PrintSettings = { enabled: false, firstMetre: 120, perMetre: 20, setup: 40, cut: 40, rollWidth: 1.2, rounding: "exact", gstPct: 10, intro: null, equipment: [] };

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function readPrinting(settings: unknown): PrintSettings {
  const p = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).printing : null) ?? {}) as Record<string, unknown>;
  return {
    enabled: p.enabled === true,
    firstMetre: num(p.firstMetre, 0, 100_000, DEFAULT_PRINT.firstMetre), perMetre: num(p.perMetre, 0, 100_000, DEFAULT_PRINT.perMetre),
    setup: num(p.setup, 0, 100_000, DEFAULT_PRINT.setup), cut: num(p.cut, 0, 100_000, DEFAULT_PRINT.cut),
    rollWidth: num(p.rollWidth, 0.1, 10, DEFAULT_PRINT.rollWidth), rounding: p.rounding === "0.1" || p.rounding === "1" ? p.rounding : "exact",
    gstPct: num(p.gstPct, 0, 30, DEFAULT_PRINT.gstPct), intro: typeof p.intro === "string" && p.intro.trim() ? p.intro.trim().slice(0, 800) : null,
    equipment: Array.isArray(p.equipment) ? p.equipment.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 6) : [],
  };
}

export interface PrintItem { description: string; width_m: number; length_m: number; qty: number }
export interface Extra { description: string; amount: number }

export function cleanItems(raw: unknown): PrintItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const width_m = Math.round(num(o.width_m, 0, 100, 0) * 1000) / 1000, length_m = Math.round(num(o.length_m, 0, 1000, 0) * 1000) / 1000;
    const qty = Math.round(num(o.qty, 1, 10_000, 1));
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
    return length_m > 0 ? [{ description, width_m, length_m, qty }] : [];
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
export interface PrintPrice { metres: number; lines: PriceLine[]; exGst: number; gst: number; total: number; tooWide: PrintItem[] }

/** The price of a job: lineal metres (prints × length) charged first metre + each metre after, then setup, cut and extras. */
export function priceJob(job: { items: PrintItem[]; setup: boolean; cut: boolean; extras?: Extra[] }, r: PrintRates): PrintPrice {
  const raw = job.items.reduce((a, i) => a + i.length_m * i.qty, 0);
  const metres = raw <= 0 ? 0 : r.rounding === "1" ? Math.ceil(raw - 1e-9) : r.rounding === "0.1" ? Math.ceil(raw * 10 - 1e-9) / 10 : Math.round(raw * 100) / 100;
  const lines: PriceLine[] = [];
  if (metres > 0) {
    lines.push({ description: `Printing — first lineal metre`, amount: r.firstMetre });
    const after = Math.max(0, metres - 1);
    if (after > 0) lines.push({ description: `Printing — ${after.toFixed(2).replace(/\.?0+$/, "")} more lineal metre${after === 1 ? "" : "s"} at $${r.perMetre}/m`, amount: r2(after * r.perMetre) });
  }
  if (job.setup && metres > 0) lines.push({ description: "Setup", amount: r.setup });
  if (job.cut && metres > 0) lines.push({ description: "Cutting", amount: r.cut });
  for (const e of job.extras ?? []) lines.push({ description: e.description, amount: e.amount });
  const exGst = r2(lines.reduce((a, l) => a + l.amount, 0));
  const gst = r2((exGst * r.gstPct) / 100);
  return { metres, lines, exGst, gst, total: r2(exGst + gst), tooWide: job.items.filter((i) => i.width_m > r.rollWidth + 1e-9) };
}
