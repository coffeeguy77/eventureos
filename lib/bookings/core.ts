/**
 * Bookings — pure helpers shared by the server, the public booking page and the office screens.
 * No database or framework imports here, so they can be unit tested with node:test.
 */

export type BookingStatus = "held" | "confirmed" | "waitlist" | "cancelled" | "attended" | "no_show";
export type PaymentMethod = "stripe" | "gift" | "agency" | "office" | "free" | "external";
export type BookingSource = "website" | "wordpress" | "office" | "bookly" | "classbento" | "woocommerce" | "import";

export interface Question { id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; required?: boolean; options?: string[]; perAttendee?: boolean }

export interface CourseRow {
  id: string; slug: string; name: string; summary: string | null; description: string | null; duration_minutes: number; price: number; capacity: number;
  location: string | null; what_to_bring: string | null; image_url: string | null; colour: string | null; calendar_connection_id: string | null;
  active: boolean; public: boolean; position: number; max_seats_per_booking: number; waitlist: boolean; gift_enabled: boolean; agency_price: number | null;
  xero_item_code: string | null; xero_account_code: string | null; invoice_title: string | null; questions: Question[]; external_names: string[];
}
export interface SessionRow { id: string; course_id: string; starts_at: string; ends_at: string; capacity: number; price: number | null; status: "open" | "closed" | "cancelled"; external_seats: number; external_note: string | null; note: string | null; calendar_event_id: string | null }

/** Booking settings live in organisations.settings.booking (no hard-coded business values). */
export interface BookingSettings {
  enabled: boolean;
  hold_minutes: number;          // how long a seat is kept while someone pays (30+: the Stripe page expires then too)
  cancel_hours: number;          // customers can cancel/reschedule themselves up to this many hours before
  reminder_hours: number;        // reminder email this many hours before
  followup: boolean;             // thank-you / review email after the session
  review_url: string | null;     // e.g. a Google review link
  gift_expiry_months: number;    // Australian law: at least 36 months for gift certificates sold to consumers
  gift_amounts: number[];        // extra dollar amounts offered besides the course prices
  terms: string | null;          // shown at checkout
  intro: string | null;          // shown at the top of the booking page
  notify_email: string | null;   // who in the office gets "new booking" emails
  reply_to: string | null;       // replies to customer emails go here
  social: { facebook?: string; instagram?: string };
  show_seats_left: boolean;
  waitlist: boolean;
  /** Questions people ask, shown beside the booking form */
  faqs: { q: string; a: string }[];
  /** The public booking page as a landing page: search title/description, headline, photo, highlights and text sections */
  landing: Landing;
  /** Weekly timetable per course: sessions are kept open this many days ahead automatically */
  schedules: Schedule[];
  /** Closed periods (e.g. Christmas): no timetable sessions are created on these dates */
  closures: Closure[];
}

export interface Schedule { course_id: string; weekdays: number[]; times: string[]; days_ahead: number; active: boolean }
export interface Closure { from: string; to: string; label: string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function readSchedules(raw: unknown): Schedule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const weekdays = Array.isArray(o.weekdays) ? [...new Set(o.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : [];
    const times = Array.isArray(o.times) ? [...new Set(o.times.filter((t): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, 6) : [];
    const n = Number(o.days_ahead);
    return { course_id: typeof o.course_id === "string" ? o.course_id : "", weekdays, times, days_ahead: Number.isFinite(n) ? Math.max(14, Math.min(365, Math.round(n))) : 60, active: o.active !== false };
  }).filter((x) => /^[0-9a-f-]{36}$/i.test(x.course_id) && x.weekdays.length && x.times.length);
}
export function readClosures(raw: unknown): Closure[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const from = typeof o.from === "string" && DATE.test(o.from) ? o.from : "", to0 = typeof o.to === "string" && DATE.test(o.to) ? o.to : from;
    return { from, to: to0 < from ? from : to0, label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 80) : null };
  }).filter((x) => x.from);
}
/** Dates (YYYY-MM-DD) a timetable should have sessions on, from `today` for its days ahead, skipping closures. */
export function scheduleDates(sc: Schedule, closures: Closure[], today: string) {
  const end = new Date(Date.parse(today + "T00:00:00Z") + sc.days_ahead * 86400e3).toISOString().slice(0, 10);
  const closed = (d: string) => closures.some((c) => d >= c.from && d <= c.to);
  return sc.weekdays.flatMap((w) => repeatDates(today, end, w, 1)).filter((d) => !closed(d)).sort();
}

export interface Landing {
  title: string | null;          // search result title, e.g. "Barista Courses Canberra | Bean Culture"
  description: string | null;    // search result description (about 150 characters)
  headline: string | null;       // big heading at the top of the page
  heroImage: string | null;      // https photo for the top of the page (falls back to the first course photo)
  highlights: string[];          // short selling points under the headline
  sections: { heading: string; body: string }[]; // text further down the page (helps people find it in search)
}
export const DEFAULT_LANDING: Landing = { title: null, description: null, headline: null, heroImage: null, highlights: [], sections: [] };

