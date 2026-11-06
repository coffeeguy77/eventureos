/**
 * Test & Tag (AS/NZS 3760 electrical appliance testing): retest intervals, due status, asset codes, tester-file
 * import helpers and Zebra ZPL labels. Pure — used by the office pages, the server, the browser printer and tests.
 */

export const INTERVALS: { months: number; label: string }[] = [
  { months: 3, label: "3 months — construction, mining, hire equipment" },
  { months: 6, label: "6 months — factory, workshop, outdoor or hostile" },
  { months: 12, label: "12 months — commercial, kitchens, events, customer use" },
  { months: 24, label: "2 years" },
  { months: 60, label: "5 years — non-hostile, e.g. offices (equipment not flexed)" },
];
export const CLASSES = [
  { key: "I", label: "Class I (earthed)" }, { key: "II", label: "Class II (double insulated)" },
  { key: "cord", label: "Extension lead / cord set" }, { key: "rcd", label: "Portable RCD / power board" }, { key: "other", label: "Other" },
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** Add whole months, keeping to the end of shorter months (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export type TagStatus = "untested" | "failed" | "overdue" | "due_soon" | "ok" | "retired";
export const STATUS_LABEL: Record<TagStatus, string> = { untested: "Not tested", failed: "Failed", overdue: "Overdue", due_soon: "Due soon", ok: "In date", retired: "Retired" };

export function tagStatus(a: { status: string; last_result: string | null; next_due: string | null }, today: string, soonDays = 30): TagStatus {
  if (a.status === "retired") return "retired";
  if (!a.last_result || !a.next_due) return "untested";
  if (a.last_result === "fail") return "failed";
  const d = days(today, a.next_due);
  if (d < 0) return "overdue";
  if (d <= soonDays) return "due_soon";
  return "ok";
}

/** Next code after the highest used: PREFIX-000123. */
export function nextCode(prefix: string, used: string[]): string {
  const p = cleanPrefix(prefix);
  const n = used.reduce((max, c) => { const m = c.match(new RegExp(`^${p}-(\\d+)$`, "i")); return m ? Math.max(max, Number(m[1])) : max; }, 0);
  return `${p}-${String(n + 1).padStart(6, "0")}`;
}
export const cleanPrefix = (p: string) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TT";
export const cleanCode = (c: string) => (c ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9._/-]/g, "").slice(0, 40);

/* ------------------------------------------------------------------ tester files (Metrel ES Manager / PATLink, any CSV/XLSX) */

/** "PASS", "P", "OK", "✓" → pass; "FAIL", "F", "X" → fail; anything else null. */
export function readResult(v: unknown): "pass" | "fail" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(pass(ed)?|p|ok|good|yes|y|✓|✔|1|true)$/.test(s)) return "pass";
  if (/^(fail(ed)?|f|x|bad|no|n|✗|✘|0|false|reject(ed)?)$/.test(s)) return "fail";
  return null;
}

