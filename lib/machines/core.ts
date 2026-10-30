/**
 * Coffee machines (pure): settings, labour pricing for service/repair jobs, job totals and the machine chooser.
 * Settings live at organisations.settings.machines. Labour: the first hour (which includes the callout) at one
 * rate, then each hour after at another, billed in steps (default 15 minutes). Job lines are GST inclusive,
 * like the rest of EventureOS, so they go to Xero line by line.
 */

export type MilkKind = "fresh" | "powder" | "both";
export type WaterKind = "tank" | "plumbed" | "both";

/** A machine you sell, matched to a shop product by its slug (name, price and photo come from the shop). */
export interface MachineModel {
  slug: string; cups: number; milk: MilkKind; water: WaterKind; steamWand: boolean; twoMilks: boolean;
  widthMm: number | null; depthMm: number | null; heightMm: number | null; weightKg: number | null;
  screen: string | null; bestFor: string | null; highlights: string[];
}

export interface MachineSettings {
  /** the public Coffee machines page and the chooser */
  enabled: boolean;
  /** the public Repairs & servicing page and its form */
  serviceEnabled: boolean;
  calloutFirstHour: number; hourly: number; incrementMin: number; gstPct: number;
  /** true = the labour rates above include GST */
  ratesIncGst: boolean;
  /** brands you don't service, said loudly on the form (and the form won't send for them) */
  notServiced: string[];
  agentOf: string | null; area: string | null; intro: string | null; serviceIntro: string | null;
  /** the shop category the machines are in */
  shopCategory: string;
  /** price list categories shown on the Price list tab and first in Quick sale */
  priceCategories: string[];
  models: MachineModel[];
}

export const DEFAULT_MACHINES: MachineSettings = {
  enabled: false, serviceEnabled: false, calloutFirstHour: 275, hourly: 150, incrementMin: 15, gstPct: 10, ratesIncGst: false,
  notServiced: [], agentOf: null, area: null, intro: null, serviceIntro: null, shopCategory: "Coffee machines",
  priceCategories: ["Coffee machines", "Coffee machine accessories", "Coffee machine cleaning", "Coffee machine parts", "Coffee machine service"], models: [],
};

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const nul = (v: unknown, lo: number, hi: number) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : null);
const strs = (v: unknown, each: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, each)).filter(Boolean).slice(0, max) : []);

export function cleanModel(raw: unknown): MachineModel | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const slug = typeof o.slug === "string" && /^[a-z0-9-]{1,80}$/.test(o.slug) ? o.slug : null;
  if (!slug) return null;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  return {
    slug, cups: Math.round(num(o.cups, 1, 5000, 50)), milk: pick(o.milk, ["fresh", "powder", "both"] as const, "fresh"), water: pick(o.water, ["tank", "plumbed", "both"] as const, "tank"),
    steamWand: o.steamWand === true, twoMilks: o.twoMilks === true,
    widthMm: nul(o.widthMm, 1, 5000), depthMm: nul(o.depthMm, 1, 5000), heightMm: nul(o.heightMm, 1, 5000), weightKg: nul(o.weightKg, 0.1, 1000),
    screen: txt(o.screen, 40), bestFor: txt(o.bestFor, 160), highlights: strs(o.highlights, 120, 8),
  };
}

export function readMachines(settings: unknown): MachineSettings {
  const m = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).machines : null) ?? {}) as Record<string, unknown>;
  const d = DEFAULT_MACHINES;
  return {
    enabled: m.enabled === true, serviceEnabled: m.serviceEnabled === true,
    calloutFirstHour: num(m.calloutFirstHour, 0, 100_000, d.calloutFirstHour), hourly: num(m.hourly, 0, 100_000, d.hourly),
    incrementMin: [1, 5, 6, 10, 15, 30, 60].includes(Number(m.incrementMin)) ? Number(m.incrementMin) : d.incrementMin,
    gstPct: num(m.gstPct, 0, 30, d.gstPct), ratesIncGst: m.ratesIncGst === true,
    notServiced: strs(m.notServiced, 40, 20), agentOf: txt(m.agentOf, 60), area: txt(m.area, 120), intro: txt(m.intro, 800), serviceIntro: txt(m.serviceIntro, 800),
    shopCategory: txt(m.shopCategory, 60) ?? d.shopCategory,
    priceCategories: Array.isArray(m.priceCategories) ? strs(m.priceCategories, 80, 20) : d.priceCategories,
    models: (Array.isArray(m.models) ? m.models : []).slice(0, 60).map(cleanModel).filter((x): x is MachineModel => !!x),
  };
}

