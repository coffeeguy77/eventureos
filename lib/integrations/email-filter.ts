/**
 * Which Gmail messages EventureOS imports.
 *
 * Gmail stays the source of truth; EventureOS only copies conversations that are about the business.
 * Pure functions — no server-only / Next imports, so this runs under `npx tsx` tests too.
 *
 * Order of rules (first match wins):
 *   1. already-tracked conversation or known customer/contact  → import
 *   2. subject starts with a web-form subject line               → import (website enquiry)
 *   3. sender is a website form sender / always-import sender   → import
 *   4. sender is blocked                                         → skip
 *   5. filter mode "all"                                         → import (newsletters still skipped)
 *   6. newsletter / bulk mail                                    → skip
 *   7. subject or message mentions a keyword                     → import
 *   8. otherwise                                                 → skip (never stored)
 */

export type FilterMode = "matching" | "all";

export interface EmailFilterSettings {
  filter_mode?: FilterMode;
  filter_keywords?: string[];
  /** Web-form subject lines — matched against the START of the subject (a * matches anything). */
  website_subject_patterns?: string[];
  website_form_senders?: string[];
  filter_allow_senders?: string[];
  filter_block_senders?: string[];
}

export interface EmailFilter {
  mode: FilterMode;
  keywords: string[];
  subjectPrefixes: string[];
  formSenders: string[];
  allow: string[];
  block: string[];
}

/** Generic starting keywords for an event business. Each organisation edits its own list. */
export const DEFAULT_KEYWORDS = ["enquiry", "inquiry", "booking", "event", "hire", "catering", "quote", "wedding", "function"];
/** Automated senders that mention events but are never customer enquiries. */
export const DEFAULT_BLOCK = ["calendar-notification@google.com"];
/** EventureOS's own system emails (sign-in codes, confirmations) are never imported as business mail. */
export const PLATFORM_DOMAINS = ["eventureos.com.au"];

export function resolveFilter(s: EmailFilterSettings | null | undefined): EmailFilter {
  const clean = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);
  return {
    mode: s?.filter_mode === "all" ? "all" : "matching",
    keywords: s?.filter_keywords ? clean(s.filter_keywords) : DEFAULT_KEYWORDS,
    subjectPrefixes: clean(s?.website_subject_patterns),
    formSenders: clean(s?.website_form_senders).map((x) => x.toLowerCase()),
    allow: clean(s?.filter_allow_senders).map((x) => x.toLowerCase()),
    block: s?.filter_block_senders ? clean(s.filter_block_senders).map((x) => x.toLowerCase()) : DEFAULT_BLOCK,
  };
}

export interface FilterInput {
  subject: string | null;
  from_email: string;
  reply_to?: string | null;
  body: string | null;
  headers?: { list_unsubscribe?: boolean; precedence?: string | null };
  /** Part of a conversation EventureOS already tracks. */
  knownThread?: boolean;
  /** Sender (or the customer inside a web form) is an existing customer/contact. */
  knownPerson?: boolean;
}

export interface FilterDecision {
  import: boolean;
  reason: string;
  /** Matched a web-form subject line or form sender. */
  form?: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strip "Re:", "Fwd:", "FW:" prefixes (repeated). */
export function baseSubject(subject: string | null): string {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 5; i++) {
    const n = s.replace(/^(re|fw|fwd|aw|tr)\s*(\[\d+\])?\s*:\s*/i, "");
    if (n === s) break;
    s = n;
  }
  return s;
}

/** Does the subject start with this web-form subject line? `*` matches anything; case and extra spaces ignored. */
export function subjectStartsWith(subject: string | null, pattern: string): boolean {
  const p = pattern.trim().replace(/\s+/g, " ");
  if (!p) return false;
  const re = new RegExp("^" + p.split("*").map((part) => escapeRe(part).replace(/ /g, "\\s+")).join(".*"), "i");
  return re.test(baseSubject(subject).replace(/\s+/g, " "));
}

/** Word-start match with simple plural/verb endings: "event" matches "events", "hire" matches "hired"/"hiring". */
export function keywordRegex(keyword: string): RegExp | null {
  const k = keyword.trim().toLowerCase();
  if (!k) return null;
  const words = escapeRe(k).replace(/ +/g, "[\\s-]+");
  const tail = k.endsWith("e") ? "(s|d)?" : "(s|es|ed|ing)?";
  const alt = k.endsWith("e") && !k.includes(" ") ? `|${escapeRe(k.slice(0, -1))}ing` : "";
  return new RegExp(`(^|[^a-z0-9])(${words}${tail}${alt})(?![a-z0-9])`, "i");
}

