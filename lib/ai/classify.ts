/**
 * EventureOS email classification layer.
 *
 * Two providers behind one interface:
 *   1. A deterministic rules engine (always available, no network, fully testable).
 *   2. Claude (Anthropic Messages API) when ANTHROPIC_API_KEY is set. Any AI error,
 *      timeout or malformed answer falls back to the rules result — classification never fails.
 *
 * Nothing here discards mail: every message gets a classification, and anything the engine
 * is not sure about (confidence < 0.6) becomes `needs_review` so a person looks at it.
 *
 * This file must stay free of `server-only` / Next imports so it runs under `npx tsx`.
 */

export type Classification =
  | "event_enquiry" | "existing_event" | "quote_discussion" | "general_email" | "supplier" | "spam" | "needs_review";

export const CLASSIFICATIONS: Classification[] = [
  "event_enquiry", "existing_event", "quote_discussion", "general_email", "supplier", "spam", "needs_review",
];

/** Below this, a message is always routed to NEEDS REVIEW. */
export const REVIEW_THRESHOLD = 0.6;
/** At or above this, an event enquiry creates a "new" enquiry automatically. */
export const AUTO_ENQUIRY_THRESHOLD = 0.75;

export interface Extracted {
  event_type: string | null;
  /** ISO date (YYYY-MM-DD), relative phrases resolved against the received date in the org timezone. */
  event_date: string | null;
  guest_count: number | null;
  budget: number | null;
  venue: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export interface ClassificationResult {
  classification: Classification;
  confidence: number;
  reasons: string[];
  extracted: Extracted;
  provider: "rules" | "ai";
  /** True when the message is a website form notification (the customer is in the body, not the sender). */
  website_form?: boolean;
  /** When demoted to needs_review, what the engine would have guessed. */
  best_guess?: Classification;
}

export interface EmailInput {
  subject: string | null;
  from_email: string;
  from_name?: string | null;
  to?: string[];
  body: string | null;
  /** ISO timestamp the message was received. */
  received_at: string;
  headers?: { list_unsubscribe?: boolean; precedence?: string | null; auto_submitted?: string | null };
}

export interface ClassifyContext {
  timezone: string;
  /** The business's own addresses/domains — mail from these is outbound, and form notifications often come from them. */
  own_emails?: string[];
  /** Extra subject patterns (plain text, case-insensitive) that mark website form notifications. */
  website_subject_patterns?: string[];
  /** Addresses that send website form notifications (e.g. forms@yourdomain.com, wordpress@…). */
  website_form_senders?: string[];
  /** Sender matched an existing customer/contact. */
  known_customer?: boolean;
  /** Sender's customer has an open/upcoming event. */
  customer_has_open_event?: boolean;
  /** Sender's customer has a quote awaiting a response. */
  customer_has_open_quote?: boolean;
  /** Message is a reply in a thread EventureOS already tracks. */
  known_thread?: { classification: Classification; event_id?: string | null; enquiry_id?: string | null; has_quote?: boolean } | null;
  /** Sender is a known supplier (tagged, or previously classified supplier). */
  known_supplier?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
const norm = (s: string | null | undefined) => (s ?? "").replace(/\r/g, "");

export function emptyExtracted(): Extracted {
  return { event_type: null, event_date: null, guest_count: null, budget: null, venue: null, name: null, email: null, phone: null, company: null };
}

/** Remove quoted reply history ("On … wrote:", "> …", Outlook headers) so only the new text is analysed. */
export function stripQuoted(body: string): string {
  const lines = norm(body).split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*>/.test(l)) continue;
    if (/^On .{4,200}wrote:\s*$/i.test(l.trim())) break;
    if (/^On .{4,200}$/i.test(l.trim()) && /wrote:\s*$/i.test((lines[i + 1] ?? "").trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(l.trim())) break;
    if (/^From:\s.+/i.test(l.trim()) && /^(Sent|Date):\s.+/i.test((lines[i + 1] ?? "").trim())) break;
    if (/^_{8,}$/.test(l.trim())) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "Label: value" lines from website form notifications. */
export function parseFormFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const raw of norm(body).split("\n")) {
    const m = raw.match(/^\s*\*?\s*([A-Za-z][A-Za-z ()/#?'-]{0,40}?)\s*\*?\s*[:：]\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (!key || fields[key] !== undefined) continue;
    fields[key] = m[2].trim();
  }
  return fields;
}

function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const hit = Object.keys(fields).find((f) => f === k || f.startsWith(k + " ") || f.endsWith(" " + k));
    if (hit && fields[hit]) return fields[hit];
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

/** Local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(iso: string) {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}
/** Choose the year so the date is on/after the base date (people don't book events in the past). */
function nextOccurrence(base: string, m: number, d: number): string | null {
  const y = Number(base.slice(0, 4));
  const same = ymd(y, m, d);
  if (same && same >= base) return same;
  return ymd(y + 1, m, d);
}

/**
 * Find the event date in free text. Absolute dates win over relative phrases.
 * Relative phrases ("this Saturday", "next Friday", "tomorrow", "in 3 weeks") resolve against `base` (YYYY-MM-DD).
 */
export function extractDate(text: string, base: string): string | null {
  const t = text.replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  let m: RegExpMatchArray | null;

  // 2026-11-14
  if ((m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) return ymd(+m[1], +m[2], +m[3]);
  // 14/11/2026 or 14-11-26 (Australian day-first)
  if ((m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ymd(y, +m[2], +m[1]);
  }
  // 14 November 2026 / 14 Nov / Saturday 14 March
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:of\\s+)?(${monthNames})\\.?(?:,?\\s+(20\\d{2}))?\\b`, "i")))) {
    const mon = MONTHS[m[2].toLowerCase()];
    return m[3] ? ymd(+m[3], mon, +m[1]) : nextOccurrence(base, mon, +m[1]);
  }
  // November 14(, 2026)
  if ((m = t.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`, "i")))) {
    const mon = MONTHS[m[1].toLowerCase()];
    return m[3] ? ymd(+m[3], mon, +m[2]) : nextOccurrence(base, mon, +m[2]);
  }
  // 14/11 (no year)
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/))) {
    const r = nextOccurrence(base, +m[2], +m[1]);
    if (r) return r;
  }

  const lower = t.toLowerCase();
  if (/\btomorrow\b/.test(lower)) return addDays(base, 1);
  if (/\b(today|tonight)\b/.test(lower)) return base;
  if ((m = lower.match(/\bin\s+(\d{1,2}|a|one|two|three|four|five|six)\s+(day|week)s?\b/))) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const n = /^\d+$/.test(m[1]) ? +m[1] : words[m[1]];
    return addDays(base, m[2] === "week" ? n * 7 : n);
  }
  const wd = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
  if ((m = lower.match(new RegExp(`\\b(next|this|coming|on)?\\s*(${wd})\\b`)))) {
    // "sat" etc. only count when written as a word in a scheduling phrase
    const word = m[2];
    if (word.length <= 4 && !m[1]) return null;
    const target = WEEKDAYS[word];
    const cur = weekday(base);
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // "Saturday" said on a Saturday means next week
    // "next Saturday" is ambiguous in everyday use. We read it as the coming Saturday, unless that
    // is only 1–2 days away (then people almost always mean the week after).
    if (m[1] === "next" && diff <= 2) diff += 7;
    return addDays(base, diff);
  }
  if (/\bnext week\b/.test(lower)) return null; // too vague to pin to a day
  return null;
}

