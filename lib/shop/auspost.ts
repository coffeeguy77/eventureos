/**
 * Australia Post MyPost Business: the bulk order import file (CSV) and tracking numbers.
 * MyPost Business only gives API access through its approved partner apps, so labels are made by uploading this file
 * in MyPost Business (Import CSV), printing the labels there, and pasting the tracking numbers back.
 * Column names are exactly those in Australia Post's domestic order-import template.
 * Pure — no database. Settings: organisations.settings.auspost.
 */
import { gramsOf } from "./core";

export const MYPOST_HEADERS = [
  "Additional Label Information 1", "Send From Name", "Send From Business Name", "Send From Address Line 1", "Send From Address Line 2", "Send From Address Line 3",
  "Send From Suburb", "Send From State", "Send From Postcode", "Send From Phone Number", "Send From Email Address",
  "Deliver To Name", "Deliver To Business Name", "Deliver To Address Line 1", "Deliver To Address Line 2", "Deliver To Address Line 3",
  "Deliver To Suburb", "Deliver To State", "Deliver To Postcode", "Deliver To Phone Number", "Deliver To Email Address",
  "Item Packaging Type", "Item Delivery Service", "Item Description", "Item Length", "Item Width", "Item Height", "Item Weight",
  "Item Dangerous Goods Flag", "Schedule 8 or medicinal cannabis", "Signature On Delivery", "Extra Cover Amount",
] as const;

export const PACKAGING = [
  { id: "OWN_PACKAGING", label: "Own packaging (enter size)", maxKg: 22 },
  { id: "AP_SATCHEL_XS", label: "Satchel — extra small", maxKg: 5 }, { id: "AP_SATCHEL_S", label: "Satchel — small", maxKg: 5 },
  { id: "AP_SATCHEL_M", label: "Satchel — medium", maxKg: 5 }, { id: "AP_SATCHEL_L", label: "Satchel — large", maxKg: 5 }, { id: "AP_SATCHEL_XL", label: "Satchel — extra large", maxKg: 5 },
  { id: "AP_BOX_S", label: "Box — small", maxKg: 5 }, { id: "AP_BOX_M", label: "Box — medium", maxKg: 5 }, { id: "AP_BOX_L", label: "Box — large", maxKg: 5 }, { id: "AP_BOX_XL", label: "Box — extra large", maxKg: 5 },
] as const;
export type PackagingId = (typeof PACKAGING)[number]["id"];
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export interface SendFrom { name: string; business: string; line1: string; line2: string; suburb: string; state: string; postcode: string; phone: string; email: string }
export interface AusPostSettings {
  from: SendFrom;
  packaging: PackagingId; length: number | null; width: number | null; height: number | null;
  service: "PP" | "EXP";
  /** Added to the coffee's weight for the box / satchel and packing */
  packingGrams: number;
  signature: boolean;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dim = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 105 ? Math.round(n * 10) / 10 : null; };

export function readAusPost(settings: unknown): AusPostSettings {
  const r = (((settings ?? {}) as Record<string, unknown>).auspost ?? {}) as Record<string, unknown>;
  const f = (r.from ?? {}) as Record<string, unknown>;
  const state = str(f.state, 3).toUpperCase();
  const pk = PACKAGING.find((p) => p.id === r.packaging)?.id ?? "AP_SATCHEL_S";
  const g = Number(r.packingGrams);
  return {
    from: { name: str(f.name, 35), business: str(f.business, 40), line1: str(f.line1, 40), line2: str(f.line2, 40), suburb: str(f.suburb, 30), state: STATES.includes(state) ? state : "", postcode: /^\d{4}$/.test(str(f.postcode, 4)) ? str(f.postcode, 4) : "", phone: str(f.phone, 20).replace(/[^\d]/g, "").slice(0, 10), email: str(f.email, 50) },
    packaging: pk, length: dim(r.length), width: dim(r.width), height: dim(r.height),
    service: r.service === "EXP" ? "EXP" : "PP",
    packingGrams: Number.isFinite(g) && g >= 0 && g <= 5000 ? Math.round(g) : 150,
    signature: r.signature === true,
  };
}

/** What's missing before a file can be made (plain English). */
export function settingsProblems(s: AusPostSettings): string[] {
  const p: string[] = [];
  if (!s.from.name || !s.from.line1 || !s.from.suburb || !s.from.state || !s.from.postcode) p.push("Add your send-from name and address (Shop → Settings → Australia Post).");
  if (s.packaging === "OWN_PACKAGING" && !(s.length && s.width && s.height)) p.push("Own packaging needs its length, width and height.");
  return p;
}

export interface ShipItem { name: string; variant: string; qty: number }
export interface ShipOrder { id: string; number: number; name: string | null; email: string | null; phone: string | null; address: Record<string, unknown>; items: ShipItem[] }
export interface ShipLine { packaging: PackagingId; service: "PP" | "EXP"; weightKg: number; length: number | null; width: number | null; height: number | null }

