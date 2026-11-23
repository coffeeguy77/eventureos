/**
 * Customers changing their own quote on the quote link: more or fewer of the catering and drinks (hot and cold),
 * taking those lines off, adding catering from the price list, add-ons like a fully branded cart, and — on a one-day
 * job — the barista hours and a second cart. Travel and delivery stay as the business set them.
 * Pure — used by the quote link page, its save action and tests.
 */

import { zonedTimeUTC } from "@/lib/format";
import type { StaffRule } from "@/lib/pricing/engine";
import { longDay, staffLine, type StaffDetails, type TravelDetails } from "./line-helpers";
import { withHireDays } from "@/lib/events/days";

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
export function cleanChange(raw: unknown, lines: EditLine[], services: EditService[], perServe: Set<string>, staffEdit: StaffEdit | null = null, today: string | null = null): CustomerChange {
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
    staff = cleanStaffChange(r.staff, staffEdit, today);
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

/* ── Barista days, hours and carts ──────────────────────────────────────────────────────────────────── */

/** One day of the job as quoted. */
export interface StaffEditDay { date: string | null; start: string; end: string; setup_minutes: number; team: number; extra: { start: string; end: string }[] }

/** What the quote link needs to let the customer change the staff days, hours and carts. */
export interface StaffEdit {
  lineId: string;
  /** The hire line (the cart / van) — its days follow the barista days */
  hireLineId: string | null;
  hirePrice: number; hireTax: number; staffPrice: number; staffTax: number;
  /** The hire is charged per day (and per cart): adding or removing a day changes it */
  hirePerDay: boolean;
  /** Another cart can be added (no travel; the business prices a van driving out) */
  canAddCart: boolean;
  /** The quote's travel line: return trips follow the days */
  travel: { lineId: string; price: number; tax: number; km: number; tripsPerDay: number; from: string | null; details: TravelDetails } | null;
  days: StaffEditDay[];
  carts: number;
  rule: StaffRule;
  /** "barista" */
  label: string;
  /** "cart" / "van" */
  unitWord: string;
  details: StaffDetails;
  maxDays: number;
}
export interface StaffChangeDay { date: string | null; start: string; end: string; team: number; extra: { start: string; end: string }[] }
export interface StaffChange { days: StaffChangeDay[]; carts: number }

const MAX_TEAM = 8;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const mins = (t: string) => { const m = TIME.exec(t)!; return Number(m[1]) * 60 + Number(m[2]); };
const pad = (t: string) => t.padStart(5, "0");
export const shiftDate = (iso: string, n: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Move every day together so day `i` lands on `date` (Day 2 → 5 Apr puts Day 1 on 4 Apr). */
export function moveDays<T extends { date: string | null }>(days: T[], i: number, date: string): T[] {
  const was = days[i]?.date;
  if (!ISO.test(date)) return days;
  if (!was) return days.map((d, k) => ({ ...d, date: shiftDate(date, k - i) }));
  const by = daysBetween(was, date);
  return days.map((d, k) => ({ ...d, date: d.date ? shiftDate(d.date, by) : shiftDate(date, k - i) }));
}

/** Another day after the last one: same hours and team, the next date. */
export function addDay(days: StaffChangeDay[]): StaffChangeDay[] {
  const last = days[days.length - 1];
  return [...days, { ...last, extra: last.extra.map((x) => ({ ...x })), date: last.date ? shiftDate(last.date, 1) : null }];
}

/** Check the change from the browser. Null when nothing changed. Throws a plain-English message. */
export function cleanStaffChange(raw: unknown, e: StaffEdit, today: string | null = null): StaffChange | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawDays = Array.isArray(r.days) ? r.days : [];
  if (!rawDays.length) throw new Error(`Keep at least one day — or contact us to cancel.`);
  if (rawDays.length > e.maxDays) throw new Error(`For more than ${e.maxDays} days, contact us and we'll quote it.`);
  const carts = Number(r.carts ?? e.carts);
  if (![e.carts, ...(e.canAddCart && e.carts === 1 ? [2] : [])].includes(carts)) throw new Error("That setup isn't available — refresh the page and try again.");
  const time = (v: unknown, what: string) => { const t = String(v ?? "").trim(); if (!TIME.test(t)) throw new Error(`Choose a ${what} time, like 8:00 am.`); return pad(t); };
  const span = (start: string, end: string, which: string) => {
    const len = mins(end) - mins(start);
    if (len <= 0) throw new Error(`The finish time needs to be after the start time${which}.`);
    if (len < 30) throw new Error(`Service needs to run for at least 30 minutes${which}.`);
    if (len > 16 * 60) throw new Error("That's a very long day — contact us and we'll work out the staffing with you.");
  };
  const days = rawDays.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const which = rawDays.length > 1 ? ` (day ${i + 1})` : "";
    const start = time(o.start, "start"), end = time(o.end, "finish");
    span(start, end, which);
    const date = typeof o.date === "string" && ISO.test(o.date) ? o.date : null;
    if (date && today && date < today) throw new Error(`Day ${i + 1} is in the past — choose a date from today on.`);
    const team = Math.round(Number(o.team ?? carts));
    if (!Number.isInteger(team) || team < carts || team > MAX_TEAM) throw new Error(`Choose ${carts > 1 ? `at least ${carts} ${e.label}s (one per ${e.unitWord})` : `1 to ${MAX_TEAM} ${e.label}s`}${which}.`);
    const extra = (Array.isArray(o.extra) ? o.extra : []).slice(0, MAX_TEAM).map((y) => {
      const q = (y ?? {}) as Record<string, unknown>;
      const s2 = time(q.start, "start"), e2 = time(q.end, "finish");
      span(s2, e2, which);
      return { start: s2, end: e2 };
    });
    if (team + extra.length > MAX_TEAM) throw new Error(`For more than ${MAX_TEAM} ${e.label}s a day, contact us.`);
    return { date, start, end, team, extra };
  });
  const dates = days.map((d) => d.date).filter(Boolean) as string[];
  if (new Set(dates).size !== dates.length) throw new Error("Two days have the same date — choose different dates.");
  const same = days.length === e.days.length && carts === e.carts && days.every((d, i) => {
    const w = e.days[i];
    return d.date === w.date && d.start === pad(w.start) && d.end === pad(w.end) && d.team === w.team && JSON.stringify(d.extra) === JSON.stringify(w.extra.map((x) => ({ start: pad(x.start), end: pad(x.end) })));
  });
  return same ? null : { days, carts };
}

