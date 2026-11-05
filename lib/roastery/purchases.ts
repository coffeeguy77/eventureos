/**
 * Green coffee purchases — the pure part (no database): who the importers are, cleaning what's read off an invoice
 * (country names, kilos, price per kilo, freight), and the stats (kilos by origin, price per kilo by year, a price
 * index for the public graph). Used by the Gmail importer, the Purchases page and tests.
 */

/* ---------------- suppliers ---------------- */
/** Senders of green coffee invoices (an address, or a whole domain). Stored per business; these are Bean Culture's to start with. */
export const DEFAULT_GREEN_SENDERS = [
  "orders@projectorigin.com.au",
  "finance@cofinet.com.au",
  "volcafe.com",
  "coficom.com.au",
  "origincoffeetraders.com",
  "lindasmith@coffeeandnuttrading.com.au",
];

const SUPPLIER_BY_DOMAIN: [RegExp, string][] = [
  [/projectorigin\.com\.au$/i, "Project Origin"],
  [/cofinet\.com\.au$/i, "Cofinet"],
  [/(volcafe\.com|coficom\.com\.au)$/i, "Cofi-Com (Volcafe)"],
  [/origincoffeetraders\.com$/i, "Origin Coffee Traders"],
  [/coffeeandnuttrading\.com\.au$/i, "Coffee & Nut Trading"],
];
export function supplierFor(fromEmail: string | null | undefined, printed?: string | null): string {
  const domain = (fromEmail ?? "").split("@")[1] ?? "";
  for (const [re, name] of SUPPLIER_BY_DOMAIN) if (re.test(domain)) return name;
  return printed?.trim().slice(0, 120) || domain || "Unknown supplier";
}

/** Gmail search for every invoice email with a PDF from these senders, all time. */
export function greenQuery(senders: string[]): string | null {
  const s = senders.map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s"()]+$/.test(x));
  return s.length ? `from:(${s.join(" OR ")}) has:attachment filename:pdf` : null;
}

/* ---------------- origins ---------------- */
const COUNTRIES: [RegExp, string][] = [
  [/^(bra[sz]il|bra)\b/i, "Brazil"], [/^(colombia|col)\b/i, "Colombia"], [/^(papua new guinea|png|p\.n\.g\.?)\b/i, "Papua New Guinea"],
  [/^(ethiopia|eth)\b/i, "Ethiopia"], [/^(kenya|ken)\b/i, "Kenya"], [/^(guatemala|guat?)\b/i, "Guatemala"], [/^(honduras|hon)\b/i, "Honduras"],
  [/^(costa rica)\b/i, "Costa Rica"], [/^(el salvador|salvador)\b/i, "El Salvador"], [/^(nicaragua|nic)\b/i, "Nicaragua"], [/^(mexico|méxico|mex)\b/i, "Mexico"],
  [/^(peru|perú|per)\b/i, "Peru"], [/^(bolivia|bol)\b/i, "Bolivia"], [/^(ecuador|ecu)\b/i, "Ecuador"], [/^(panama|panamá|pan)\b/i, "Panama"],
  [/^(rwanda|rwa)\b/i, "Rwanda"], [/^(burundi|bdi)\b/i, "Burundi"], [/^(uganda|uga)\b/i, "Uganda"], [/^(tanzania|tza|tan)\b/i, "Tanzania"],
  [/^(indonesia|idn|sumatra|java|sulawesi|bali|flores)\b/i, "Indonesia"], [/^(india|ind)\b/i, "India"], [/^(vietnam|viet nam|vnm)\b/i, "Vietnam"],
  [/^(china|yunnan)\b/i, "China"], [/^(laos|lao)\b/i, "Laos"], [/^(thailand|tha)\b/i, "Thailand"], [/^(myanmar|burma)\b/i, "Myanmar"],
  [/^(timor|east timor|timor-leste)\b/i, "Timor-Leste"], [/^(yemen)\b/i, "Yemen"], [/^(jamaica|blue mountain)\b/i, "Jamaica"], [/^(hawaii|kona)\b/i, "Hawaii"],
  [/^(australia|aus)\b/i, "Australia"], [/^(dominican republic|dominican)\b/i, "Dominican Republic"], [/^(haiti)\b/i, "Haiti"], [/^(cuba)\b/i, "Cuba"],
  [/^(drc|democratic republic of (the )?congo|congo)\b/i, "DR Congo"],
];
/** "Bra", "BRAZIL", "png" → "Brazil", "Papua New Guinea". Unknown names are kept, tidied. */
export function cleanCountry(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  for (const [re, name] of COUNTRIES) if (re.test(s)) return name;
  return titleCase(s).slice(0, 60);
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Washed / Natural / Honey … in one spelling. */
export function cleanProcess(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/anaerob/.test(s)) return /natural/.test(s) ? "Anaerobic natural" : /washed/.test(s) ? "Anaerobic washed" : "Anaerobic";
  if (/honey|pulped natural|semi[- ]?washed/.test(s)) return /semi/.test(s) && !/honey/.test(s) ? "Semi-washed" : "Honey";
  if (/wet[- ]?hulled|giling/.test(s)) return "Wet-hulled";
  if (/natural|dry[- ]?process|sun[- ]?dried|unwashed/.test(s)) return "Natural";
  if (/washed|wet[- ]?process|fully washed/.test(s)) return "Washed";
  if (/decaf|swiss water|sugar ?cane|mountain water|\bea\b|co2/.test(s)) return "Decaf";
  return titleCase(s).slice(0, 60);
}