export function senderMatches(email: string, list: string[]): string | null {
  const e = email.toLowerCase();
  const domain = e.split("@")[1] ?? "";
  for (const raw of list) {
    const x = raw.toLowerCase();
    if (x === e) return raw;
    const d = x.startsWith("@") ? x.slice(1) : !x.includes("@") ? x : null;
    if (d && (domain === d || domain.endsWith("." + d))) return raw;
  }
  return null;
}

/** Google/Outlook calendar invitations and RSVP replies ("Accepted: Coffee Cart…") — the calendar handles these. */
export function isCalendarNotice(subject: string | null, body: string | null): boolean {
  const subj = (subject ?? "").trim();
  if (/^(accepted|declined|tentative|tentatively accepted|invitation|updated invitation|new event|canceled event|cancelled event|event canceled|event cancelled|updated event)( with note)?\s*:/i.test(subj)) return true;
  return /invitation from google calendar|invitation\.ics|reply for .{1,120}\s+to\s+.{1,120}invitation/i.test((body ?? "").slice(-3000));
}

/** Automated / mass-mail senders: noreply@…, newsletter@…, or bulk mail subdomains like email.brand.com. */
export function isBulkSender(email: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (/^(no-?reply|do-?not-?reply|donotreply|newsletters?|news|marketing|mailer|mailer-daemon|notifications?|notify|updates?|promo(tions)?|offers|deals|digest|hello-noreply)([-_.+]|$)/.test(local)) return true;
  const labels = domain.split(".");
  return labels.length >= 3 && /^(email|emails|mail|mailer|e|em|news|newsletter|marketing|messaging|mkt|go|click|info)$/.test(labels[0]);
}

export function isNewsletter(input: Pick<FilterInput, "headers" | "body">): boolean {
  if (input.headers?.list_unsubscribe) return true;
  if (/bulk|list/i.test(input.headers?.precedence ?? "")) return true;
  const body = input.body ?? "";
  // Marketing mail puts an unsubscribe link in the footer
  return /\bunsubscribe\b|\bopt[\s-]?out\b|manage (your )?(email )?preferences|view (this email )?in (your )?browser/i.test(body.slice(-4000));
}

export function evaluateFilter(f: EmailFilter, m: FilterInput): FilterDecision {
  if (m.knownThread) return { import: true, reason: "Part of a conversation EventureOS already tracks" };
  if (m.knownPerson) return { import: true, reason: "From an existing customer or contact" };

  if (senderMatches(m.from_email, PLATFORM_DOMAINS)) return { import: false, reason: "EventureOS system email" };
  if (isCalendarNotice(m.subject, m.body)) return { import: false, reason: "Calendar invitation or reply — handled by the calendar, not enquiries" };

  const prefix = f.subjectPrefixes.find((p) => subjectStartsWith(m.subject, p));
  if (prefix) return { import: true, form: true, reason: `Subject starts with web-form subject “${prefix.trim()}”` };

  const from = m.from_email.toLowerCase();
  if (f.formSenders.includes(from)) return { import: true, form: true, reason: `${from} is a website form sender` };
  const allowed = senderMatches(from, f.allow);
  if (allowed) return { import: true, reason: `${from} is on your always-import list (${allowed})` };

  const blocked = senderMatches(from, f.block);
  if (blocked) return { import: false, reason: `${from} is on your never-import list (${blocked})` };

  if (isNewsletter(m) || isBulkSender(from)) return { import: false, reason: "Newsletter, marketing or automated email" };
  if (f.mode === "all") return { import: true, reason: "Importing all emails" };

  const text = `${baseSubject(m.subject)}\n${(m.body ?? "").slice(0, 6000)}`;
  for (const k of f.keywords) {
    const re = keywordRegex(k);
    if (re && re.test(text)) return { import: true, reason: `Mentions “${k.trim()}”` };
  }
  return { import: false, reason: "Doesn't match your keywords or web-form subjects" };
}

/**
 * A Gmail search expression that pre-selects likely matches for bulk scans (the local filter still decides).
 * Gmail operators: https://support.google.com/mail/answer/7190
 */
export function gmailQueryFor(f: EmailFilter): string | null {
  if (f.mode === "all") return null;
  const q = (s: string) => `"${s.replace(/["*]/g, " ").replace(/\s+/g, " ").trim()}"`;
  const terms = [
    ...f.keywords.map(q),
    ...f.subjectPrefixes.map((p) => `subject:${q(p.split("*")[0])}`),
    ...[...f.formSenders, ...f.allow].map((s) => `from:${s.replace(/^@/, "")}`),
  ].filter((t) => t.length > 2 && t !== '""' && t !== 'subject:""');
  if (!terms.length) return null;
  let out = "";
  for (const t of terms) { if ((out + " " + t).length > 900) break; out = out ? `${out} ${t}` : t; }
  return `{${out}}`;
}