/** Dates as testers write them: 2026-11-06, 06/11/2026, 6.11.2026, 6/11/26 (day first), with or without a time. */
export function readDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isDate(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`) ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isDate(iso) ? iso : null;
  }
  // a spreadsheet serial date (days since 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); return d.toISOString().slice(0, 10); }
  return null;
}

export const IMPORT_FIELDS = [
  { key: "code", label: "Asset ID / barcode", hints: ["asset", "appliance id", "id", "barcode", "tag", "code", "number"] },
  { key: "date", label: "Test date", hints: ["date", "tested", "time"] },
  { key: "result", label: "Result", hints: ["result", "status", "pass", "verdict", "outcome"] },
  { key: "name", label: "Description", hints: ["description", "name", "appliance", "equipment", "item"] },
  { key: "location", label: "Location", hints: ["location", "site", "room", "department"] },
  { key: "earth", label: "Earth continuity (Ω)", hints: ["earth", "continuity", "rpe", "r pe", "bond"] },
  { key: "insulation", label: "Insulation (MΩ)", hints: ["insulation", "riso", "r iso"] },
  { key: "leakage", label: "Leakage (mA)", hints: ["leakage", "sub", "ipe", "touch", "leak"] },
  { key: "polarity", label: "Polarity", hints: ["polarity"] },
  { key: "rcd", label: "RCD trip (ms)", hints: ["rcd", "trip"] },
  { key: "tester", label: "Tested by", hints: ["user", "tester", "operator", "technician", "inspector"] },
  { key: "notes", label: "Notes", hints: ["note", "comment", "remark"] },
] as const;
export type ImportKey = (typeof IMPORT_FIELDS)[number]["key"];

/** Guess which column is which from the header names. */
export function guessColumns(headers: string[]): Partial<Record<ImportKey, string>> {
  const out: Partial<Record<ImportKey, string>> = {};
  const used = new Set<string>();
  for (const f of IMPORT_FIELDS) {
    const h = headers.find((x) => !used.has(x) && f.hints.some((k) => x.toLowerCase().replace(/[_-]+/g, " ").includes(k)));
    if (h) { out[f.key] = h; used.add(h); }
  }
  return out;
}

/* ------------------------------------------------------------------ labels (Zebra ZPL) */

export interface PrinterProfile { widthMm: number; heightMm: number; dpi: 203 | 300; rotate: boolean; darkness: number | null }
export const DEFAULT_PROFILE: PrinterProfile = { widthMm: 100, heightMm: 50, dpi: 203, rotate: false, darkness: null };
export function readProfile(raw: unknown): PrinterProfile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : d; };
  return { widthMm: n(o.widthMm, 100, 20, 120), heightMm: n(o.heightMm, 50, 15, 200), dpi: Number(o.dpi) === 300 ? 300 : 203, rotate: o.rotate === true, darkness: o.darkness == null || o.darkness === "" ? null : n(o.darkness, 15, 0, 30) };
}

export interface LabelData {
  result: "pass" | "fail"; business: string; licence: string | null; phone: string | null; owner: string | null;
  code: string; item: string; tested: string; nextDue: string | null; tester: string | null; url: string | null;
}

/** ZPL text can't hold ^ or ~ (commands); keep it readable ASCII. */
const zt = (s: string | null | undefined, max: number) => String(s ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/[\^~\\]/g, " ").trim().slice(0, max);
const dmy = (iso: string | null) => (iso && isDate(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "-");

/** One label: big PASS / FAIL, business, asset, item, tested and next-due dates, tester, QR to the asset's record. */
export function labelZpl(d: LabelData, p: PrinterProfile = DEFAULT_PROFILE): string {
  const dpmm = p.dpi === 300 ? 12 : 8; // Zebra: 8 dots/mm at 203 dpi, 12 at 300
  const W = Math.round(p.widthMm * dpmm), H = Math.round(p.heightMm * dpmm);
  const s = Math.min(W / 800, H / 400);
  const X = (v: number) => Math.round(v * (W / 800)), Y = (v: number) => Math.round(v * (H / 400)), F = (v: number) => Math.max(14, Math.round(v * s));
  const qr = Math.max(2, Math.min(10, Math.round(5 * s)));
  const pass = d.result === "pass";
  const lines: string[] = ["^XA", "^CI28", `^PW${W}`, `^LL${H}`, "^LH0,0"];
  if (p.rotate) lines.push("^POI");
  if (p.darkness != null) lines.push(`~SD${String(Math.round(p.darkness)).padStart(2, "0")}`);
  lines.push(`^FO${X(14)},${Y(14)}^GB${X(772)},${Y(372)},${Math.max(3, Math.round(4 * s))}^FS`);
  if (pass) {
    lines.push(`^FO${X(30)},${Y(28)}^A0N,${F(66)},${F(66)}^FDTESTED^FS`);
    lines.push(`^FO${X(330)},${Y(30)}^GB${X(150)},${Y(62)},${Y(62)}^FS`, `^FO${X(345)},${Y(38)}^A0N,${F(50)},${F(50)}^FR^FDPASS^FS`);
  } else {
    lines.push(`^FO${X(30)},${Y(24)}^GB${X(500)},${Y(76)},${Y(76)}^FS`, `^FO${X(44)},${Y(32)}^A0N,${F(64)},${F(64)}^FR^FDFAIL - DO NOT USE^FS`);
  }
  let y = 112;
  const row = (label: string, value: string, size = 27) => { lines.push(`^FO${X(30)},${Y(y)}^A0N,${F(size)},${F(size)}^FD${label}${value}^FS`); y += Math.round(size * 1.32); };
  row("Asset: ", zt(d.code, 24), 30);
  row("", zt(d.item, 34));
  if (d.owner) row("", zt(d.owner, 34), 24);
  row("Tested: ", dmy(d.tested));
  if (pass) row("Next test due: ", dmy(d.nextDue), 30);
  else row("Reason: see test record", "", 24);
  if (d.tester) row("By: ", zt(d.tester, 28), 24);
  const foot = [zt(d.business, 32), d.licence ? `Lic ${zt(d.licence, 16)}` : "", d.phone ? zt(d.phone, 16) : ""].filter(Boolean).join("  ");
  lines.push(`^FO${X(30)},${Y(352)}^A0N,${F(20)},${F(20)}^FD${foot}^FS`);
  if (d.url) lines.push(`^FO${X(590)},${Y(108)}^BQN,2,${qr}^FDLA,${d.url.replace(/[\^~]/g, "")}^FS`, `^FO${X(596)},${Y(326)}^A0N,${F(18)},${F(18)}^FDScan for record^FS`);
  lines.push("^PQ1", "^XZ");
  return lines.join("\n");
}

/** A test label to check the printer, size and orientation. */
export function testZpl(p: PrinterProfile = DEFAULT_PROFILE, business = "EventureOS"): string {
  return labelZpl({ result: "pass", business, licence: null, phone: null, owner: "Printer test", code: "TEST-000000", item: `${p.widthMm} x ${p.heightMm} mm at ${p.dpi} dpi`, tested: new Date().toISOString().slice(0, 10), nextDue: null, tester: null, url: null }, p);
}