/* ---------------- lines ---------------- */
export interface ReadLine {
  description: string; code?: string | null; country?: string | null; region?: string | null; farm?: string | null; variety?: string | null;
  process?: string | null; grade?: string | null; crop_year?: number | null; certifications?: string[] | null; decaf?: boolean | null; blend?: boolean | null;
  bags?: number | null; bag_kg?: number | null; kg?: number | null; price_per_kg?: number | null; amount_ex_gst?: number | null; is_coffee?: boolean | null;
}
export interface CleanLine {
  description: string; supplier_code: string | null; country: string | null; region: string | null; farm: string | null; variety: string | null;
  process: string | null; grade: string | null; crop_year: number | null; certifications: string[]; decaf: boolean; blend: boolean;
  bags: number | null; bag_kg: number | null; kg: number | null; price_per_kg: number | null; amount_ex_gst: number | null;
}

const FEE = /\b(freight|delivery|shipping|transport|courier|pallet|handling|surcharge|card fee|merchant fee|admin fee|storage|insurance|fuel levy)\b/i;
export const isFeeLine = (description: string, isCoffee?: boolean | null) => isCoffee === false || (FEE.test(description) && !/\b(coffee|arabica|robusta)\b.*\b(bags?|kg)\b/i.test(description.replace(FEE, "")));

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[$,\s]/g, ""))) ? Number(v.replace(/[$,\s]/g, "")) : null);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One coffee line, tidied: kilos from bags × bag size when only bags are printed, price per kilo from the line amount
 * when it isn't printed, and a printed per-kilo price that disagrees with the amount by more than 2% replaced by
 * amount ÷ kilos (with a warning).
 */