/** The staff line's new details, quantity (hours charged) and description — the minimum shift still applies to everyone. */
export function staffChangeLine(e: StaffEdit, c: StaffChange) {
  const base = e.details.days?.length ? e.details.days : [];
  const notes: string[] = [];
  const days = c.days.map((d, i) => {
    const even = d.team % c.carts === 0;
    if (!even) notes.push(`${d.date ? longDay(d.date) : `Day ${i + 1}`}: ${d.team} ${e.label}s across ${c.carts} ${e.unitWord}s`);
    const { extra: _x, ...b } = (base[i] ?? base[base.length - 1] ?? {}) as unknown as Record<string, unknown>; void _x;
    return { ...b, date: d.date, start: d.start, end: d.end, setup_minutes: e.days[Math.min(i, e.days.length - 1)].setup_minutes,
      units: even ? c.carts : 1, per_unit: even ? d.team / c.carts : d.team, ...(d.extra.length ? { extra: d.extra } : {}) } as StaffDetails["days"][number];
  });
  const details: StaffDetails = { ...e.details, kind: "staff", days, unit_label: e.unitWord };
  const calc = staffLine(details, e.rule, e.label);
  if (!calc) throw new Error("Choose a start and finish time.");
  return { details, quantity: calc.quantity, description: notes.length ? `${calc.description}\n${notes.join("\n")}` : calc.description, perDay: calc.days };
}

/** The new hire and travel quantities. */
export function hireAndTravel(e: StaffEdit, c: StaffChange, hireQuoted: number) {
  const hire = e.hirePerDay ? c.days.length * c.carts : hireQuoted + (c.carts - e.carts);
  const trips = e.travel ? Math.max(1, Math.round(e.travel.tripsPerDay * c.days.length)) : 0;
  return { hire, trips, km: e.travel ? Math.round(e.travel.km * 2 * trips * 10) / 10 : 0 };
}

/** Running totals for the screen. */
export function staffQuote(e: StaffEdit, c: StaffChange, hireQuoted: number) {
  const l = staffChangeLine(e, c);
  const ht = hireAndTravel(e, c, hireQuoted);
  return { hours: l.quantity, perDay: l.perDay, hire: ht.hire, km: ht.km, trips: ht.trips };
}

const tf = (t: string) => { const m = mins(t); const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
export function staffChangeText(e: StaffEdit, c: StaffChange) {
  const w = (n: number, x: string) => `${n} ${x}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (c.days.length !== e.days.length) parts.push(`${w(e.days.length, "day")} → ${w(c.days.length, "day")}`);
  const dates = (ds: { date: string | null }[]) => ds.map((d) => d.date).filter(Boolean).join(",");
  if (dates(c.days) !== dates(e.days) && c.days.some((d) => d.date)) parts.push(`dates ${c.days.map((d) => (d.date ? longDay(d.date) : "?")).join(", ")}`);
  c.days.forEach((d, i) => {
    const was = e.days[i];
    const tag = c.days.length > 1 ? ` day ${i + 1}` : "";
    if (was && (d.start !== pad(was.start) || d.end !== pad(was.end))) parts.push(`${e.label} hours${tag} ${tf(was.start)}–${tf(was.end)} → ${tf(d.start)}–${tf(d.end)}`);
    const n = d.team + d.extra.length, wn = was ? was.team + was.extra.length : 0;
    if (was && n !== wn) parts.push(`${e.label}s${tag} ${wn} → ${n}${d.extra.length ? ` (${d.extra.map((x) => `${tf(x.start)}–${tf(x.end)}`).join(", ")})` : ""}`);
  });
  if (c.carts !== e.carts) parts.push(`${w(e.carts, e.unitWord)} → ${w(c.carts, e.unitWord)}`);
  return parts.join("; ");
}

/** The hire line's wording: the days hired, and a second cart (no extra delivery). */
export const secondNote = (unitWord: string) => `Includes a second ${unitWord} — no extra delivery charge.`;
export function hireDescription(description: string | null, extra: boolean, unitWord: string, dates: string[] = []) {
  let base = (description ?? "").split("\n").filter((l) => !/^Includes a second \w+ — no extra delivery charge\.$/.test(l.trim())).join("\n").trim();
  base = withHireDays(base, dates.map((date) => ({ date }))).description.trim();
  return extra ? (base ? `${base}\n${secondNote(unitWord)}` : secondNote(unitWord)) : base || null;
}
