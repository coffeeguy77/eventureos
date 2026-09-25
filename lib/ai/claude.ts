/**
 * Claude provider for email classification + extraction.
 *
 * Messages API — https://platform.claude.com/docs/en/api/messages
 *   POST https://api.anthropic.com/v1/messages
 *   headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
 *   body: { model, max_tokens, system, messages: [{ role, content }], temperature }
 *   response: { content: [{ type: "text", text }], stop_reason, usage }
 * Model default: claude-haiku-4-5-20251001 (https://platform.claude.com/docs/en/models/overview), override with AI_MODEL.
 *
 * We ask for strict JSON in the prompt and validate it ourselves (no beta features needed).
 * Any failure throws — classify.ts catches it and falls back to the rules engine.
 * No `server-only` import so the classifier stays runnable under tsx; the key is only read from process.env on the server.
 */
import {
  CLASSIFICATIONS, emptyExtracted, stripQuoted, localDate,
  type ClassificationResult, type ClassifyContext, type EmailInput, type Extracted,
} from "./classify";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"; // https://platform.claude.com/docs/en/api/messages
export const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}
export function aiModel() {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

/** Call Claude and return the text of the first text block. Throws on HTTP error / timeout. */
export async function callClaude(system: string, user: string, { maxTokens = 800, timeoutMs = 12000 } = {}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify({
        model: aiModel(),
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Anthropic API ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text");
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Anthropic API timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a model reply. */
export function parseJSONObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI reply was not JSON");
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("AI reply was not a JSON object");
  return obj as Record<string, unknown>;
}

const SYSTEM = `You triage the shared inbox of an Australian event-services business (coffee carts, mobile bars, hire, catering).
Classify ONE email into exactly one of:
- event_enquiry: someone asking about a NEW event/booking/availability/pricing
- existing_event: about an event already booked or being planned with this business (logistics, numbers, access, timings)
- quote_discussion: discussing a quote/proposal/pricing already sent (questions, changes, acceptance)
- general_email: legitimate mail that is none of the above (newsletters, admin, personal)
- supplier: from a supplier/vendor (orders, deliveries, their invoices, price lists)
- spam: unsolicited marketing, scams, phishing
- needs_review: genuinely unclear
Also extract event details when present. Resolve relative dates ("this Saturday", "next month on the 5th") against the RECEIVED DATE given.
If unsure, lower the confidence; never invent values — use null.
Reply with ONLY a JSON object, no prose, exactly this shape:
{"classification":"event_enquiry|existing_event|quote_discussion|general_email|supplier|spam|needs_review","confidence":0.0-1.0,"reasons":["short reason", "..."],"extracted":{"event_type":string|null,"event_date":"YYYY-MM-DD"|null,"guest_count":number|null,"budget":number|null,"venue":string|null,"name":string|null,"email":string|null,"phone":string|null,"company":string|null}}`;

function validDate(s: unknown): string | null {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) ? s : null;
}
const strOrNull = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numOrNull = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function validateAIResult(obj: Record<string, unknown>): ClassificationResult {
  const c = obj.classification;
  if (typeof c !== "string" || !CLASSIFICATIONS.includes(c as never)) throw new Error(`AI returned unknown classification “${String(c)}”`);
  const conf = Number(obj.confidence);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error("AI returned an invalid confidence");
  const ex = (obj.extracted && typeof obj.extracted === "object" ? obj.extracted : {}) as Record<string, unknown>;
  const extracted: Extracted = {
    ...emptyExtracted(),
    event_type: strOrNull(ex.event_type, 80),
    event_date: validDate(ex.event_date),
    guest_count: numOrNull(ex.guest_count) ? Math.round(numOrNull(ex.guest_count)!) : null,
    budget: numOrNull(ex.budget),
    venue: strOrNull(ex.venue),
    name: strOrNull(ex.name),
    email: strOrNull(ex.email)?.toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)?.[0] ?? null,
    phone: strOrNull(ex.phone, 40),
    company: strOrNull(ex.company),
  };
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 200)).slice(0, 6) : [];
  return { classification: c as ClassificationResult["classification"], confidence: conf, reasons: ["AI: " + (reasons[0] ?? "classified by Claude"), ...reasons.slice(1)], extracted, provider: "ai" };
}

export async function classifyWithClaude(email: EmailInput, ctx: ClassifyContext, rules: ClassificationResult): Promise<ClassificationResult> {
  const received = localDate(email.received_at, ctx.timezone);
  const body = stripQuoted(email.body ?? "").slice(0, 6000);
  const context = [
    ctx.known_customer ? "Sender IS an existing customer." : "Sender is NOT a known customer.",
    ctx.customer_has_open_event ? "Their customer record has an upcoming/open event." : null,
    ctx.customer_has_open_quote ? "They have a quote awaiting a response." : null,
    ctx.known_thread ? `This is a reply in a thread previously classified ${ctx.known_thread.classification}.` : null,
    `A deterministic rules engine guessed ${rules.classification} (${Math.round(rules.confidence * 100)}%).`,
  ].filter(Boolean).join(" ");
  const user = `RECEIVED DATE: ${received} (timezone ${ctx.timezone})
CONTEXT: ${context}
FROM: ${email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email}
SUBJECT: ${email.subject ?? "(no subject)"}
BODY:
${body}`;
  const text = await callClaude(SYSTEM, user);
  return validateAIResult(parseJSONObject(text));
}
