/**
 * "Come back and finish" reminders for unfinished checkouts and quotes — one set of words per website section.
 * Settings live in organisations.settings.reminders. Everything is OFF until the business switches it on.
 * Pure — no database.
 */

export type CartSection = "shop" | "classes" | "gifts" | "giftcards" | "events" | "catering";
export const CART_SECTIONS: CartSection[] = ["shop", "classes", "gifts", "giftcards", "events", "catering"];
export const SECTION_NAMES: Record<CartSection, string> = {
  shop: "Coffee shop", classes: "Classes", gifts: "Class gift certificates", giftcards: "Coffee gift cards", events: "Event hire quotes", catering: "Catering orders",
};

export interface Wording { subject: string; body: string; button: string }
export interface SectionReminder { on: boolean; firstAfterHours: number; second: boolean; secondAfterHours: number; first: Wording; last: Wording }
export interface ReminderSettings { enabled: boolean; sections: Record<CartSection, SectionReminder> }

/**
 * Words you can use: {first} first name · {summary} what they left · {date} their event date · {fomo} a live availability line
 * for event hire (e.g. "Our only coffee van is still free on Sat 14 Nov — for now.") · {business} your business name.
 */
export const DEFAULT_WORDING: Record<CartSection, { first: Wording; last: Wording }> = {
  shop: {
    first: { subject: "Your coffee's getting cold, {first}", body: "You left {summary} in your cart. Fresh roasts don't wait around — finish your order and we'll get them roasting.", button: "Finish my order" },
    last: { subject: "Your grinder's almost empty…", body: "Don't get caught without beans. {summary} is still waiting in your cart.", button: "Refill my beans" },
  },
  classes: {
    first: { subject: "Your seat's still warm, {first}", body: "You were part-way through booking {summary}. Classes are small and fill quickly — grab your spot while it's there.", button: "Finish booking" },
    last: { subject: "Last call for the class", body: "There may only be a few seats left in {summary}. Book now so you don't miss out.", button: "Book my seat" },
  },
  gifts: {
    first: { subject: "Your gift is half-wrapped, {first}", body: "You started a gift certificate for {summary}. Finish it in a minute — we'll send it whenever you like.", button: "Finish the gift" },
    last: { subject: "Still need that gift?", body: "A coffee class makes a gift people actually use. Your gift certificate is ready to finish.", button: "Finish the gift" },
  },
  giftcards: {
    first: { subject: "Your gift card is still brewing", body: "You started a coffee gift card ({summary}). Finish it and we'll deliver it right on time.", button: "Finish the gift card" },
    last: { subject: "Don't leave them hanging", body: "Your coffee gift card is one step away.", button: "Send the gift card" },
  },
  events: {
    first: { subject: "Lock in your date before someone else does", body: "You were building a quote for {summary}. {fomo} Finish your request and we'll email your quote.", button: "Finish my quote" },
    last: { subject: "Your date is still open — for now", body: "{fomo} Dates get snapped up quickly, especially for the van. Pick up where you left off.", button: "Check my date" },
  },
  catering: {
    first: { subject: "Lunch won't order itself, {first}", body: "Your catering order ({summary}) is still waiting. Finish it and we'll take care of the rest.", button: "Finish my order" },
    last: { subject: "Your platters are getting lonely", body: "Want us to look after the food? Your catering order is ready to send.", button: "Finish my order" },
  },
};

const defaultSection = (k: CartSection): SectionReminder => ({ on: false, firstAfterHours: 20, second: true, secondAfterHours: 48, ...DEFAULT_WORDING[k] });
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, sections: Object.fromEntries(CART_SECTIONS.map((k) => [k, defaultSection(k)])) as Record<CartSection, SectionReminder> };

const txt = (v: unknown, d: string, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : d);
const hours = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(24 * 14, n) : d; };
const wording = (v: unknown, d: Wording): Wording => { const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>; return { subject: txt(o.subject, d.subject, 120), body: txt(o.body, d.body, 600), button: txt(o.button, d.button, 40) }; };

export function readReminders(orgSettings: unknown): ReminderSettings {
  const raw = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).reminders : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return DEFAULT_REMINDERS;
  const secs = (raw.sections && typeof raw.sections === "object" ? raw.sections : {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    sections: Object.fromEntries(CART_SECTIONS.map((k) => {
      const d = defaultSection(k);
      const o = (secs[k] && typeof secs[k] === "object" ? secs[k] : {}) as Record<string, unknown>;
      return [k, { on: o.on === true, firstAfterHours: hours(o.firstAfterHours, d.firstAfterHours), second: o.second !== false, secondAfterHours: hours(o.secondAfterHours, d.secondAfterHours), first: wording(o.first, d.first), last: wording(o.last, d.last) }];
    })) as Record<CartSection, SectionReminder>,
  };
}

/** Fill in {first} {summary} {date} {fomo} {business}; unknown words are left out and spacing tidied. */
export function fill(t: string, v: Partial<Record<"first" | "summary" | "date" | "fomo" | "business", string>>) {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (v as Record<string, string | undefined>)[k] ?? "").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").replace(/,\s*$/, "").trim();
}

export interface CartRow { id: string; section: CartSection; email: string; name: string | null; summary: string | null; reminders_sent: number; last_reminded_at: string | null; updated_at: string; detail: Record<string, unknown> }

/** Which reminder (1st or 2nd) is due now, or null. */
export function dueReminder(c: Pick<CartRow, "reminders_sent" | "last_reminded_at" | "updated_at">, r: SectionReminder, now: Date): 1 | 2 | null {
  const h = (iso: string) => (now.getTime() - Date.parse(iso)) / 36e5;
  if (!r.on) return null;
  if (c.reminders_sent === 0 && h(c.updated_at) >= r.firstAfterHours) return 1;
  if (c.reminders_sent === 1 && r.second && c.last_reminded_at && h(c.last_reminded_at) >= r.secondAfterHours) return 2;
  return null;
}

/** The live availability line for event hire reminders. */
export function fomoLine(kind: string, date: string, free: number, total: number, label: string) {
  if (!date) return total === 1 ? `We only have one ${label.toLowerCase()}, so dates go quickly.` : "";
  const when = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  if (free <= 0) return `${when} has just been booked — reply and we'll help you find another option.`;
  if (total === 1) return `Our only ${label.toLowerCase()} is still free on ${when} — for now.`;
  if (free < total) return `Only ${free} of our ${total} ${label.toLowerCase()}s are still free on ${when}.`;
  return `Your date, ${when}, is still free.`;
}