/** The brand they typed is one you don't service (whole words, any case: "breville barista" → Breville). */
export function notServicedBrand(brand: string, s: Pick<MachineSettings, "notServiced">): string | null {
  const b = ` ${brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (b.trim() === "") return null;
  return s.notServiced.find((n) => { const k = n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); return !!k && b.includes(` ${k} `); }) ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A job line, GST inclusive. */
export interface JobItem { description: string; qty: number; unit_inc: number; tax_rate: 0 | 10; service_id?: string | null; code?: string | null; account?: string | null }

export function cleanJobItems(raw: unknown): JobItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 500) : "";
    const qty = r2(num(o.qty, 0, 100_000, 1));
    const unit_inc = r2(num(o.unit_inc, -1_000_000, 1_000_000, 0));
    if (!description || !qty) return [];
    const id = typeof o.service_id === "string" && /^[0-9a-f-]{36}$/i.test(o.service_id) ? o.service_id : null;
    return [{ description, qty, unit_inc, tax_rate: Number(o.tax_rate) === 0 ? 0 : 10, service_id: id, code: txt(o.code, 60), account: txt(o.account, 20) } as JobItem];
  });
}

/** Hours billed: rounded up to the step (e.g. 1h 7m → 1.25 h at 15-minute steps). */
export function billedHours(hours: number, incrementMin: number) {
  const h = Math.max(0, Number(hours) || 0);
  const step = incrementMin / 60;
  if (h <= 0) return 0;
  return Math.round(Math.ceil(h / step - 1e-9) * step * 10000) / 10000;
}

const fmtH = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, ""));

/**
 * Labour lines (GST inclusive). A callout always charges the first hour (it includes travel), however short the job;
 * after that, each step at the hourly rate. Without a callout (workshop job) every step is at the hourly rate.
 */
export function labourLines(hours: number, callout: boolean, s: Pick<MachineSettings, "calloutFirstHour" | "hourly" | "incrementMin" | "gstPct" | "ratesIncGst">): JobItem[] {
  const inc = (ex: number) => r2(s.ratesIncGst ? ex : ex * (1 + s.gstPct / 100));
  const tax: 0 | 10 = s.gstPct > 0 ? 10 : 0;
  const billed = billedHours(hours, s.incrementMin);
  const out: JobItem[] = [];
  if (callout) {
    out.push({ description: "Callout and first hour", qty: 1, unit_inc: inc(s.calloutFirstHour), tax_rate: tax });
    const after = Math.max(0, Math.round((billed - 1) * 10000) / 10000);
    if (after > 0) out.push({ description: `Labour — ${fmtH(after)} more hour${after === 1 ? "" : "s"} at $${s.hourly}/h`, qty: after, unit_inc: inc(s.hourly), tax_rate: tax });
  } else if (billed > 0) {
    out.push({ description: `Labour — ${fmtH(billed)} hour${billed === 1 ? "" : "s"} at $${s.hourly}/h`, qty: billed, unit_inc: inc(s.hourly), tax_rate: tax });
  }
  return out;
}

export interface JobTotal { lines: (JobItem & { amount: number })[]; total: number; gst: number; exGst: number }

/** Labour (for repair/service/install jobs) plus the job's items. */
export function jobTotal(job: { kind: string; hours: number; callout: boolean; items: JobItem[] }, s: MachineSettings): JobTotal {
  const labour = job.kind === "sale" ? [] : labourLines(job.hours, job.callout, s);
  const lines = [...labour, ...job.items].map((l) => ({ ...l, amount: r2(l.qty * l.unit_inc) }));
  const total = r2(lines.reduce((a, l) => a + l.amount, 0));
  const gst = r2(lines.reduce((a, l) => a + (l.tax_rate ? l.amount - l.amount / (1 + s.gstPct / 100) : 0), 0));
  return { lines, total, gst, exGst: r2(total - gst) };
}

// ── The machine chooser ──────────────────────────────────────────────────────────────────────────

export interface ChooserAnswers {
  /** coffees a day */
  cups: number;
  milk: "fresh" | "powder" | "black" | "any";
  water: "tank" | "plumbed" | "any";
  /** most they'd spend (inc GST); null = no limit */
  budget: number | null;
  compact: boolean;
  /** full cream and a second milk at once */
  twoMilks: boolean;
  /** a steam wand for hand-textured milk */
  steamWand: boolean;
}
export interface ChooserPick { slug: string; score: number; fits: boolean; reasons: string[]; misses: string[] }

/**
 * Rank the machines for what they told us. Must-haves (enough cups a day, under budget) decide "fits"; the rest
 * adds or takes away points. The best fit is the one big enough without being far more machine than they need.
 */
export function chooseMachines(models: (MachineModel & { price: number | null })[], a: ChooserAnswers): ChooserPick[] {
  return models.map((m) => {
    const reasons: string[] = [], misses: string[] = [];
    let score = 0, fits = true;
    if (m.cups >= a.cups) {
      const spare = m.cups / Math.max(1, a.cups);
      score += spare <= 1.6 ? 40 : spare <= 3 ? 28 : 12;
      reasons.push(`Made for up to ${m.cups} coffees a day`);
    } else { fits = false; misses.push(`Rated for ${m.cups} a day — you need about ${a.cups}`); }
    if (a.budget !== null && m.price !== null) {
      if (m.price <= a.budget) { score += 10; } else { fits = false; misses.push("Over your budget"); }
    }
    if (a.milk === "fresh") { if (m.milk !== "powder") { score += 15; reasons.push("Fresh milk, textured automatically"); } else { score -= 25; misses.push("Uses powdered milk"); } }
    if (a.milk === "powder") { if (m.milk !== "fresh") { score += 15; reasons.push("Powdered milk — no fridge needed"); } else { score -= 15; misses.push("Fresh milk only"); } }
    if (a.water === "plumbed") { if (m.water !== "tank") { score += 10; reasons.push("Plumbs into mains water"); } else { score -= 20; misses.push("Water tank only"); } }
    if (a.water === "tank") { if (m.water !== "plumbed") { score += 6; reasons.push("Runs from a water tank — no plumber"); } else { score -= 20; misses.push("Needs a mains water connection"); } }
    if (a.compact) { if (m.widthMm !== null && m.widthMm <= 345 && (m.heightMm ?? 999) <= 600) { score += 8; reasons.push("Small footprint"); } else { score -= 6; misses.push("A larger machine"); } }
    if (a.twoMilks) { if (m.twoMilks) { score += 10; reasons.push("Two milks at once (e.g. full cream and lite)"); } else { score -= 8; misses.push("One milk at a time"); } }
    if (a.steamWand) { if (m.steamWand) { score += 8; reasons.push("Steam wand for barista-style milk"); } else { score -= 6; misses.push("No steam wand"); } }
    if (m.price !== null && a.budget === null) score -= Math.min(10, m.price / 3000); // nudge to the sensible choice when price isn't a limit
    return { slug: m.slug, score: Math.round(score * 10) / 10, fits, reasons, misses };
  }).sort((x, y) => Number(y.fits) - Number(x.fits) || y.score - x.score);
}

// ── Job statuses ─────────────────────────────────────────────────────────────────────────────────
export type MachineJobStatus = "new" | "booked" | "in_progress" | "waiting_parts" | "done" | "cancelled";
export const JOB_STATUSES: MachineJobStatus[] = ["new", "booked", "in_progress", "waiting_parts", "done", "cancelled"];
export const JOB_STATUS: Record<MachineJobStatus, { label: string; tone: "blue" | "brand" | "amber" | "red" | "green" | "neutral" }> = {
  new: { label: "New", tone: "blue" }, booked: { label: "Booked", tone: "brand" }, in_progress: { label: "In progress", tone: "amber" },
  waiting_parts: { label: "Waiting on parts", tone: "red" }, done: { label: "Done", tone: "green" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
export type MachineJobKind = "repair" | "service" | "install" | "sale";
export const JOB_KINDS: Record<MachineJobKind, string> = { repair: "Repair", service: "Service", install: "Install", sale: "Machine sale" };