export function extractGuests(text: string): number | null {
  const t = text.replace(/,(\d{3})/g, "$1");
  const pats = [
    /\bguests?\s*(?:count|numbers?)?\s*[:：]\s*~?\s*(\d{1,5})/i,
    /(?:~|about|around|approx\.?|approximately|roughly|up to|expecting|for)?\s*(\d{1,5})\s*\+?\s*(?:guests|people|pax|attendees|delegates|staff|ppl|persons|heads|adults|kids|children|employees)\b/i,
    /\b(?:party|group|team|crowd)\s+of\s+(\d{1,5})\b/i,
    /\b(?:guests|people|pax|attendees|delegates|staff|employees|team)\s*\(\s*(?:~|about|approx\.?)?\s*(\d{1,5})\s*\+?\s*\)/i,
    /\bfor\s+(\d{2,5})\b(?!\s*(?:am|pm|hours?|hrs?|mins?|minutes|years?|th|st|nd|rd|%|\/|-|:|\$))/i,
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n < 100000) return n;
    }
  }
  return null;
}

export function extractBudget(text: string): number | null {
  const lab = text.match(/\bbudget\s*(?:is|of|around|about|approx\.?)?\s*[:：]?\s*(?:AUD|A\$|\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i);
  const dollar = text.match(/(?:AUD\s*|A\$|\$)\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i);
  const m = lab ?? dollar;
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?61[\s-]?|\(?0)(?:4\d{2}|[2378]\)?)[\s-]?\d{3,4}[\s-]?\d{3,4}\b/);
  if (m) return m[0].trim();
  const intl = text.match(/\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  return intl ? intl[0].trim() : null;
}