export function cleanLine(raw: ReadLine, warn: (w: string) => void): CleanLine | null {
  const description = str(raw.description, 400);
  if (!description) return null;
  const bags = num(raw.bags), bagKg = num(raw.bag_kg), amount = num(raw.amount_ex_gst);
  let kg = num(raw.kg);
  if ((kg == null || kg <= 0) && bags && bagKg) kg = bags * bagKg;
  let ppk = num(raw.price_per_kg);
  if (kg && kg > 0 && amount != null && amount > 0) {
    const fromAmount = amount / kg;
    if (ppk == null || ppk <= 0) ppk = fromAmount;
    else if (Math.abs(ppk - fromAmount) / fromAmount > 0.02) { warn(`"${description.slice(0, 60)}": printed $/kg didn't match the line total — used the total.`); ppk = fromAmount; }
  }
  const year = num(raw.crop_year);
  const decaf = raw.decaf === true || /\bdecaf/i.test(description);
  const country = cleanCountry(str(raw.country, 60));
  return {
    description, supplier_code: str(raw.code, 60), country: decaf && !country ? null : country,
    region: str(raw.region, 120), farm: str(raw.farm, 160), variety: str(raw.variety, 160), process: decaf ? "Decaf" : cleanProcess(str(raw.process, 60)),
    grade: str(raw.grade, 120), crop_year: year && year >= 2000 && year <= 2100 ? Math.round(year) : null,
    certifications: (Array.isArray(raw.certifications) ? raw.certifications : []).map((c) => str(c, 40)).filter((c): c is string => !!c).slice(0, 6),
    decaf, blend: raw.blend === true || (!country && /\b(mix|blend)\b/i.test(description)),
    bags: bags, bag_kg: bagKg, kg: kg != null && kg > 0 ? Math.round(kg * 1000) / 1000 : null,
    price_per_kg: ppk != null && ppk > 0 ? Math.round(ppk * 10000) / 10000 : null, amount_ex_gst: amount != null ? r2(amount) : kg && ppk ? r2(kg * ppk) : null,
  };
}

/* ---------------- stats ---------------- */
export interface StatLine { country: string | null; kg: number | null; price_per_kg: number | null; amount_ex_gst: number | null; invoice_date: string | null; decaf: boolean; blend: boolean }
export const originOf = (l: Pick<StatLine, "country" | "decaf" | "blend">) => (l.decaf ? "Decaf" : l.country ?? (l.blend ? "Blends" : "Unknown"));

/** Kilos and spend by origin, biggest first. */
export function byOrigin(lines: StatLine[]) {
  const m = new Map<string, { origin: string; kg: number; spend: number; lines: number; first: string | null; last: string | null }>();
  for (const l of lines) {
    const k = originOf(l);
    const x = m.get(k) ?? { origin: k, kg: 0, spend: 0, lines: 0, first: null, last: null };
    x.kg += l.kg ?? 0; x.spend += l.amount_ex_gst ?? 0; x.lines++;
    if (l.invoice_date) { if (!x.first || l.invoice_date < x.first) x.first = l.invoice_date; if (!x.last || l.invoice_date > x.last) x.last = l.invoice_date; }
    m.set(k, x);
  }
  return [...m.values()].map((x) => ({ ...x, kg: Math.round(x.kg * 10) / 10, spend: r2(x.spend), avgPerKg: x.kg > 0 ? r2(x.spend / x.kg) : null })).sort((a, b) => b.kg - a.kg);
}

/** Weighted average $/kg per year for each origin (kilo-weighted, lines with both kilos and a price). */
export function pricePerYear(lines: StatLine[]) {
  const m = new Map<string, Map<number, { kg: number; spend: number }>>();
  for (const l of lines) {
    if (!l.invoice_date || !l.kg || !l.price_per_kg) continue;
    const y = Number(l.invoice_date.slice(0, 4)), k = originOf(l);
    const ym = m.get(k) ?? new Map();
    const x = ym.get(y) ?? { kg: 0, spend: 0 };
    x.kg += l.kg; x.spend += l.kg * l.price_per_kg;
    ym.set(y, x); m.set(k, ym);
  }
  const out: Record<string, Record<number, { perKg: number; kg: number }>> = {};
  for (const [k, ym] of m) { out[k] = {}; for (const [y, x] of ym) out[k][y] = { perKg: r2(x.spend / x.kg), kg: Math.round(x.kg) }; }
  return out;
}

/**
 * The public graph: green coffee price as an index (first year = 100), all origins together, kilo-weighted.
 * No dollars — customers see how prices have moved, never what was paid.
 */
export function priceIndex(lines: StatLine[]): { year: number; index: number }[] {
  const all = pricePerYear(lines.map((l) => ({ ...l, country: "All", decaf: false, blend: false })))["All"] ?? {};
  const years = Object.keys(all).map(Number).sort((a, b) => a - b);
  if (!years.length) return [];
  const base = all[years[0]].perKg;
  return years.map((y) => ({ year: y, index: Math.round((all[y].perKg / base) * 1000) / 10 }));
}
