/**
 * Spam scoring for incoming email. Pure and explainable: every point comes with a reason a person can read.
 * Score ≥ SPAM_THRESHOLD → the enquiry goes straight to the Spam folder (never deleted automatically).
 * Real event signals (a date, guest numbers, "quote", the business's own keywords) pull the score down,
 * so a genuine enquiry that happens to include a link or two is not caught.
 */

export const SPAM_THRESHOLD = 50;

/** Phrases that almost only appear in cold sales pitches and junk. Organisations add their own. */
export const DEFAULT_SPAM_PHRASES = [
  "seo services", "search engine optimization", "search engine optimisation", "rank your website", "first page of google",
  "backlink", "guest post", "link building", "domain authority", "website redesign", "web design services",
  "app development", "mobile app development", "outsourcing", "virtual assistant", "lead generation",
  "increase your sales", "increase your traffic", "boost your sales", "grow your business", "digital marketing agency",
  "social media management", "marketing proposal", "business loan", "merchant cash advance", "funding approved",
  "crypto", "bitcoin", "forex", "investment opportunity", "casino", "viagra", "cialis", "weight loss",
  "dear sir/madam", "dear sir or madam", "dear business owner", "kindly reply", "i came across your website",
  "i noticed your website", "quick question about your website", "unsubscribe from this list", "reply stop",
  "partnership opportunity", "sponsored post", "press release distribution", "buy followers", "google reviews",
  "we can help you get more", "price list attached", "invoice attached", "payment overdue notice",
];

export interface SpamInput {
  subject: string | null;
  from_email: string;
  from_name?: string | null;
  body: string | null;
  headers?: { list_unsubscribe?: boolean; precedence?: string | null };
  gmailSpam?: boolean;
  classifiedSpam?: boolean;
  /** The business's own keywords (e.g. "coffee cart") — genuine-enquiry signals. */
  keywords?: string[];
  extraPhrases?: string[];
}

export interface SpamVerdict { spam: boolean; score: number; reasons: string[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scoreSpam(m: SpamInput): SpamVerdict {
  const subject = (m.subject ?? "").trim();
  const body = (m.body ?? "").slice(0, 12000);
  const text = `${subject}\n${body}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, why: string) => { score += n; if (n > 0) reasons.push(why); };

  if (m.gmailSpam) add(100, "Gmail put it in spam");
  if (m.classifiedSpam) add(60, "Looks like unsolicited marketing or a scam");

  const phrases = [...new Set([...DEFAULT_SPAM_PHRASES, ...(m.extraPhrases ?? [])].map((p) => p.trim().toLowerCase()).filter(Boolean))];
  const hits = phrases.filter((p) => new RegExp(`(^|[^a-z0-9])${esc(p)}`, "i").test(text));
  if (hits.length) add(Math.min(70, hits.length * 25), `Spam words: ${hits.slice(0, 4).map((h) => `“${h}”`).join(", ")}${hits.length > 4 ? "…" : ""}`);

  const links = body.match(/https?:\/\/[^\s)>\]]+/gi) ?? [];
  if (links.length >= 6) add(15, `${links.length} links in the message`);
  if (links.some((l) => /\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|rb\.gy|cutt\.ly|shorturl\.at)\//i.test(l))) add(20, "Uses a link shortener");
  if (m.headers?.list_unsubscribe || /bulk|list/i.test(m.headers?.precedence ?? "")) add(20, "Sent as bulk/marketing mail");
  if (subject.length >= 8 && subject === subject.toUpperCase() && /[A-Z]{6,}/.test(subject)) add(10, "Subject is all capitals");
  if (/\b(re|fwd?):/i.test(subject) && !/\b(on .{5,80} wrote:|from:\s)/i.test(body)) add(10, "Pretends to be a reply");
  if (/[Ѐ-ӿ一-鿿]{8,}/.test(text)) add(15, "Written mostly in another script");
  const domain = m.from_email.split("@")[1] ?? "";
  if (/\.(xyz|top|click|icu|buzz|rest|monster|shop|live|site|online|store)$/i.test(domain)) add(15, `Sender domain .${domain.split(".").pop()}`);

  // Genuine event signals pull the score down
  const genuine: string[] = [];
  if (/\b\d{1,4}\s*(guests|people|pax|attendees|staff|coffees|cups)\b/i.test(text)) genuine.push("guest numbers");
  if (/\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/i.test(text)) genuine.push("a date");
  if (/\b(quote|quotation|availability|available on|book|booking|hire)\b/i.test(text)) genuine.push("asks about booking");
  const kw = (m.keywords ?? []).map((k) => k.trim().toLowerCase()).filter((k) => k.length > 2);
  if (kw.some((k) => text.includes(k))) genuine.push("mentions your services");
  if (genuine.length) score -= Math.min(45, genuine.length * 15);

  score = Math.max(0, Math.min(100, score));
  return { spam: score >= SPAM_THRESHOLD, score, reasons: reasons.length ? reasons : ["No spam signals"] };
}