export function extractEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

const EVENT_TYPE_RULES: [RegExp, string][] = [
  [/\bengage(?:ment|d)\b/i, "Engagement"],
  [/\bwedding|marr(?:y|ied|iage)|bride|groom|nuptials|reception\b/i, "Wedding"],
  [/\bbirthday|\b\d{1,3}(?:st|nd|rd|th)\b(?!\s*(?:of|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))|bday\b/i, "Birthday"],
  [/\bconference|summit|expo|symposium|convention|delegates\b/i, "Conference"],
  [/\bfestival\b/i, "Festival"],
  [/\bmarkets?\b(?!ing)/i, "Market"],
  [/\bfilm(?:ing)?\b|\bshoot\b|\bproduction crew\b/i, "Film shoot"],
  [/\bcharity|fundrais|community|school|church|rotary|club\b/i, "Community"],
  [/\bcorporate|office|staff|team|company|workplace|launch|client event|end of year|eoy|christmas party|work\b/i, "Corporate"],
  [/\bparty|celebration|christening|baby shower|graduation|anniversary|housewarming|farewell\b/i, "Private party"],
];

export function extractEventType(text: string): string | null {
  for (const [re, label] of EVENT_TYPE_RULES) if (re.test(text)) return label;
  return null;
}

export function extractVenue(text: string): string | null {
  const lab = text.match(/\b(?:venue|location|where)\s*[:：]\s*(.{2,80})/i);
  if (lab) return lab[1].trim().replace(/[.;]+$/, "");
  const at = text.match(/\b(?:at|@)\s+(?:the\s+)?((?:[A-Z][\w'&-]+)(?:\s+(?:[A-Z][\w'&-]+|of|on|the)){0,4})/);
  if (at) {
    const v = at[1].replace(/\s+(of|on|the)$/i, "").trim();
    if (!/^(Home|Our|My|The|This|That|Night|Noon|Lunch|Dinner|Morning|Afternoon|Evening|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Around|About)$/i.test(v)) return v;
  }
  if (/\b(?:at|in)\s+(?:our|my)\s+(home|house|backyard|garden|place|office)\b/i.test(text)) return "Customer's " + RegExp.$1.toLowerCase();
  return null;
}

// ---------------------------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------------------------

