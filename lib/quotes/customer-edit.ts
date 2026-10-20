/**
 * Customers changing their own quote on the quote link: more or fewer of the catering and drinks, taking those lines
 * off, and adding catering from the price list. Hire, barista hours, travel and delivery stay as the business set them.
 * Pure — used by the quote link page, its save action and tests.
 */

import { zonedTimeUTC } from "@/lib/format";

export interface EditLine {
  id: string; name: string; quantity: number; unit: string | null; unit_price: number; tax_rate: number;
  service_id: string | null; details: { kind?: string } | null; is_optional: boolean; section_id: string;
  category: string | null;
}
export interface EditService { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number; category: string | null }
export interface CustomerChange { set: { id: string; quantity: number }[]; remove: string[]; add: { service_id: string; quantity: number }[] }

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

/** What they can add: the catering on the price list, and — on equipment-hire quotes — the supplies. */
export const customerCatalogue = (services: EditService[], opts: { supplies?: boolean } = {}) =>
  services.filter((s) => isCatering(s.category) || (opts.supplies && isSupplies(s.category)));

const qty = (v: unknown, what: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_QTY) throw new Error(`${what}: choose a number from 1 to ${MAX_QTY.toLocaleString("en-AU")}.`);
  return n;
};

/** Check a change from the browser against the quote. Throws a plain-English message. Merges adds into existing lines. */
export function cleanChange(raw: unknown, lines: EditLine[], services: EditService[], perServe: Set<string>): CustomerChange {
  const r = (raw ?? {}) as Record<string, unknown>;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const canEdit = (id: string) => { const l = byId.get(id); if (!l || !customerCanChange(l, perServe)) throw new Error("That line can't be changed here — contact us and we'll update it."); return l; };
  const remove = [...new Set((Array.isArray(r.remove) ? r.remove : []).map(String))];
  remove.forEach(canEdit);
  const setMap = new Map<string, number>();
  for (const x of Array.isArray(r.set) ? r.set : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const l = canEdit(String(o.id));
    if (remove.includes(l.id)) continue;
    const n = qty(o.quantity, l.name);
    if (n !== Number(l.quantity)) setMap.set(l.id, n);
  }
  // (the caller passes only what this quote may add — supplies only on equipment-hire quotes)
  const catalogue = new Map(customerCatalogue(services, { supplies: true }).map((s) => [s.id, s]));
  const add: CustomerChange["add"] = [];
  for (const x of Array.isArray(r.add) ? r.add : []) {
    const o = (x ?? {}) as Record<string, unknown>;
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
  const out = { set: [...setMap.entries()].map(([id, quantity]) => ({ id, quantity })), remove, add };
  if (!out.set.length && !out.remove.length && !out.add.length) throw new Error("Nothing has changed.");
  const left = lines.filter((l) => !remove.includes(l.id)).length + add.length;
  if (left === 0) throw new Error("That would leave nothing on the quote — decline it instead, or contact us.");
  return out;
}

/** "added 40 × Lunch – Wraps; Muffins 60 → 80; took off Granola" */
export function changeText(c: CustomerChange, lines: EditLine[], services: EditService[]) {
  const name = (id: string) => lines.find((l) => l.id === id)?.name ?? "item";
  const parts = [
    ...c.add.map((a) => `added ${a.quantity} × ${services.find((s) => s.id === a.service_id)?.name ?? "item"}`),
    ...c.set.map((s) => `${name(s.id)} ${Number(lines.find((l) => l.id === s.id)?.quantity ?? 0)} → ${s.quantity}`),
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
