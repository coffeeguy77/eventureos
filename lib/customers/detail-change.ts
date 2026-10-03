/**
 * Spot a client asking us to update their details ("our new address is…", "please use my new mobile…").
 * Nothing is changed automatically: the suggestion is saved on the email conversation and someone taps Apply.
 * `looksLikeDetailChange` / `ruleExtract` / `cleanSuggestion` are pure (tested with `npx tsx`).
 */
import { aiConfigured, callClaude } from "@/lib/ai/claude";

export type DetailField = "address" | "phone" | "email" | "company";
export const DETAIL_LABEL: Record<DetailField, string> = { address: "Address", phone: "Phone", email: "Email", company: "Company name" };

export interface DetailUpdate {
  fields: Partial<Record<DetailField, string>>;
  /** The email it came from */
  message_id: string;
  from: string;
  at: string;
  quote: string | null;
}

const INTENT = new RegExp([
  String.raw`\b(new|updated?|changed?|different|correct)\s+(postal\s+|billing\s+|business\s+|office\s+|street\s+|mailing\s+)?(address|phone|mobile|number|email|e-mail|contact details|details)\b`,
  String.raw`\b(change|update)\s+(of\s+)?(our|my|the)?\s*(postal\s+|billing\s+)?(address|phone|mobile|number|email|details|contact)\b`,
  String.raw`\bplease\s+(update|change|note|use)\b.{0,60}\b(address|phone|mobile|number|email|details)\b`,
  String.raw`\b(we('| ha)ve|i('| ha)ve|we are|we're)\s+(moved|relocated)\b`,
  String.raw`\b(invoices?|bills?)\s+(should|to)\s+(be\s+)?(sent|addressed|go)\s+to\b`,
  String.raw`\b(our|my)\s+(postal|billing|business|office|new)\s+address\s+(is|will be)\b`,
  String.raw`\bchanged?\s+(our|my|the)\s+(business|company|trading)\s+name\b`,
].join("|"), "i");

export function looksLikeDetailChange(text: string): boolean {
  return INTENT.test(text.slice(0, 4000));
}

const PHONE = /(?:\+?61\s?|0)(?:[2-478](?:[\s-]?\d){8}|4\d{2}(?:[\s-]?\d){6})/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const STATE = /\b(ACT|NSW|VIC|QLD|SA|WA|TAS|NT)\b\s*\d{4}\b/;

/** A rules-only guess, used when AI isn't set up (or fails): values that follow the change wording. */
export function ruleExtract(text: string): Partial<Record<DetailField, string>> {
  const out: Partial<Record<DetailField, string>> = {};
  const lines = text.slice(0, 4000).split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!INTENT.test(l) && !/\b(address|phone|mobile|email)\s*(is|:)/i.test(l)) continue;
    const window = [l, lines[i + 1] ?? "", lines[i + 2] ?? "", lines[i + 3] ?? ""].join("\n");
    if (/address|moved|relocated|sent to|addressed/i.test(l) && !out.address) {
      // The address: text after "is"/":" on this line, plus following lines up to the one with STATE + postcode
      const after = l.replace(/^.*?(?:\bis\b|:|\bto\b)\s*[:-]?\s*/i, "");
      const parts: string[] = [];
      if (after && after !== l) parts.push(after);
      for (let j = i + 1; j < Math.min(lines.length, i + 5) && !STATE.test(parts.join(" ")); j++) {
        if (!lines[j]) break;
        // Another "…address is:" line restarts the address after it
        if (INTENT.test(lines[j]) || /\baddress\b.*(:|\bis)\s*$/i.test(lines[j])) { parts.length = 0; const rest = lines[j].replace(/^.*(?::|\bis\b)\s*:?\s*/i, ""); if (rest && rest !== lines[j]) parts.push(rest); continue; }
        parts.push(lines[j]);
      }
      const addr = parts.join("\n").replace(/[.]+$/, "").trim();
      if (STATE.test(addr) && addr.length < 200) out.address = addr;
    }
    if (/phone|mobile|number/i.test(l) && !out.phone) { const m = window.match(PHONE); if (m) out.phone = m[0].replace(/\s+/g, " ").trim(); }
    if (/e-?mail/i.test(l) && !out.email) { const m = window.match(EMAIL); if (m) out.email = m[0].toLowerCase(); }
  }
  return out;
}

/** Keep only plausible values that differ from what's saved. */
export function cleanSuggestion(raw: Partial<Record<string, unknown>>, current: Partial<Record<DetailField, string | null>>): Partial<Record<DetailField, string>> {
  const out: Partial<Record<DetailField, string>> = {};
  const same = (a: string, b: string | null | undefined, f: DetailField) =>
    f === "phone" ? a.replace(/\D/g, "").replace(/^61/, "0") === (b ?? "").replace(/\D/g, "").replace(/^61/, "0")
      : a.trim().toLowerCase().replace(/\s+/g, " ") === (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const f of ["address", "phone", "email", "company"] as DetailField[]) {
    const v = typeof raw[f] === "string" ? (raw[f] as string).trim() : "";
    if (!v || v.length > 300) continue;
    if (f === "email" && !EMAIL.test(v)) continue;
    if (f === "phone" && v.replace(/\D/g, "").length < 8) continue;
    if (f === "address" && v.length < 8) continue;
    if (same(v, current[f], f)) continue;
    out[f] = f === "email" ? v.toLowerCase() : v;
  }
  return out;
}

const SYSTEM = `You read one email a client sent to an events business. Decide whether the client is asking the business to UPDATE THE CLIENT'S OWN saved contact details (their address, phone, email or business name). Event venues, delivery locations for a single event, and a person's signature that merely shows details are NOT updates. Reply with JSON only: {"update": boolean, "address": string|null, "phone": string|null, "email": string|null, "company": string|null, "quote": string|null}. "address" is the client's own postal/billing/business address written on separate lines with \\n. "quote" is the sentence that asks for the change (max 160 characters). Use null for anything not being changed.`;

/** Work out the suggested changes for one email. Returns null when there's nothing to suggest. */
export async function extractDetailChange(text: string, current: Partial<Record<DetailField, string | null>>): Promise<{ fields: Partial<Record<DetailField, string>>; quote: string | null } | null> {
  if (!looksLikeDetailChange(text)) return null;
  if (aiConfigured()) {
    try {
      const raw = await callClaude(SYSTEM, text.slice(0, 6000), { maxTokens: 400, timeoutMs: 12000 });
      const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
      if (json.update !== true) return null;
      const fields = cleanSuggestion(json, current);
      return Object.keys(fields).length ? { fields, quote: typeof json.quote === "string" ? json.quote.slice(0, 200) : null } : null;
    } catch { /* fall through to rules */ }
  }
  const fields = cleanSuggestion(ruleExtract(text), current);
  if (!Object.keys(fields).length) return null;
  const quote = text.split(/\r?\n/).find((l) => INTENT.test(l))?.trim().slice(0, 200) ?? null;
  return { fields, quote };
}
