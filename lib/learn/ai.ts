/**
 * AI coach for the online course (moved from the Replit app's /ai/chat and /ai/analyze-v2, which used OpenAI).
 * Here it uses Claude through the Messages API, the same provider as the rest of EventureOS (lib/ai/claude.ts):
 *   POST https://api.anthropic.com/v1/messages — content blocks of { type: "text" } and
 *   { type: "image", source: { type: "base64", media_type, data } } (https://docs.claude.com/en/docs/build-with-claude/vision)
 * The coach prompts and personalities are the Replit app's, word for word.
 */
import { ANTHROPIC_URL, aiConfigured, aiModel, anthropicHeaders, parseJSONObject } from "@/lib/ai/claude";

export const COACH_MODES = {
  espresso: "You are an expert espresso technician called Bean Coach. Help diagnose and improve espresso shots. Be concise and practical.",
  milk: "You are a milk texturing expert called Bean Coach. Help with steaming technique and milk drinks. Be concise and practical.",
  latte_art: "You are a latte art specialist called Bean Coach. Analyze pours and give technique advice. Be concise and practical.",
  roasting: "You are a coffee roasting expert called Bean Coach. Help diagnose roast profiles and technique. Be concise and practical.",
  troubleshoot: "You are a barista equipment technician called Bean Coach. Help troubleshoot coffee equipment. Be concise and practical.",
  default: "You are an expert barista coach called Bean Coach. You help baristas improve their coffee skills. Be concise and practical.",
} as const;
export type CoachMode = keyof typeof COACH_MODES;

export const COACH_STYLES = {
  funny: " Use humour, coffee puns, and light-hearted jokes to make advice fun and memorable.",
  strict: " Be direct, precise, and no-nonsense. High standards, call out mistakes clearly, minimal fluff.",
  mentor: " Be warm, patient, and encouraging. Celebrate progress, guide with empathy and positive reinforcement.",
} as const;
export type CoachStyle = keyof typeof COACH_STYLES;

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export { aiConfigured };

export function coachSystem(mode: string, style: string, business: string) {
  const base = COACH_MODES[(mode in COACH_MODES ? mode : "default") as CoachMode];
  const st = COACH_STYLES[(style in COACH_STYLES ? style : "mentor") as CoachStyle];
  return `${base}${st} You are part of ${business}'s online barista course for Australian baristas: use Australian English, grams and °C. Keep answers under 200 words unless asked for more. If a question is about something unsafe or outside coffee, say so briefly.`;
}

type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: MediaType; data: string } };
export interface ChatTurn { role: "user" | "assistant"; content: string }

async function call(system: string, messages: { role: "user" | "assistant"; content: string | Block[] }[], maxTokens: number, timeoutMs = 30000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("The AI coach isn't set up yet (no ANTHROPIC_API_KEY).");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, { method: "POST", signal: ctrl.signal, headers: anthropicHeaders(key), body: JSON.stringify({ model: aiModel(), max_tokens: maxTokens, system, messages }) });
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!text) throw new Error("The AI didn't answer.");
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI coach took too long — try again.");
    throw e;
  } finally { clearTimeout(timer); }
}

/** One coach reply. The last user turn can carry a photo. History is trimmed to the last 12 turns. */
export async function coachReply(o: { mode: string; style: string; business: string; turns: ChatTurn[]; image?: { data: string; mediaType: MediaType } | null }) {
  const turns = o.turns.filter((t) => t.content.trim()).slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") throw new Error("Ask a question first.");
  const msgs: { role: "user" | "assistant"; content: string | Block[] }[] = turns;
  if (o.image) {
    const last = turns[turns.length - 1];
    msgs[msgs.length - 1] = { role: "user", content: [{ type: "image", source: { type: "base64", media_type: o.image.mediaType, data: o.image.data } }, { type: "text", text: last.content || "Analyse this image." }] };
  }
  return call(coachSystem(o.mode, o.style, o.business), msgs, 900);
}

export interface PhotoResult { scores: Record<string, number>; strengths: string[]; improvements: string[]; tips: string[]; overall: number }

/** Score a latte art or espresso photo (the Replit app's analyse prompt). */
export async function analysePhoto(o: { kind: "latte_art" | "espresso"; data: string; mediaType: MediaType }): Promise<PhotoResult> {
  const what = o.kind === "latte_art" ? "latte art" : "espresso shots";
  const system = `You are an expert barista coach analyzing ${what}. Return ONLY valid JSON with: scores (object with 4 relevant metrics 0-100), strengths (array of 2-3 strings), improvements (array of 2-3 strings), tips (array of 2-3 strings). If the photo isn't of ${o.kind === "latte_art" ? "a coffee with latte art" : "an espresso shot"}, return scores of 0 and say so in improvements.`;
  const text = await call(system, [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: o.mediaType, data: o.data } },
    { type: "text", text: `Analyze this ${o.kind === "latte_art" ? "latte art" : "espresso shot"} and return JSON.` },
  ] }], 800);
  return readPhoto(parseJSONObject(text));
}

export function readPhoto(obj: Record<string, unknown>): PhotoResult {
  const sc = (obj.scores && typeof obj.scores === "object" ? obj.scores : {}) as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(sc).slice(0, 6)) { const n = Number(v); if (Number.isFinite(n)) scores[k.slice(0, 30)] = Math.max(0, Math.min(100, Math.round(n))); }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 4) : []);
  const vals = Object.values(scores);
  return { scores, strengths: list(obj.strengths), improvements: list(obj.improvements), tips: list(obj.tips), overall: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0 };
}
