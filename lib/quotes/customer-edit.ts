/**
 * Customers changing their own quote on the quote link: more or fewer of the catering and drinks (hot and cold),
 * taking those lines off, adding catering from the price list, add-ons like a fully branded cart, and — on a one-day
 * job — the barista hours and a second cart. Travel and delivery stay as the business set them.
 * Pure — used by the quote link page, its save action and tests.
 */

import { zonedTimeUTC } from "@/lib/format";
import type { StaffRule } from "@/lib/pricing/engine";
import { staffLine, type StaffDetails } from "./line-helpers";

export interface EditLine {
  id: string; name: string; quantity: number; unit: string | null; unit_price: number; tax_rate: number;
  service_id: string | null; details: { kind?: string } | null; is_optional: boolean; section_id: string;
  category: string | null;
}
export interface EditService { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number; category: string | null }
export interface CustomerChange {
  set: { id: string; quantity: number; hot?: number; cold?: number }[]; remove: string[]; add: { service_id: string; quantity: number }[];
  /** New barista hours / carts on a one-day job */
  staff?: StaffChange | null;
}

export const MAX_QTY = 10000;
/** Catering from the price list ("Catering · Breakfast", "Catering · Lunch", …). */
export const isCatering = (category: string | null | undefined) => /^catering\b/i.test((category ?? "").trim());
/** Supplies for do-it-yourself equipment hire ("Coffee supplies (DIY)", "Supplies …") — e.g. coffee beans by the kg. */
export const isSupplies = (category: string | null | undefined) => /^(coffee\s+)?supplies\b/i.test((category ?? "").trim());
/** Equipment hire on the quote ("Coffee equipment (DIY)") — supplies can be added to those quotes. */
export const isEquipment = (category: string | null | undefined) => /equipment/i.test(category ?? "");

/** Can the customer change (or take off) this line? Catering and per-drink lines only. */
export function customerCanChange(l: Pick<EditLine, "service_id" | "details" | "category">, perServe: Set<string>): boolean {
  if (l.details?.kind === "staff" || l.details?.kind === "travel") return false;
  if (!l.service_id) return false;
  return isCatering(l.category) || isSupplies(l.category) || perServe.has(l.service_id) || l.details?.kind === "serves";
}

/**
 * Add-ons offered on the quote link: one-off "Branding" items on the price list with a price (e.g. a cart wrap &
 * signage). Per-item things like cup stickers aren't offered — they need a number worked out with the business.
 */
export const isUpsell = (s: Pick<EditService, "category" | "unit" | "unit_price">) =>
  /^branding\b/i.test((s.category ?? "").trim()) && Number(s.unit_price) > 0 && !/^(each|cup|person|unit)s?$/i.test((s.unit ?? "").trim());

/** What they can add: the catering on the price list, and — on equipment-hire quotes — the supplies. */
export const customerCatalogue = (services: EditService[], opts: { supplies?: boolean } = {}) =>
  services.filter((s) => isCatering(s.category) || (opts.supplies && isSupplies(s.category)));

const qty = (v: unknown, what: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_QTY) throw new Error(`${what}: choose a number from 1 to ${MAX_QTY.toLocaleString("en-AU")}.`);
  return n;
};