export function readLanding(raw: unknown): Landing {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter((x): x is string => !!x).slice(0, max) : []);
  return {
    title: str(o.title, 70), description: str(o.description, 300), headline: str(o.headline, 120), heroImage: url(o.heroImage),
    highlights: list(o.highlights, 6, 60),
    sections: Array.isArray(o.sections) ? (o.sections as unknown[]).map((x) => (x && typeof x === "object" ? { heading: str((x as Record<string, unknown>).heading, 120) ?? "", body: str((x as Record<string, unknown>).body, 3000) ?? "" } : null))
      .filter((x): x is { heading: string; body: string } => !!x && !!x.heading && !!x.body).slice(0, 8) : [],
  };
}

export const DEFAULT_SETTINGS: BookingSettings = {
  enabled: true, hold_minutes: 30, cancel_hours: 48, reminder_hours: 48, followup: true, review_url: null,
  gift_expiry_months: 36, gift_amounts: [], terms: null, intro: null, notify_email: null, reply_to: null, social: {}, show_seats_left: true, waitlist: true, faqs: [], landing: DEFAULT_LANDING, schedules: [], closures: [],
};

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const str = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const url = (v: unknown) => { const s = str(v, 500); return s && /^https:\/\//i.test(s) ? s : null; };

export function readSettings(orgSettings: unknown): BookingSettings {
  const raw = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).booking : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const social = (raw.social && typeof raw.social === "object" ? raw.social : {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled !== false,
    hold_minutes: num(raw.hold_minutes, DEFAULT_SETTINGS.hold_minutes, 30, 120), // Stripe Checkout can't expire sooner than 30 minutes
    cancel_hours: num(raw.cancel_hours, DEFAULT_SETTINGS.cancel_hours, 0, 24 * 30),
    reminder_hours: num(raw.reminder_hours, DEFAULT_SETTINGS.reminder_hours, 0, 24 * 14),
    followup: raw.followup !== false,
    review_url: url(raw.review_url),
    gift_expiry_months: num(raw.gift_expiry_months, DEFAULT_SETTINGS.gift_expiry_months, 36, 120),
    gift_amounts: Array.isArray(raw.gift_amounts) ? [...new Set(raw.gift_amounts.map(Number).filter((n) => Number.isFinite(n) && n >= 5 && n <= 5000).map((n) => Math.round(n)))].slice(0, 6) : [],
    terms: str(raw.terms, 4000), intro: str(raw.intro, 1000),
    notify_email: str(raw.notify_email, 254), reply_to: str(raw.reply_to, 254),
    social: { facebook: url(social.facebook) ?? undefined, instagram: url(social.instagram) ?? undefined },
    show_seats_left: raw.show_seats_left !== false,
    waitlist: raw.waitlist !== false,
    faqs: Array.isArray(raw.faqs) ? (raw.faqs as unknown[]).map((f) => (f && typeof f === "object" ? { q: str((f as Record<string, unknown>).q, 200) ?? "", a: str((f as Record<string, unknown>).a, 2000) ?? "" } : null))
      .filter((f): f is { q: string; a: string } => !!f && !!f.q && !!f.a).slice(0, 12) : [],
    landing: readLanding(raw.landing),
    schedules: readSchedules(raw.schedules), closures: readClosures(raw.closures),
  };
}

// ------------------------------------------------------------------ seats

export interface SeatCount { capacity: number; taken: number; left: number; full: boolean }
export function seatCount(capacity: number, booked: number, external: number): SeatCount {
  const taken = Math.max(0, booked) + Math.max(0, external);
  const left = Math.max(0, capacity - taken);
  return { capacity, taken, left, full: left <= 0 };
}
/** Seats that count against capacity, from booking rows (same rule as booking_seats_taken() in the database). */
export function bookedSeats(rows: { seats: number; status: string; hold_expires_at: string | null }[], now = Date.now()) {
  return rows.reduce((t, b) => t + (["confirmed", "attended", "no_show"].includes(b.status) || (b.status === "held" && b.hold_expires_at && Date.parse(b.hold_expires_at) > now) ? b.seats : 0), 0);
}

// ------------------------------------------------------------------ codes & text

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
/** e.g. GIFT-7KQ9-M3XA — easy to read out over the phone. `rand` returns bytes (crypto in production). */
export function giftCode(rand: (n: number) => Uint8Array, prefix = "GIFT") {
  const b = rand(8);
  const c = Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
  return `${prefix}-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}
export const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "course";
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const cleanEmail = (s: unknown) => { const e = typeof s === "string" ? s.trim().toLowerCase() : ""; return EMAIL_RE.test(e) && e.length <= 254 ? e : null; };
export const cleanPhone = (s: unknown) => { const p = typeof s === "string" ? s.replace(/[^\d+() -]/g, "").trim() : ""; return p.replace(/\D/g, "").length >= 8 ? p.slice(0, 40) : null; };

// ------------------------------------------------------------------ time

/** "Saturday 10 October 2026" / "10:00 am – 2:00 pm" in the organisation's timezone. */
export function sessionWhen(startsAt: string, endsAt: string, tz: string) {
  const s = new Date(startsAt), e = new Date(endsAt);
  const day = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(s);
  const short = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(s);
  const t = (d: Date) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d).replace(/\s?(am|pm)$/i, (m) => m.trim().toLowerCase());
  return { day, short, time: `${t(s)} – ${t(e)}`, start: t(s), dateKey: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s) };
}

export function hoursUntil(startsAt: string, now = Date.now()) { return (Date.parse(startsAt) - now) / 3_600_000; }

// ------------------------------------------------------------------ calendar file

const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}
export function icsEvent(o: { uid: string; start: string; end: string; title: string; description?: string; location?: string | null; url?: string; organiser?: string; now?: Date }) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventureOS//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `DTSTAMP:${icsTime((o.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsTime(o.start)}`,
    `DTEND:${icsTime(o.end)}`,
    `SUMMARY:${icsEsc(o.title)}`,
    ...(o.description ? [`DESCRIPTION:${icsEsc(o.description)}`] : []),
    ...(o.location ? [`LOCATION:${icsEsc(o.location)}`] : []),
    ...(o.url ? [`URL:${o.url}`] : []),
    ...(o.organiser ? [`ORGANIZER;CN=${icsEsc(o.organiser)}:mailto:noreply@eventureos.com.au`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT24H", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(o.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
/** Google Calendar "add event" link. */
export function googleCalendarLink(o: { start: string; end: string; title: string; details?: string; location?: string | null }) {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", o.title);
  u.searchParams.set("dates", `${icsTime(o.start)}/${icsTime(o.end)}`);
  if (o.details) u.searchParams.set("details", o.details.slice(0, 1500));
  if (o.location) u.searchParams.set("location", o.location);
  return u.toString();
}

// ------------------------------------------------------------------ agency invoices

/**
 * The invoice line for an agency (employment services) booking, in the layout the business already uses in Xero:
 *   Barista Training
 *   Looking for work course
 *   JANE CITIZEN 10/10/2026
 *
 *   EF Purchase Order : E0668613
 *   Purchasing Site Belconnen - WAES
 *   Sureway Contact Jason Bell
 * The title comes from the course (invoice_title, else the course name); the PO / site / contact wording from the agency.
 */
export function agencyLineDescription(o: { title: string; student: string; dateKey: string; po: string | null; site: string | null; contact: string | null; contactLabel: string; poLabel?: string; siteLabel?: string }) {
  const [y, m, d] = o.dateKey.split("-");
  const lines = [...o.title.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), `${o.student.trim().toUpperCase()} ${d}/${m}/${y}`];
  const po = [o.po && `${(o.poLabel ?? "Purchase Order :").trim()} ${o.po.trim()}`, o.site && `${(o.siteLabel ?? "Purchasing Site").trim()} ${o.site.trim()}`, o.contact && `${o.contactLabel.trim() || "Contact"} ${o.contact.trim()}`].filter(Boolean) as string[];
  return (po.length ? [...lines, "", ...po] : lines).join("\n").slice(0, 4000);
}

/** GST-inclusive amount → ex-GST subtotal and GST (10%), to the cent. */
export function splitGst(inclusive: number) {
  const total = Math.round(inclusive * 100) / 100;
  const sub = Math.round((total / 1.1) * 100) / 100;
  return { subtotal: sub, tax: Math.round((total - sub) * 100) / 100, total };
}

// ------------------------------------------------------------------ sessions generator

/**
 * Dates for a repeating session: every `weekday` (0 = Sunday) between from and to (inclusive), as YYYY-MM-DD.
 * `every` = 1 weekly, 2 fortnightly. Skips dates in `skip`.
 */
export function repeatDates(from: string, to: string, weekday: number, every = 1, skip: string[] = []) {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  if (!(start <= end)) return out;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  while (d <= end && out.length < 200) {
    const k = d.toISOString().slice(0, 10);
    if (!skip.includes(k)) out.push(k);
    d.setUTCDate(d.getUTCDate() + 7 * Math.max(1, every));
  }
  return out;
}

// ------------------------------------------------------------------ sharing

/** A link with UTM tags, so bookings show where they came from (Facebook, Instagram, a QR flyer…). */
export function shareLink(base: string, source: string, medium = "social", campaign = "booking") {
  const u = new URL(base);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
export function pickUtm(sp: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "ref"]) {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s && typeof s === "string") out[k] = s.slice(0, 100);
  }
  return out;
}

// ------------------------------------------------------------------ spreadsheet dates

/** 10/10/2026, 2026-10-10, 10 Oct 2026, Saturday 10 October 2026 → 2026-10-10 (Australian day-first order) */
export function parseDate(s: string): string | null {
  const v = (s ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i.exec(v);
  if (m) { const mo = months.indexOf(m[2].toLowerCase()); if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
/** 10:00, 10am, 2:30 pm, 14:30 (also inside "2026-10-10 10:00" or "Sat 10 Oct 2026, 2:30pm") → HH:MM */
export function parseTime(s: string): string | null {
  const v = (s ?? "").trim();
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(v) ?? /\b(\d{1,2})()\s*(am|pm)\b/i.exec(v) ?? /^(\d{1,2})()()$/.exec(v);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