const DEFAULT_FORM_SUBJECTS = [
  /\bnew (?:website )?enquiry\b/i, /\bnew (?:website )?inquiry\b/i, /\bnew form (?:submission|entry)\b/i, /\bform submission\b/i,
  /\bcontact form\b/i, /\bwebsite (?:enquiry|inquiry|form)\b/i, /\benquiry form\b/i, /\bnew submission\b/i,
  /\bquote request form\b/i, /\bbooking request form\b/i, /\bnew lead\b/i, /\bnew message from .*website\b/i,
];
const FORM_SENDER = /^(forms?|no-?reply|donotreply|do-not-reply|wordpress|webflow|squarespace|wix|jotform|typeform|formspree|gravityforms|website|web)@/i;

const SPAM_PATTERNS: [RegExp, number, string][] = [
  [/\b(seo|search engine optimi[sz]ation|backlinks?|google rankings?|first page of google|#1 on google)\b/i, 0.35, "SEO sales pitch"],
  [/\bguarantee(?:d)?\b/i, 0.15, "“guaranteed” claim"],
  [/\b(crypto|bitcoin|forex|investment opportunity|wire transfer|western union)\b/i, 0.4, "financial scam language"],
  [/\b(viagra|cialis|casino|lottery|you(?:'ve| have) won|claim your (?:prize|reward)|winner)\b/i, 0.5, "classic spam terms"],
  [/\b(dear (?:sir|madam|sir\/madam|business owner)|to whom it may concern)\b/i, 0.2, "generic salutation"],
  [/\b(web ?design services|app development services|lead generation|grow your business|increase your sales|boost your)\b/i, 0.3, "unsolicited marketing"],
  [/\b(verify your account|account (?:suspended|locked)|confirm your password|update your payment details)\b/i, 0.5, "phishing language"],
  [/!!!|\$\$\$|100% free|act now|limited time offer|click here/i, 0.2, "spammy formatting"],
];

const SUPPLIER_PATTERNS: [RegExp, string][] = [
  [/\b(purchase order|\bPO\s?#?\d+|order (?:confirmation|#|number)|your order|order has (?:shipped|been dispatched))\b/i, "order paperwork"],
  [/\b(delivery|deliveries|dispatch(?:ed)?|shipment|shipping|tracking number|consignment|courier|restock|stock level|back ?order)\b/i, "deliveries / stock"],
  [/\b(price list|wholesale|trade account|supplier|remittance|statement of account|account statement|credit terms|tax invoice)\b/i, "supplier terms"],
  [/\b(invoice (?:#|no\.?|number)?\s*\w*\s*(?:attached|is attached|enclosed)|please find (?:attached )?(?:our |your )?invoice|amount due|payment due)\b/i, "invoice from sender"],
];

const QUOTE_WORDS = /\b(quote|quotation|q-\d+|proposal|estimate|pricing|price|cost|deposit|accept(?:ed|ing)?|approve|go ahead|discount|package|invoice|inclusions?|add[- ]?on|revised|updated quote)\b/i;
const REQUEST_WORDS = /\b(availab(?:le|ility)|are you (?:guys |all |folks )?(?:free|around|available)|book(?:ing)?|hire|enquir(?:e|y|ing)|inquir(?:e|y|ing)|interested in|looking for|would (?:love|like)|could you|can you|do you (?:do|offer|provide|have)|send (?:me |us )?(?:a |some )?(?:quote|pricing|prices|info)|how much|rates?|packages?)\b/i;
const EVENT_WORDS = /\b(event|wedding|birthday|party|celebration|conference|corporate|function|launch|festival|market|engagement|christening|baby shower|graduation|anniversary|fundrais\w*|charity|gala|breakfast|lunch(?:eon)?|morning tea|afternoon tea|expo|reception|ceremony|shoot|\d{1,3}(?:st|nd|rd|th)\b)/i;
const SERVICE_WORDS = /\b(coffee|cart|barista|espresso|bar|bartend\w*|cocktails?|drinks|catering|caterer|photo ?booth|dj|band|marquee|hire|styling|florals?)\b/i;
const HEDGE_WORDS = /\b(not sure|maybe|might|possibly|just wondering|no rush|thinking about|tbc|tbd)\b/i;
const EXISTING_EVENT_WORDS = /\b(rsvp|run ?sheet|timings?|arrive|arrival|set ?up|bump[- ]?in|parking|access|gate|load(?:ing)? dock|power|generator|final numbers|confirmed numbers|on the day|see you|dietary|venue coordinator|schedule)\b/i;

function isOwn(email: string, ctx: ClassifyContext) {
  const e = email.toLowerCase();
  return (ctx.own_emails ?? []).some((o) => {
    const x = o.toLowerCase();
    return x.startsWith("@") ? e.endsWith(x) : e === x;
  });
}

export function isWebsiteForm(email: EmailInput, ctx: ClassifyContext): { form: boolean; reason?: string } {
  const subject = email.subject ?? "";
  const from = email.from_email.toLowerCase();
  if ((ctx.website_form_senders ?? []).some((s) => s.toLowerCase() === from)) return { form: true, reason: `Sender ${from} is a configured website form sender` };
  for (const p of ctx.website_subject_patterns ?? []) {
    if (p.trim() && subject.toLowerCase().includes(p.trim().toLowerCase())) return { form: true, reason: `Subject matches website form pattern “${p.trim()}”` };
  }
  const subjectHit = DEFAULT_FORM_SUBJECTS.find((re) => re.test(subject));
  if (subjectHit) return { form: true, reason: `Subject “${subject}” looks like a website form notification` };
  if (FORM_SENDER.test(from)) {
    const fields = parseFormFields(email.body ?? "");
    if (pick(fields, ["email", "e mail", "email address"]) && pick(fields, ["name", "full name", "your name", "first name"])) {
      return { form: true, reason: `Form-style sender ${from} with Name/Email fields` };
    }
  }
  return { form: false };
}

// ---------------------------------------------------------------------------------------------
// Rules engine
// ---------------------------------------------------------------------------------------------

export function extractAll(email: EmailInput, ctx: ClassifyContext, form: boolean): Extracted {
  const body = stripQuoted(email.body ?? "");
  const subject = email.subject ?? "";
  const text = `${subject}\n${body}`;
  const base = localDate(email.received_at, ctx.timezone);
  const fields = parseFormFields(body);
  const x = emptyExtracted();

  if (form) {
    const first = pick(fields, ["first name"]);
    const last = pick(fields, ["last name", "surname"]);
    x.name = pick(fields, ["name", "full name", "your name", "contact name"]) ?? ([first, last].filter(Boolean).join(" ") || null);
    x.email = (pick(fields, ["email", "e mail", "email address", "your email"]) ?? "").toLowerCase().match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? null;
    x.name ||= null; x.email ||= null;
    // WordPress-style forms: "From: Jenny Wang <jenny@example.com>"
    const fromField = pick(fields, ["from", "sender", "submitted by"]);
    const fm = fromField?.match(/^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>/);
    if (fm) { x.name ??= fm[1].trim() || null; x.email ??= fm[2].toLowerCase(); }
    else if (fromField && fromField.includes("@")) x.email ??= fromField.toLowerCase().match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? null;
    // "Coffee Cart Hire Message From Jenny Wang" — the name is in the subject
    x.name ??= subject.match(/\bmessage from\s+(.{2,80}?)\s*$/i)?.[1]?.replace(/["']/g, "").trim() || null;
    x.phone = pick(fields, ["phone", "mobile", "phone number", "contact number", "tel"]);
    x.company = pick(fields, ["company", "organisation", "organization", "business", "company name"]);
    const et = pick(fields, ["event type", "event", "type of event", "occasion"]);
    x.event_type = et ? extractEventType(et) ?? et.slice(0, 80) : null;
    const d = pick(fields, ["event date", "date", "preferred date", "date of event"]);
    x.event_date = d ? extractDate(d, base) : null;
    const g = pick(fields, ["guests", "guest count", "number of guests", "guest numbers", "attendees", "people", "pax", "numbers"]);
    x.guest_count = g ? Number(g.replace(/[^\d]/g, "")) || null : null;
    const b = pick(fields, ["budget", "approx budget", "estimated budget"]);
    x.budget = b ? extractBudget(b.includes("$") ? b : "$" + b) : null;
    x.venue = pick(fields, ["venue", "location", "event location", "address", "suburb"]);
  }

  const from = email.from_email.toLowerCase();
  x.email ??= form ? extractEmail(body) : from;
  x.name ??= form ? null : (email.from_name?.replace(/["']/g, "").trim() || null);
  x.phone ??= extractPhone(body);
  x.event_type ??= extractEventType(text);
  x.event_date ??= extractDate(body, base) ?? extractDate(subject, base);
  x.guest_count ??= extractGuests(text);
  x.budget ??= extractBudget(body);
  x.venue ??= extractVenue(body);
  if (!x.company) {
    const cm = body.match(/\b(?:from|at|with|on behalf of)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3}\s+(?:Pty\.? Ltd\.?|Ltd|Limited|Inc|Group|Consulting|Council|Club|Association|Foundation|Agency|Co\.?))\b/);
    if (cm) x.company = cm[1];
  }
  return x;
}

export function classifyRules(email: EmailInput, ctx: ClassifyContext): ClassificationResult {
  const reasons: string[] = [];
  const subject = email.subject ?? "";
  const body = stripQuoted(email.body ?? "");
  const text = `${subject}\n${body}`;
  const from = email.from_email.toLowerCase();

  const form = isWebsiteForm(email, ctx);
  const extracted = extractAll(email, ctx, form.form);
  const done = (classification: Classification, confidence: number): ClassificationResult => {
    let c = classification;
    let best_guess: Classification | undefined;
    const conf = clamp(confidence);
    if (conf < REVIEW_THRESHOLD && c !== "needs_review") {
      reasons.push(`Best guess “${c.replace("_", " ")}” is below ${Math.round(REVIEW_THRESHOLD * 100)}% confidence — needs a person to check`);
      best_guess = c;
      c = "needs_review";
    }
    return { classification: c, confidence: conf, reasons, extracted, provider: "rules", website_form: form.form || undefined, best_guess };
  };

  // 1. Website form notifications — predictable, captured automatically
  if (form.form) {
    reasons.push(form.reason!);
    if (extracted.email || extracted.name) {
      reasons.push(`Customer details found in the form: ${[extracted.name, extracted.email].filter(Boolean).join(", ")}`);
      return done("event_enquiry", 0.97);
    }
    reasons.push("Form notification without a name or email — check it manually");
    return done("event_enquiry", 0.55);
  }

  // 2. Replies in a thread we already track keep their context
  if (ctx.known_thread) {
    const kt = ctx.known_thread;
    if (kt.event_id) {
      if (kt.has_quote && QUOTE_WORDS.test(text)) {
        reasons.push("Reply in a tracked thread for an event with a quote, mentions the quote/pricing");
        return done("quote_discussion", 0.9);
      }
      reasons.push("Reply in a thread already linked to an event");
      return done(kt.classification === "quote_discussion" ? "quote_discussion" : "existing_event", 0.92);
    }
    if (kt.enquiry_id) {
      reasons.push("Reply in a thread already linked to an enquiry");
      return done(kt.classification === "needs_review" ? "event_enquiry" : kt.classification, 0.88);
    }
    if (kt.classification !== "needs_review") {
      reasons.push("Reply in a thread already classified");
      return done(kt.classification, 0.8);
    }
  }

  // 3. Spam
  let spam = 0;
  const spamWhy: string[] = [];
  for (const [re, w, why] of SPAM_PATTERNS) if (re.test(text)) { spam += w; spamWhy.push(why); }
  if (subject && subject.length > 8 && subject === subject.toUpperCase() && /[A-Z]{4}/.test(subject)) { spam += 0.15; spamWhy.push("all-caps subject"); }
  if ((body.match(/https?:\/\//g) ?? []).length >= 4) { spam += 0.15; spamWhy.push("many links"); }
  if (ctx.known_customer) spam -= 0.4;
  if (spam >= 0.45) {
    reasons.push(`Spam signals: ${spamWhy.join(", ")}`);
    return done("spam", Math.min(0.99, 0.6 + spam * 0.5));
  }

  if (isOwn(from, ctx)) {
    reasons.push("Sent from your own address");
    return done("general_email", 0.7);
  }

  // 4. Supplier (non-customers sending orders / deliveries / invoices)
  const supplierHits = SUPPLIER_PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
  if (ctx.known_supplier) {
    reasons.push("Sender is a known supplier");
    return done("supplier", 0.93);
  }
  if (!ctx.known_customer && supplierHits.length) {
    const eventish = EVENT_WORDS.test(text) && REQUEST_WORDS.test(text);
    if (!eventish) {
      reasons.push(`Supplier signals from a non-customer: ${supplierHits.join(", ")}`);
      return done("supplier", Math.min(0.92, 0.72 + supplierHits.length * 0.08));
    }
  }

  // 5. Known customers
  const quoteHit = QUOTE_WORDS.test(text);
  const eventHit = EVENT_WORDS.test(text);
  const requestHit = REQUEST_WORDS.test(text);
  if (ctx.known_customer) {
    if (ctx.customer_has_open_quote && quoteHit) {
      reasons.push("Customer has a quote awaiting a response and mentions the quote/pricing");
      return done("quote_discussion", 0.86);
    }
    const newEventSignal = requestHit && eventHit && (extracted.event_date || extracted.guest_count) && /\b(another|new|next|second|also|again)\b/i.test(text);
    if (newEventSignal) {
      reasons.push("Existing customer asking about another event");
      return done("event_enquiry", 0.8);
    }
    if (ctx.customer_has_open_event) {
      reasons.push("Sender is a customer with an upcoming event");
      if (EXISTING_EVENT_WORDS.test(text)) reasons.push("Mentions event logistics");
      return done("existing_event", EXISTING_EVENT_WORDS.test(text) ? 0.88 : 0.76);
    }
    if (quoteHit) {
      reasons.push("Existing customer discussing pricing or a quote");
      return done("quote_discussion", 0.7);
    }
    if (requestHit && eventHit) {
      reasons.push("Existing customer enquiring about an event");
      return done("event_enquiry", 0.82);
    }
    reasons.push("Sender is an existing customer (no open event)");
    return done("general_email", 0.62);
  }

  // 6. New event enquiry scoring
  let score = 0;
  const why: string[] = [];
  if (eventHit) { score += 0.3; why.push(`mentions an event (${(text.match(EVENT_WORDS) ?? [""])[0]})`); }
  if (SERVICE_WORDS.test(text)) { score += 0.1; why.push("mentions a service you provide"); }
  if (requestHit) { score += 0.2; why.push("asks about availability / booking / pricing"); }
  if (extracted.guest_count) { score += 0.15; why.push(`guest count ${extracted.guest_count}`); }
  if (extracted.event_date) { score += 0.1; why.push(`date ${extracted.event_date}`); }
  if (extracted.venue) { score += 0.05; why.push(`venue ${extracted.venue}`); }
  if (extracted.budget) { score += 0.05; why.push(`budget $${extracted.budget}`); }
  if (quoteHit && requestHit) { score += 0.05; }
  if (!eventHit && !extracted.guest_count) score = Math.min(score, 0.5); // no concrete event → never auto-trust
  if (HEDGE_WORDS.test(text)) { score -= 0.12; why.push("tentative wording"); }

  const bulk = email.headers?.list_unsubscribe || /^(bulk|list|junk)$/i.test(email.headers?.precedence ?? "") ||
    (email.headers?.auto_submitted && email.headers.auto_submitted !== "no") || /^(no-?reply|noreply|notifications?|news(letter)?|mailer-daemon|marketing)@/i.test(from);

  if (score >= 0.45) {
    reasons.push(`Looks like a new event enquiry: ${why.join(", ")}`);
    return done("event_enquiry", Math.min(0.95, 0.35 + score * 0.75));
  }
  if (bulk) {
    reasons.push("Automated / newsletter mail (List-Unsubscribe or no-reply sender)");
    return done("general_email", 0.8);
  }
  if (supplierHits.length) {
    reasons.push(`Possible supplier mail: ${supplierHits.join(", ")}`);
    return done("supplier", 0.62);
  }
  if (score > 0) {
    reasons.push(`Some enquiry signals but not enough to be sure: ${why.join(", ")}`);
    return done("event_enquiry", 0.3 + score * 0.6);
  }
  reasons.push("Unknown sender and no clear enquiry, supplier or spam signals");
  return done("needs_review", 0.4);
}

// ---------------------------------------------------------------------------------------------
// Public entry point: rules + optional AI
// ---------------------------------------------------------------------------------------------

export interface ClassifyOptions {
  /** Set false to force rules only (e.g. bulk historical import). */
  allowAI?: boolean;
  /** Override the AI call (tests). */
  ai?: (email: EmailInput, ctx: ClassifyContext, rules: ClassificationResult) => Promise<ClassificationResult>;
}

export async function classifyEmail(email: EmailInput, ctx: ClassifyContext, opts: ClassifyOptions = {}): Promise<ClassificationResult> {
  const rules = classifyRules(email, ctx);
  const aiEnabled = opts.allowAI !== false && (!!opts.ai || !!process.env.ANTHROPIC_API_KEY);
  // Website forms and tracked replies are deterministic — no need to spend an AI call.
  if (!aiEnabled || rules.website_form || (ctx.known_thread && rules.confidence >= 0.85)) return rules;
  try {
    const run = opts.ai ?? (await import("./claude")).classifyWithClaude;
    const ai = await run(email, ctx, rules);
    return mergeAI(rules, ai);
  } catch (e) {
    return { ...rules, reasons: [...rules.reasons, `AI classification unavailable (${e instanceof Error ? e.message : "error"}) — used rules`] };
  }
}

/** Take the AI's classification, keep rules-extracted values where the AI returned nothing, enforce the review threshold. */
export function mergeAI(rules: ClassificationResult, ai: ClassificationResult): ClassificationResult {
  const extracted = { ...rules.extracted };
  for (const k of Object.keys(extracted) as (keyof Extracted)[]) {
    const v = ai.extracted?.[k];
    if (v !== null && v !== undefined && v !== "") (extracted as Record<string, unknown>)[k] = v;
  }
  let classification = ai.classification;
  let best_guess: Classification | undefined = ai.classification === "needs_review" ? rules.best_guess : undefined;
  const confidence = clamp(ai.confidence);
  const reasons = [...ai.reasons];
  if (confidence < REVIEW_THRESHOLD && classification !== "needs_review") {
    reasons.push(`AI best guess “${classification.replace("_", " ")}” below ${Math.round(REVIEW_THRESHOLD * 100)}% — needs review`);
    best_guess = classification;
    classification = "needs_review";
  }
  if (rules.classification !== ai.classification) reasons.push(`Rules engine suggested “${rules.classification.replace("_", " ")}” (${Math.round(rules.confidence * 100)}%)`);
  return { classification, confidence, reasons, extracted, provider: "ai", website_form: rules.website_form, best_guess };
}