/** Check a change from the browser against the quote. Throws a plain-English message. Merges adds into existing lines. */
export function cleanChange(raw: unknown, lines: EditLine[], services: EditService[], perServe: Set<string>, staffEdit: StaffEdit | null = null): CustomerChange {
  const r = (raw ?? {}) as Record<string, unknown>;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const canEdit = (id: string) => { const l = byId.get(id); if (!l || !customerCanChange(l, perServe)) throw new Error("That line can't be changed here — contact us and we'll update it."); return l; };
  const remove = [...new Set((Array.isArray(r.remove) ? r.remove : []).map(String))];
  remove.forEach(canEdit);
  const setMap = new Map<string, number>();
  const split = new Map<string, { hot: number; cold: number }>();
  for (const x of Array.isArray(r.set) ? r.set : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const l = canEdit(String(o.id));
    if (remove.includes(l.id)) continue;
    // Drinks: hot and cold chosen separately
    if (l.details?.kind === "serves" && (o.hot !== undefined || o.cold !== undefined)) {
      const part = (v: unknown, what: string) => { const n = Number(v ?? 0); if (!Number.isInteger(n) || n < 0 || n > MAX_QTY) throw new Error(`${what}: choose a number from 0 to ${MAX_QTY.toLocaleString("en-AU")}.`); return n; };
      const hot = part(o.hot, "Hot drinks"), cold = part(o.cold, "Cold drinks");
      if (hot + cold < 1) throw new Error("Choose at least one drink — or take the drinks off.");
      if (hot + cold > MAX_QTY) throw new Error(`Drinks: choose up to ${MAX_QTY.toLocaleString("en-AU")} in total.`);
      const was = l.details as { hot?: number; cold?: number };
      if (hot + cold !== Number(l.quantity) || hot !== Math.round(Number(was.hot ?? l.quantity)) || cold !== Math.round(Number(was.cold ?? 0))) {
        setMap.set(l.id, hot + cold); split.set(l.id, { hot, cold });
      }
      continue;
    }
    const n = qty(o.quantity, l.name);
    if (n !== Number(l.quantity)) setMap.set(l.id, n);
  }
  // (the caller passes only what this quote may add — supplies only on equipment-hire quotes)
  const catalogue = new Map(customerCatalogue(services, { supplies: true }).map((s) => [s.id, s]));
  const upsells = new Map(services.filter(isUpsell).map((s) => [s.id, s]));
  const add: CustomerChange["add"] = [];
  for (const x of Array.isArray(r.add) ? r.add : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const up = upsells.get(String(o.service_id));
    if (up) {
      // an add-on: one of it, once
      if (lines.some((l) => l.service_id === up.id && !remove.includes(l.id)) || add.some((a) => a.service_id === up.id)) continue;
      add.push({ service_id: up.id, quantity: 1 });
      continue;
    }
    const s = catalogue.get(String(o.service_id));
    if (!s) throw new Error("That item isn't available to add — refresh the page and try again.");
    const n = qty(o.quantity, s.name);
    // Already on the quote (and not being taken off): change its quantity instead of adding a second line
    const have = lines.find((l) => l.service_id === s.id && !l.is_optional && !remove.includes(l.id));
    if (have) setMap.set(have.id, Math.min(MAX_QTY, (setMap.get(have.id) ?? Number(have.quantity)) + n));
    else {
      const prev = add.find((a) => a.service_id === s.id);
      if (prev) prev.quantity = Math.min(MAX_QTY, prev.quantity + n); else add.push({ service_id: s.id, quantity: n });
    }
  }
  if (add.length > 30) throw new Error("That's a lot of new items at once — add up to 30, or contact us.");
  let staff: StaffChange | null = null;
  if (r.staff != null) {
    if (!staffEdit) throw new Error("The barista hours can't be changed here — contact us and we'll update them.");
    staff = cleanStaffChange(r.staff, staffEdit);
  }
  const out: CustomerChange = { set: [...setMap.entries()].map(([id, quantity]) => ({ id, quantity, ...(split.get(id) ?? {}) })), remove, add, ...(staff ? { staff } : {}) };
  if (!out.set.length && !out.remove.length && !out.add.length && !staff) throw new Error("Nothing has changed.");
  const left = lines.filter((l) => !remove.includes(l.id)).length + add.length;
  if (left === 0) throw new Error("That would leave nothing on the quote — decline it instead, or contact us.");
  return out;
}