/** Parcel weight: each bag's size × quantity, plus the packing allowance. null when a bag size can't be read. */
export function parcelWeightKg(items: ShipItem[], packingGrams: number): number | null {
  let g = 0;
  for (const i of items) {
    const each = gramsOf(i.variant ?? "") ?? gramsOf((i.name.match(/(\d+(?:\.\d+)?\s*(?:kg|g))\b/i)?.[1] ?? "").replace(/\s/g, ""));
    if (each == null) return null;
    g += each * Math.max(1, Math.round(i.qty));
  }
  return Math.round((g + packingGrams) / 10) / 100;
}

/** Why this order can't go in the file yet. */
export function orderProblems(o: ShipOrder, line: ShipLine): string[] {
  const a = o.address as Record<string, string | undefined>;
  const p: string[] = [];
  if (!a.line1 || !a.suburb) p.push("no street address");
  if (!STATES.includes(String(a.state ?? "").toUpperCase())) p.push("state isn't an Australian state");
  if (!/^\d{4}$/.test(String(a.postcode ?? ""))) p.push(`postcode "${a.postcode ?? ""}" isn't 4 digits`);
  const max = PACKAGING.find((x) => x.id === line.packaging)?.maxKg ?? 22;
  if (!(line.weightKg > 0)) p.push("no weight");
  else if (line.weightKg > max) p.push(`${line.weightKg} kg is over ${max} kg for this packaging`);
  if (line.packaging === "OWN_PACKAGING" && !(line.length && line.width && line.height)) p.push("own packaging needs a size");
  return p;
}

const cut = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const digits = (s: unknown, n: number) => String(s ?? "").replace(/^\+61/, "0").replace(/\D/g, "").slice(0, n);

/** One row of the import file for an order. */
export function mypostRow(o: ShipOrder, line: ShipLine, s: AusPostSettings): string[] {
  const a = o.address as Record<string, string | undefined>;
  const phone = digits(a.phone ?? o.phone, 20);
  const desc = o.items.map((i) => `${i.qty}x ${i.name.split("|")[0].trim()}${i.variant ? ` ${i.variant}` : ""}`).join("; ");
  const own = line.packaging === "OWN_PACKAGING";
  const v: Record<(typeof MYPOST_HEADERS)[number], string> = {
    "Additional Label Information 1": cut(`Order #${o.number}`, 50),
    "Send From Name": cut(s.from.name, 35), "Send From Business Name": cut(s.from.business, 40), "Send From Address Line 1": cut(s.from.line1, 40), "Send From Address Line 2": cut(s.from.line2, 40), "Send From Address Line 3": "",
    "Send From Suburb": cut(s.from.suburb, 30), "Send From State": s.from.state, "Send From Postcode": s.from.postcode, "Send From Phone Number": digits(s.from.phone, 10), "Send From Email Address": cut(s.from.email, 50),
    "Deliver To Name": cut(a.name || o.name, 35), "Deliver To Business Name": cut(a.company, 40), "Deliver To Address Line 1": cut(a.line1, 40), "Deliver To Address Line 2": cut(a.line2, 40), "Deliver To Address Line 3": "",
    "Deliver To Suburb": cut(a.suburb, 40), "Deliver To State": String(a.state ?? "").toUpperCase(), "Deliver To Postcode": String(a.postcode ?? ""),
    "Deliver To Phone Number": phone.length >= 10 ? phone : "", "Deliver To Email Address": cut(o.email, 50),
    "Item Packaging Type": line.packaging, "Item Delivery Service": line.service, "Item Description": cut(desc, 50),
    "Item Length": own && line.length ? String(line.length) : "", "Item Width": own && line.width ? String(line.width) : "", "Item Height": own && line.height ? String(line.height) : "",
    "Item Weight": String(line.weightKg), "Item Dangerous Goods Flag": "NO", "Schedule 8 or medicinal cannabis": "NO", "Signature On Delivery": s.signature ? "YES" : "NO", "Extra Cover Amount": "",
  };
  return MYPOST_HEADERS.map((h) => v[h]);
}

/** CSV text (header row first). Fields with quotes, commas or line breaks are quoted. */
export function toCsv(rows: string[][]) {
  const q = (x: string) => (/[",\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  return [MYPOST_HEADERS as readonly string[], ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

/**
 * Tracking numbers pasted back (from MyPost Business or typed): each line has an order number and a tracking number,
 * in any order, separated by spaces, tabs or commas. Only order numbers in `known` count.
 */
export function readTrackingPaste(text: string, known: number[]): { number: number; tracking: string }[] {
  const set = new Set(known);
  const out = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.split(/[\s,;|"]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    const num = tokens.map((t) => Number(t.replace(/^order/i, ""))).find((n) => Number.isInteger(n) && set.has(n));
    if (!num) continue;
    const tracking = tokens.find((t) => /^[A-Z0-9]{10,40}$/i.test(t) && /[A-Z]/i.test(t) && Number(t) !== num) ?? tokens.find((t) => /^\d{12,40}$/.test(t));
    if (tracking) out.set(num, tracking.toUpperCase());
  }
  return [...out.entries()].map(([number, tracking]) => ({ number, tracking }));
}

export const trackingUrl = (n: string) => `https://auspost.com.au/mypost/track/details/${encodeURIComponent(n)}`;