/** "added 40 × Lunch – Wraps; Muffins 60 → 80; took off Granola" */
export function changeText(c: CustomerChange, lines: EditLine[], services: EditService[], staffEdit: StaffEdit | null = null) {
  const name = (id: string) => lines.find((l) => l.id === id)?.name ?? "item";
  const drinks = (h: number, k: number) => (k ? `${h} hot + ${k} cold` : `${h} hot`);
  const parts = [
    ...(c.staff && staffEdit ? [staffChangeText(staffEdit, c.staff)] : []),
    ...c.add.map((a) => `added ${a.quantity} × ${services.find((s) => s.id === a.service_id)?.name ?? "item"}`),
    ...c.set.map((s) => {
      const l = lines.find((x) => x.id === s.id);
      if (s.hot !== undefined && l?.details?.kind === "serves") {
        const w = l.details as { hot?: number; cold?: number };
        return `${name(s.id)} ${drinks(Math.round(Number(w.hot ?? l.quantity)), Math.round(Number(w.cold ?? 0)))} → ${drinks(s.hot, s.cold ?? 0)}`;
      }
      return `${name(s.id)} ${Number(l?.quantity ?? 0)} → ${s.quantity}`;
    }),
    ...c.remove.map((id) => `took off ${name(id)}`),
  ];
  return parts.join("; ");
}

/** A drinks line's first description line ("120 Hot drinks") follows a new quantity; the rest of the wording stays. */
export function servesDescription(description: string | null, hot: number, cold: number) {
  const head = cold ? `${hot} Hot + ${cold} Cold drinks` : `${hot} Hot drinks`;
  const d = description ?? "";
  return /^\d+ Hot( \+ \d+ Cold)? drinks/.test(d) ? d.replace(/^\d+ Hot( \+ \d+ Cold)? drinks/, head) : d;
}

/** Customers can't change catering on their quote link within this many hours of the event starting (the office still can). */
export const CATERING_LOCK_HOURS = 48;

/**
 * Is catering locked for the customer? True from 48 hours before the event starts (event date + start time in the
 * business's timezone; with no start time, from midnight at the start of the event day).
 */
export function cateringLocked(eventDate: string | null, startTime: string | null, tz: string, now: Date = new Date()): boolean {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false;
  const time = startTime && /^\d{1,2}:\d{2}/.test(startTime) ? startTime.slice(0, 5).padStart(5, "0") : "00:00";
  const starts = Date.parse(zonedTimeUTC(eventDate, time, tz));
  return starts - now.getTime() < CATERING_LOCK_HOURS * 3_600_000;
}

/* ── Barista hours and carts (one-day jobs) ─────────────────────────────────────────────────────────────── */

/** A way to run the job: how many carts, and how many baristas in total. */
export interface StaffSetup { carts: number; staff: number }

/** What the quote link needs to let the customer change the barista hours and carts. */
export interface StaffEdit {
  lineId: string;
  /** The hire line (the cart), when a second cart can be added */
  hireLineId: string | null;
  hirePrice: number; hireTax: number; staffPrice: number; staffTax: number;
  /** As quoted */
  start: string; end: string; carts: number; staff: number;
  setup_minutes: number;
  /** The job's day (the event date when the line had none) */
  date: string | null;
  rule: StaffRule;
  label: string;
  details: StaffDetails;
  options: StaffSetup[];
}
export interface StaffChange { start: string; end: string; carts: number; staff: number }

const MAX_STAFF = 8;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const mins = (t: string) => { const m = TIME.exec(t)!; return Number(m[1]) * 60 + Number(m[2]); };
const pad = (t: string) => t.padStart(5, "0");

/**
 * The setups on offer, starting with the quoted one. With one cart quoted (and a hire line to add to): a second cart
 * with the same team split one per cart, or with 1 or 2 extra baristas. More than one cart quoted: hours only.
 */
export function staffOptions(carts: number, staff: number, canAddCart: boolean): StaffSetup[] {
  const out: StaffSetup[] = [{ carts, staff }];
  if (carts === 1 && canAddCart) {
    if (staff >= 2) out.push({ carts: 2, staff });
    for (const extra of [1, 2]) if (staff + extra <= MAX_STAFF) out.push({ carts: 2, staff: staff + extra });
  }
  return out.filter((o, i) => out.findIndex((x) => x.carts === o.carts && x.staff === o.staff) === i);
}

/** Check new hours and setup from the browser. Null when nothing changed. Throws a plain-English message. */
export function cleanStaffChange(raw: unknown, e: StaffEdit): StaffChange | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const start = String(r.start ?? "").trim(), end = String(r.end ?? "").trim();
  if (!TIME.test(start) || !TIME.test(end)) throw new Error("Choose a start and finish time, like 8:00 am.");
  const len = mins(end) - mins(start);
  if (len <= 0) throw new Error("The finish time needs to be after the start time.");
  if (len < 30) throw new Error("Service needs to run for at least 30 minutes.");
  if (len > 16 * 60) throw new Error("That's a very long day — contact us and we'll work out the staffing with you.");
  const carts = Number(r.carts ?? e.carts), staff = Number(r.staff ?? e.staff);
  if (!e.options.some((o) => o.carts === carts && o.staff === staff)) throw new Error("That setup isn't available — refresh the page and try again.");
  const c = { start: pad(start), end: pad(end), carts, staff };
  if (c.start === pad(e.start) && c.end === pad(e.end) && carts === e.carts && staff === e.staff) return null;
  return c;
}

/** The staff line's new details, quantity (hours charged) and description — the minimum hours still apply. */
export function staffChangeLine(e: StaffEdit, c: StaffChange) {
  const even = c.staff % c.carts === 0;
  const day = { ...e.details.days[0], date: e.date, start: c.start, end: c.end, setup_minutes: e.setup_minutes,
    units: even ? c.carts : 1, per_unit: even ? c.staff / c.carts : c.staff };
  const details: StaffDetails = { ...e.details, kind: "staff", days: [day] };
  const calc = staffLine(details, e.rule, e.label);
  if (!calc) throw new Error("Choose a start and finish time.");
  const word = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const description = !even ? `${calc.description}\n${word(c.carts, "cart")} · ${word(c.staff, e.label)} between them` : calc.description;
  return { details, quantity: calc.quantity, description, perPerson: calc.days[0]?.each ?? [] };
}

/** Hours charged for each person under the rule (e.g. a 2-hour service still charges the 3-hour minimum). */
export const staffQuote = (e: StaffEdit, c: StaffChange) => {
  const l = staffChangeLine(e, c);
  return { hours: l.quantity, each: l.perPerson, staffCost: l.quantity * e.staffPrice, cartCost: (c.carts - e.carts) * e.hirePrice };
};

const tf = (t: string) => { const m = mins(t); const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
export function staffChangeText(e: StaffEdit, c: StaffChange) {
  const parts: string[] = [];
  if (pad(c.start) !== pad(e.start) || pad(c.end) !== pad(e.end)) parts.push(`${e.label} hours ${tf(e.start)}–${tf(e.end)} → ${tf(c.start)}–${tf(c.end)}`);
  if (c.carts !== e.carts || c.staff !== e.staff) parts.push(`${e.carts} cart${e.carts === 1 ? "" : "s"} / ${e.staff} ${e.label}${e.staff === 1 ? "" : "s"} → ${c.carts} cart${c.carts === 1 ? "" : "s"} / ${c.staff} ${e.label}${c.staff === 1 ? "" : "s"}`);
  return parts.join("; ");
}

/** The hire line's wording for a second cart (no extra delivery). */
export const SECOND_CART_NOTE = "Includes a second cart — no extra delivery charge.";
export function hireDescription(description: string | null, carts: number) {
  const base = (description ?? "").split("\n").filter((l) => l.trim() !== SECOND_CART_NOTE).join("\n").trim();
  return carts > 1 ? (base ? `${base}\n${SECOND_CART_NOTE}` : SECOND_CART_NOTE) : base || null;
}
